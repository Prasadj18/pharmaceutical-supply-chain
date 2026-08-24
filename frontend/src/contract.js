import { ethers } from "ethers";
import SupplyChain from "./SupplyChain.json";

// NOTE: if you redeploy the contract, replace this address with whatever
// `npx hardhat run scripts/deploy.js --network localhost` prints, and
// also update CONTRACT_ADDRESS in blockchain/.env to match.
export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
export const RPC_URL = "http://127.0.0.1:8545";
export const LOCAL_CHAIN_ID = 31337n; // ethers v6 uses BigInt for chainId

let cachedProvider = null;

/**
 * A plain ethers provider pointed straight at the local Hardhat RPC.
 * Used for reads only — no browser extension required, works even if
 * MetaMask isn't installed, so Fetch Batch / History always work.
 */
export const getProvider = () => {
  if (!cachedProvider) {
    cachedProvider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return cachedProvider;
};

/**
 * Read-only contract instance.
 */
export const getReadOnlyContract = () => {
  return new ethers.Contract(CONTRACT_ADDRESS, SupplyChain.abi, getProvider());
};

/**
 * Local ETH balance for an address, formatted like "9.998". Reads via
 * the plain RPC provider, not MetaMask, so it works before connecting.
 */
export const getBalance = async (address) => {
  const provider = getProvider();
  const balanceWei = await provider.getBalance(address);
  return ethers.formatEther(balanceWei);
};

/**
 * Confirms the local Hardhat node is reachable at all, independent of
 * MetaMask, so the UI can show a clear message if `npx hardhat node`
 * isn't running.
 */
export const isChainReachable = async () => {
  try {
    const provider = getProvider();
    const network = await provider.getNetwork();
    return network.chainId === LOCAL_CHAIN_ID;
  } catch {
    return false;
  }
};

/**
 * Is MetaMask installed at all?
 */
export const isMetaMaskAvailable = () => typeof window !== "undefined" && !!window.ethereum;

/**
 * Ask MetaMask which account(s) it currently has connected to this site
 * (triggers the connect popup the first time). Returns the first
 * connected address, or null if MetaMask isn't installed / user
 * rejects.
 */
export const getMetaMaskAddress = async () => {
  if (!isMetaMaskAvailable()) return null;
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    return accounts?.[0] || null;
  } catch {
    return null; // user rejected the connection request
  }
};

/**
 * Confirms MetaMask is pointed at the local Hardhat network
 * (chainId 31337) — writes would otherwise silently target the wrong
 * chain (e.g. a real testnet) if someone had MetaMask on a different
 * network already.
 */
export const isMetaMaskOnCorrectNetwork = async () => {
  if (!isMetaMaskAvailable()) return false;
  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  return network.chainId === LOCAL_CHAIN_ID;
};

/**
 * Ask MetaMask to switch to (or add, if missing) the local Hardhat
 * network. Only ever adds a network pointing at 127.0.0.1 — never
 * touches real Ethereum mainnet or public testnets.
 */
export const switchMetaMaskToLocalNetwork = async () => {
  if (!isMetaMaskAvailable()) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x7A69" }], // 31337 in hex
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x7A69",
            chainName: "Hardhat Localhost 8545 (Development Only)",
            rpcUrls: [RPC_URL],
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
};

/**
 * Forces MetaMask's account-selection popup to appear, even if this
 * site already has permission for one or more accounts. Plain
 * eth_requestAccounts — and even wallet_requestPermissions on its own —
 * will silently resolve with whatever's already permitted/active
 * without showing a chooser once permission has been granted before.
 * To guarantee the picker actually opens every time, we first revoke
 * any existing eth_accounts permission (supported by modern MetaMask,
 * EIP-2255) and then request it fresh. If revoke isn't supported by
 * the installed MetaMask version, we just continue anyway — worst
 * case, behaviour falls back to the old silent-resolve behaviour for
 * that one click.
 * Returns the freshly-selected address, or null if the user closes /
 * rejects the popup, or if MetaMask isn't installed.
 */
export const requestMetaMaskAccountSelection = async () => {
  if (!isMetaMaskAvailable()) return null;
  try {
    await window.ethereum.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    // Not supported by this MetaMask version, or nothing to revoke —
    // fine, fall through and try requesting anyway.
  }
  try {
    await window.ethereum.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    return accounts?.[0] || null;
  } catch {
    return null; // user closed/rejected the picker
  }
};

/**
 * Whatever account MetaMask already has connected to this site, without
 * prompting for a fresh selection. Used as the fallback when the user
 * dismisses/cancels the account-picker popup — rather than treating
 * that as a hard failure, we just check whichever account was already
 * connected before they clicked Connect.
 */
export const getCurrentlyConnectedAccount = async () => {
  if (!isMetaMaskAvailable()) return null;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    return accounts?.[0] || null;
  } catch {
    return null;
  }
};

/**
 * A contract instance signed by MetaMask's currently connected account.
 * Calling any write function on this (registerBatch, transferOwnership,
 * markDelivered, assignRole) will pop up MetaMask's own confirmation
 * screen — the user must explicitly approve or reject it. This is the
 * real security boundary: no code path in this app can send a
 * transaction without that popup appearing.
 */
export const getMetaMaskContract = async () => {
  if (!isMetaMaskAvailable()) {
    throw new Error("MetaMask is not installed. Install it, then import your account (see signup instructions).");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return new ethers.Contract(CONTRACT_ADDRESS, SupplyChain.abi, signer);
};
