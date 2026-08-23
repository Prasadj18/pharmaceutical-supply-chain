import { ethers } from "ethers";
import SupplyChain from "./SupplyChain.json";

const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const metamaskInstallUrl = "https://metamask.io/download.html";

export const getContract = async () => {
  if (typeof window === "undefined") {
    alert("No browser environment detected.");
    return null;
  }

  const ethereum = window.ethereum;

  if (!ethereum) {
    const install = confirm(
      "MetaMask is not installed. Would you like to open the MetaMask download page?"
    );
    if (install) window.open(metamaskInstallUrl, "_blank");
    return null;
  }

  if (!ethereum.request) {
    alert(
      "An Ethereum provider was detected but it doesn't support requests. Ensure MetaMask is installed and enabled."
    );
    return null;
  }

  try {
    // Ask the user to connect accounts (this opens the MetaMask popup)
    await ethereum.request({ method: "eth_requestAccounts" });
  } catch (err) {
    console.error("Account access request failed:", err);
    alert("Please connect an account in MetaMask to continue.");
    return null;
  }

  try {
    const provider = new ethers.BrowserProvider(ethereum);
    const signer = await provider.getSigner();

    // Ensure there is an unlocked account
    try {
      await signer.getAddress();
    } catch (err) {
      console.error("No unlocked account found:", err);
      alert("No unlocked account found — please unlock MetaMask and try again.");
      return null;
    }

    return new ethers.Contract(contractAddress, SupplyChain.abi, signer);
  } catch (err) {
    console.error("Failed to create contract instance:", err);
    alert("Failed to connect to MetaMask provider.");
    return null;
  }
};