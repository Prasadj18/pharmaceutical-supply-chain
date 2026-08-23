// blockchain/server.js  (formerly faucet-server.js)
//
// ============================================================
// DEVELOPMENT-ONLY LOCAL BACKEND
// ============================================================
//
// This single Node.js server now does four jobs for your capstone demo:
//
// 1. SIGN UP  — create a participant account (username, password, role,
//    city). Behind the scenes it also generates a brand-new blockchain
//    wallet for that user and funds it with 10 test ETH, so they never
//    have to touch MetaMask or private keys manually.
//
// 2. LOG IN   — verify username + password, then hand back that user's
//    wallet private key so the FRONTEND can sign blockchain transactions
//    as them, for this session only.
//
// 3. USER DIRECTORY — lets the frontend search "who is this username?"
//    (for the Transfer Ownership recipient picker) and "who owns this
//    address?" (to show names instead of raw addresses in Fetch/History).
//
// 4. FAUCET   — unchanged from before: top up a wallet with 10 test ETH
//    when its balance runs low.
//
// ============================================================
// WHY A SERVER HOLDS PRIVATE KEYS AT ALL (READ THIS FOR YOUR VIVA)
// ============================================================
// On a REAL blockchain, a server never holds or transmits a user's
// private key — that key must stay only on the user's own device
// (that's the entire point of a wallet like MetaMask). Doing what this
// server does — generating keys and sending them to the browser on
// login — would be a serious security vulnerability in production.
//
// It is acceptable ONLY here because:
//   - This runs entirely on your own laptop (127.0.0.1), never on the
//     public internet.
//   - The blockchain itself is Hardhat's local throwaway network —
//     the "ETH" involved has no real value and resets every time you
//     restart `npx hardhat node`.
//   - The goal is to demonstrate supply-chain traceability concepts
//     without asking every classmate/examiner to install MetaMask and
//     manually import private keys — a genuine usability problem for a
//     live demo.
//
// A real deployment would instead have each user hold their own wallet
// (MetaMask, a mobile wallet, etc.) and only ever sign transactions
// locally on their device — the server would never see the key.
//
// ============================================================
// WHERE DATA LIVES
// ============================================================
// users.json (same folder) — a simple local JSON "database" of accounts.
// This file is git-ignored (see .gitignore) because it contains private
// keys, even though those keys are worthless outside your local chain.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

const app = express();
app.use(cors());
app.use(express.json());

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const FAUCET_PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY;
const FUNDING_AMOUNT_ETH = process.env.FUNDING_AMOUNT_ETH || "10";
const PORT = process.env.FAUCET_PORT || 4000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const USERS_FILE = path.join(__dirname, "users.json");

// NEW: the deployed contract address + ABI, so this server can send the
// assignRole() transaction after a signup. Same address the frontend
// uses (frontend/src/contract.js) — if you redeploy, update BOTH places,
// or override with CONTRACT_ADDRESS in .env.
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const contractArtifact = require("../frontend/src/SupplyChain.json");

// CHANGED: "Consumer" and "Wholesaler" are no longer sign-up roles.
// A consumer is just a member of the public checking a tablet — they
// never create an account (see the public /verify-batch-style flow,
// which is entirely on the frontend via the read-only contract, plus
// POST /rate-batch below). "Wholesaler" was replaced with "Transporter",
// which now sits right after the Manufacturer in the chain.
const VALID_ROLES = ["Manufacturer", "Transporter", "Distributor", "Pharmacy"];

// NEW: fixed option lists for the two security questions asked at
// signup and re-asked (not pre-filled) during Forgot Password. Kept as
// a whitelist here (not free text) so answers are unambiguous — no risk
// of "Biryani" vs "biryani " mismatches from typos.
const SPORTS = [
  "Cricket", "Football", "Badminton", "Hockey", "Tennis", "Kabaddi",
  "Chess", "Volleyball", "Basketball", "Table Tennis", "Wrestling", "Athletics",
];
const INDIAN_FOODS = [
  "Biryani", "Dosa", "Butter Chicken", "Paneer Tikka", "Chole Bhature",
  "Idli Sambar", "Rajma Chawal", "Pav Bhaji", "Rogan Josh", "Dhokla",
  "Vada Pav", "Gulab Jamun", "Samosa", "Momos", "Poha",
];

const MAX_RESET_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes to actually set the new password

// Maps a role name to the Solidity Role enum value (see SupplyChain.sol):
// enum Role { None, Manufacturer, Transporter, Distributor, Pharmacy }
const ROLE_ENUM = {
  Manufacturer: 1,
  Transporter: 2,
  Distributor: 3,
  Pharmacy: 4,
};

// ============================================================
// NEW: Human-readable signup guide file.
// ============================================================
// users.json is the real "database" (it holds password hashes and
// private keys, so it's git-ignored). This file is a separate,
// plain-text/Markdown log meant to just be opened in VS Code to see,
// at a glance, who has signed up: name, role, and date — nothing
// sensitive. It's rebuilt/appended every signup.
const ACCOUNTS_GUIDE_FILE = path.join(__dirname, "ACCOUNTS_GUIDE.md");

function appendToAccountsGuide(user) {
  const fileExists = fs.existsSync(ACCOUNTS_GUIDE_FILE);
  if (!fileExists) {
    const header =
      "# Signed-Up Accounts\n\n" +
      "Auto-generated log of every account created through Sign Up. " +
      "Open this file in VS Code to see who has signed up, with what " +
      "role, and when — no passwords or keys are stored here (see " +
      "users.json, which is git-ignored, for that).\n\n" +
      "| Name | Role | Date |\n" +
      "|------|------|------|\n";
    fs.writeFileSync(ACCOUNTS_GUIDE_FILE, header);
  }
  const dateStr = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const row = `| ${user.username} | ${user.role} | ${dateStr} |\n`;
  fs.appendFileSync(ACCOUNTS_GUIDE_FILE, row);
}

// Password rule (matches what the frontend validates too):
// at least 8 characters, at least one digit, one lowercase letter, one
// UPPERCASE letter, and one of @ or $.
const PASSWORD_REGEX = /^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*[@$])[A-Za-z0-9@$]{8,}$/;

if (!FAUCET_PRIVATE_KEY) {
  console.error("FAUCET_PRIVATE_KEY is not set. Copy blockchain/.env.example to blockchain/.env and try again.");
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error("ADMIN_PASSWORD is not set. Add it to blockchain/.env (see .env.example) and try again.");
  process.exit(1);
}

// ---------- tiny local "database" helpers ----------

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  const raw = fs.readFileSync(USERS_FILE, "utf8").trim();
  return raw ? JSON.parse(raw) : [];
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Passwords are hashed with Node's built-in scrypt (no extra dependency
// needed) — never stored in plain text, even locally.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

// Strip password hash, private key, and security-answer hashes before
// ever sending a user object back to the frontend in a listing/search
// context.
function publicUser(u) {
  const status = accountStatus(u);
  return {
    username: u.username,
    role: u.role,
    city: u.city,
    walletAddress: u.walletAddress,
    disabled: status.disabled,
    disabledReason: status.reason, // "admin" | "lockout" | null
    disabledUntil: status.reason === "lockout" ? u.disabledUntil : null,
  };
}

// NEW: computes whether an account is currently disabled, and why.
// Two independent mechanisms can disable an account:
//   - disabledByAdmin: a manual admin toggle, stays disabled until an
//     admin explicitly re-enables it (time never un-locks this one).
//   - disabledUntil: an automatic 24-hour lock from failing the
//     Forgot Password security questions 5 times; expires on its own.
function accountStatus(user) {
  if (user.disabledByAdmin) {
    return { disabled: true, reason: "admin" };
  }
  if (user.disabledUntil && new Date(user.disabledUntil).getTime() > Date.now()) {
    return { disabled: true, reason: "lockout" };
  }
  return { disabled: false, reason: null };
}

// ---------- blockchain connection ----------

let provider;
let faucetWallet;
let roleAdminContract; // contract instance signed by the deployer, used to call assignRole()

async function init() {
  provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  const network = await provider.getNetwork();
  if (network.chainId !== 31337) {
    console.error(
      `Refusing to start: connected network chainId is ${network.chainId}, expected 31337 (Hardhat localhost). This server only runs against local Hardhat.`
    );
    process.exit(1);
  }

  faucetWallet = new ethers.Wallet(FAUCET_PRIVATE_KEY, provider);
  roleAdminContract = new ethers.Contract(CONTRACT_ADDRESS, contractArtifact.abi, faucetWallet);

  // Sanity check: the account we're using as "role admin" must actually
  // be the contract's on-chain owner, or assignRole() will revert for
  // every signup. This is true by default because scripts/deploy.js
  // deploys using the first Hardhat account, same as FAUCET_PRIVATE_KEY.
  const onChainOwner = await roleAdminContract.owner();
  if (onChainOwner.toLowerCase() !== faucetWallet.address.toLowerCase()) {
    console.error(
      `WARNING: FAUCET_PRIVATE_KEY's address (${faucetWallet.address}) is not the contract owner (${onChainOwner}). ` +
      `Signup will fail to assign roles. Make sure you deployed with the default first Hardhat account.`
    );
  }

  console.log("Faucet / role-admin wallet:", faucetWallet.address);
  console.log("Connected to Hardhat localhost, chainId 31337. Backend ready.");
}

async function fundWallet(address, amountEth) {
  const tx = await faucetWallet.sendTransaction({
    to: address,
    value: ethers.utils.parseEther(amountEth),
  });
  await tx.wait();
  return tx.hash;
}

// ============================================================
// ROUTES
// ============================================================

// ---------- Sign up ----------
app.post("/signup", async (req, res) => {
  try {
    const { username, password, role, city, sport, food } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({ error: "Username is required." });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: "Role must be one of: " + VALID_ROLES.join(", ") });
    }
    if (!city || !city.trim()) {
      return res.status(400).json({ error: "City is required." });
    }
    if (!PASSWORD_REGEX.test(password || "")) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters and include a number, an uppercase letter, a lowercase letter, and @ or $.",
      });
    }
    // NEW: two security questions, used later by Forgot Password.
    // Validated against the fixed lists (SPORTS / INDIAN_FOODS) so there
    // is never a "did I spell that the same way" mismatch at reset time.
    if (!SPORTS.includes(sport)) {
      return res.status(400).json({ error: "Please choose a valid favourite sport from the list." });
    }
    if (!INDIAN_FOODS.includes(food)) {
      return res.status(400).json({ error: "Please choose a valid favourite food from the list." });
    }

    const users = loadUsers();
    const usernameLower = username.trim().toLowerCase();
    if (users.some((u) => u.username.toLowerCase() === usernameLower)) {
      return res.status(409).json({ error: "That username is already taken." });
    }

    // NEW: generate a fresh blockchain wallet for this user — this is
    // what replaces "manually import a Hardhat private key into MetaMask".
    const wallet = ethers.Wallet.createRandom();

    // Fund it immediately so they can register/transfer batches right away.
    const fundTxHash = await fundWallet(wallet.address, FUNDING_AMOUNT_ETH);

    // NEW: register this wallet's role ON-CHAIN, so the smart contract
    // itself (not just this backend) knows and enforces who can do what.
    // This is what makes "Manufacturer can only transfer to a
    // Distributor" a real guarantee instead of a UI convention.
    const roleTx = await roleAdminContract.assignRole(wallet.address, ROLE_ENUM[role]);
    await roleTx.wait();

    const newUser = {
      username: username.trim(),
      passwordHash: hashPassword(password),
      role,
      city: city.trim(),
      walletAddress: wallet.address,
      privateKey: wallet.privateKey, // local dev only — see big comment at top of file
      createdAt: new Date().toISOString(),
      // NEW: security-question answers, hashed the same way as the
      // password (never stored in plain text, even locally).
      sportHash: hashPassword(sport),
      foodHash: hashPassword(food),
      // NEW: account lock state — see accountStatus() above.
      failedResetAttempts: 0,
      disabledUntil: null,
      disabledByAdmin: false,
      resetToken: null,
      resetTokenExpires: null,
    };

    users.push(newUser);
    saveUsers(users);

    // NEW: log this signup into the plain-text guide file (name, role,
    // date) so it can be opened straight in VS Code — see comment near
    // ACCOUNTS_GUIDE_FILE above.
    appendToAccountsGuide(newUser);

    console.log(`Signed up: ${newUser.username} (${role}, ${city}) -> ${wallet.address}, funded tx ${fundTxHash}`);

    // NEW: this is the ONE time the private key is sent to the frontend
    // for a brand-new signup — needed so ImportWalletModal.jsx can show
    // it once for the user to paste into MetaMask. It is not stored in
    // frontend state beyond that modal, and is never sent again except
    // via the explicit /reveal-private-key flow (which requires the
    // password again).
    return res.json({
      success: true,
      username: newUser.username,
      role,
      city,
      walletAddress: wallet.address,
      privateKey: wallet.privateKey,
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Signup failed. Is Hardhat node running?" });
  }
});

// ---------- Log in ----------
app.post("/login", (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const users = loadUsers();
    const user = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    // NEW: block login if the account is disabled — either by an admin,
    // or automatically after 5 failed Forgot Password attempts.
    const status = accountStatus(user);
    if (status.disabled) {
      if (status.reason === "admin") {
        return res.status(403).json({ error: "This account has been disabled by an admin." });
      }
      const until = new Date(user.disabledUntil).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
      return res.status(403).json({
        error: `Too many failed password-reset attempts. This account is locked until ${until}.`,
      });
    }

    // CHANGED: login no longer sends the private key at all. Real signing
    // now happens through MetaMask (imported once at signup — see
    // /signup and ImportWalletModal.jsx), so the frontend never needs
    // this account's key after the one-time import. This is strictly
    // more secure than the previous version: the key now exists in
    // exactly two places — this server's users.json, and MetaMask's own
    // encrypted storage on the user's device — and is never transmitted
    // on every login.
    return res.json({
      success: true,
      username: user.username,
      role: user.role,
      city: user.city,
      walletAddress: user.walletAddress,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed." });
  }
});

// ---------- Admin login (separate, simple password gate) ----------
app.post("/admin-login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true });
  }
  return res.status(401).json({ error: "Incorrect admin password." });
});

// ---------- Fixed option lists for signup / forgot-password dropdowns ----------
app.get("/security-question-options", (req, res) => {
  res.json({ sports: SPORTS, foods: INDIAN_FOODS });
});

// ---------- Forgot Password: step 1, verify security answers ----------
// The two answers are NOT pre-filled anywhere — the user must pick them
// again from the dropdowns, same as at signup. 5 wrong attempts across
// the account's lifetime (not just this session) locks it for 24 hours.
app.post("/forgot-password/verify", (req, res) => {
  try {
    const { username, sport, food } = req.body;
    const users = loadUsers();
    const user = users.find((u) => u.username.toLowerCase() === (username || "").trim().toLowerCase());

    if (!user) {
      return res.status(404).json({ error: "No account with that username." });
    }

    // NEW: accounts created before this update never had security
    // questions collected, so there's nothing to verify against. Report
    // this clearly instead of crashing or failing ambiguously.
    if (!user.sportHash || !user.foodHash) {
      return res.status(400).json({
        error:
          "This account was created before security questions were added and has no recovery answers on file. Ask an admin to re-enable it, or sign up again.",
      });
    }

    const status = accountStatus(user);
    if (status.disabled) {
      if (status.reason === "admin") {
        return res.status(403).json({ error: "This account has been disabled by an admin. Contact an admin to re-enable it." });
      }
      const until = new Date(user.disabledUntil).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
      return res.status(403).json({ error: `This account is locked until ${until}.` });
    }

    const sportOk = verifyPassword(sport || "", user.sportHash);
    const foodOk = verifyPassword(food || "", user.foodHash);

    if (sportOk && foodOk) {
      // Correct — issue a short-lived token for the actual reset step,
      // and clear the failed-attempt counter.
      user.failedResetAttempts = 0;
      user.resetToken = crypto.randomBytes(24).toString("hex");
      user.resetTokenExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
      saveUsers(users);
      return res.json({ valid: true, resetToken: user.resetToken });
    }

    // Wrong — count it, and lock the account for 24 hours on the 5th miss.
    user.failedResetAttempts = (user.failedResetAttempts || 0) + 1;
    if (user.failedResetAttempts >= MAX_RESET_ATTEMPTS) {
      user.disabledUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
      user.failedResetAttempts = 0;
      saveUsers(users);
      const until = new Date(user.disabledUntil).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
      return res.status(403).json({
        error: `Incorrect answers. Maximum attempts reached — sorry, this account has been disabled. You can register a new account, or this one re-enables automatically on ${until}.`,
      });
    }

    saveUsers(users);
    const remaining = MAX_RESET_ATTEMPTS - user.failedResetAttempts;
    return res.status(401).json({
      error: `Incorrect answers. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before this account is locked for 24 hours.`,
    });
  } catch (err) {
    console.error("Forgot-password verify error:", err);
    return res.status(500).json({ error: "Could not verify security answers." });
  }
});

// ---------- Forgot Password: step 2, actually set the new password ----------
app.post("/forgot-password/reset", (req, res) => {
  try {
    const { username, resetToken, newPassword } = req.body;
    const users = loadUsers();
    const user = users.find((u) => u.username.toLowerCase() === (username || "").trim().toLowerCase());

    if (!user || !user.resetToken || user.resetToken !== resetToken) {
      return res.status(401).json({ error: "Invalid or expired reset session. Start Forgot Password again." });
    }
    if (new Date(user.resetTokenExpires).getTime() < Date.now()) {
      user.resetToken = null;
      user.resetTokenExpires = null;
      saveUsers(users);
      return res.status(401).json({ error: "This reset session expired. Start Forgot Password again." });
    }
    if (!PASSWORD_REGEX.test(newPassword || "")) {
      return res.status(400).json({
        error: "Password must be at least 8 characters and include a number, an uppercase letter, a lowercase letter, and @ or $.",
      });
    }

    user.passwordHash = hashPassword(newPassword);
    user.resetToken = null;
    user.resetTokenExpires = null;
    saveUsers(users);

    return res.json({ success: true });
  } catch (err) {
    console.error("Forgot-password reset error:", err);
    return res.status(500).json({ error: "Could not reset password." });
  }
});

// ---------- Admin: enable / disable an account ----------
// Requires the admin password on every call (no persistent admin
// session token exists in this simple backend) — matches the pattern
// already used for /admin-login.
app.post("/admin/set-account-status", (req, res) => {
  try {
    const { adminPassword, username, disabled } = req.body;
    if (adminPassword !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Incorrect admin password." });
    }
    const users = loadUsers();
    const user = users.find((u) => u.username.toLowerCase() === (username || "").trim().toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "No account with that username." });
    }

    user.disabledByAdmin = !!disabled;
    if (!disabled) {
      // Re-enabling always overrides a timed lockout too, and gives the
      // account a clean slate on failed attempts.
      user.disabledUntil = null;
      user.failedResetAttempts = 0;
    }
    saveUsers(users);

    return res.json({ success: true, username: user.username, status: accountStatus(user) });
  } catch (err) {
    console.error("Admin set-account-status error:", err);
    return res.status(500).json({ error: "Could not update account status." });
  }
});

// ---------- Search users by username substring (for the recipient picker) ----------
// NEW: supports ?role=Distributor to restrict results to a specific
// role, so e.g. a Manufacturer's "Transfer To" search only ever shows
// Distributors, matching the enforced on-chain transfer order.
app.get("/users/search", (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();
  const roleFilter = req.query.role;
  const users = loadUsers();
  let matches = q ? users.filter((u) => u.username.toLowerCase().includes(q)) : users;
  if (roleFilter) {
    matches = matches.filter((u) => u.role === roleFilter);
  }
  return res.json(matches.map(publicUser));
});

// ---------- Reveal private key (for re-importing into MetaMask) ----------
// NEW: signup already showed this once. This endpoint exists only so a
// user who lost/cleared their MetaMask import can get it again — it
// requires the correct password every time, same as login, and is
// never called automatically by the frontend.
app.post("/reveal-private-key", (req, res) => {
  try {
    const { username, password } = req.body;
    const users = loadUsers();
    const user = users.find((u) => u.username.toLowerCase() === (username || "").trim().toLowerCase());
    if (!user || !verifyPassword(password || "", user.passwordHash)) {
      return res.status(401).json({ error: "Invalid username or password." });
    }
    return res.json({ walletAddress: user.walletAddress, privateKey: user.privateKey });
  } catch (err) {
    console.error("Reveal-private-key error:", err);
    return res.status(500).json({ error: "Could not retrieve key." });
  }
});

// ---------- Verify password without starting a new session ----------
// NEW: used for the "Confirm & Sign" step before Register Batch,
// Transfer Ownership, and Mark Delivered — this mirrors the
// "Prompt: Approve Transaction / Confirm & Sign" step MetaMask used to
// show, re-implemented for the username/password login model.
app.post("/verify-password", (req, res) => {
  try {
    const { username, password } = req.body;
    const users = loadUsers();
    const user = users.find((u) => u.username.toLowerCase() === (username || "").trim().toLowerCase());
    if (!user || !verifyPassword(password || "", user.passwordHash)) {
      return res.status(401).json({ valid: false, error: "Incorrect password." });
    }
    return res.json({ valid: true });
  } catch (err) {
    console.error("Verify-password error:", err);
    return res.status(500).json({ valid: false, error: "Verification failed." });
  }
});

// ---------- Reverse lookup: address -> user (for Fetch/History display) ----------
app.get("/users/by-address/:address", (req, res) => {
  const users = loadUsers();
  const user = users.find(
    (u) => u.walletAddress.toLowerCase() === req.params.address.toLowerCase()
  );
  if (!user) return res.status(404).json({ error: "Not found" });
  return res.json(publicUser(user));
});

// ---------- Admin: list all users ----------
app.get("/users", (req, res) => {
  const users = loadUsers();
  return res.json(users.map(publicUser));
});

// ---------- NEW: Consumer rating + feedback relay ----------
// A consumer has no account and no wallet in this app (see the big
// comment in SupplyChain.sol, item 5) so they can never sign a
// transaction themselves. This endpoint is the workaround: it takes a
// batch code, a 1-5 rating, and optional name/feedback plus a required
// city from the (unauthenticated, public) consumer verify page,
// resolves the batch id, and submits it ON THEIR BEHALF using this
// server's own funded wallet as the transaction sender. No MetaMask
// popup, no login required.
//
// The contract itself enforces "only after the pharmacy delivered it"
// (see submitRating's require in SupplyChain.sol) — this route just
// passes the revert reason back through as a normal error message
// instead of a generic 500, so the frontend can show something useful.
app.post("/rate-batch", async (req, res) => {
  try {
    const { batchCode, rating, name, city, feedback } = req.body;
    const trimmedCode = (batchCode || "").trim();
    const ratingNum = Number(rating);
    const trimmedCity = (city || "").trim();
    const trimmedName = (name || "").trim();
    const trimmedFeedback = (feedback || "").trim();

    if (!trimmedCode) {
      return res.status(400).json({ error: "Batch code is required." });
    }
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: "Rating must be a whole number from 1 to 5." });
    }
    if (!trimmedCity) {
      return res.status(400).json({ error: "City is required." });
    }

    const id = await roleAdminContract.getIdByCode(trimmedCode);
    if (id.toString() === "0") {
      return res.status(404).json({ error: "That batch code does not exist." });
    }

    const tx = await roleAdminContract.submitRating(
      id,
      ratingNum,
      trimmedName,
      trimmedCity,
      trimmedFeedback
    );
    await tx.wait();

    const batch = await roleAdminContract.getBatch(id);
    const ratingCount = batch.ratingCount.toNumber();
    const averageRating = ratingCount > 0 ? batch.ratingSum.toNumber() / ratingCount : 0;

    return res.json({
      success: true,
      batchCode: trimmedCode,
      rating: ratingNum,
      ratingCount,
      averageRating,
      txHash: tx.hash,
    });
  } catch (err) {
    console.error("Rate-batch error:", err);
    // Surface the contract's require() reason (e.g. "only available
    // after the pharmacy marks this batch as delivered") instead of a
    // generic message, when ethers gives us one.
    const reason = err?.reason || err?.error?.reason || err?.error?.message;
    if (reason) {
      return res.status(400).json({ error: reason.replace(/^execution reverted: /i, "") });
    }
    return res.status(500).json({ error: "Could not submit rating. Is Hardhat node running?" });
  }
});

// ---------- Faucet (unchanged behaviour, now shares the same server) ----------
app.post("/faucet", async (req, res) => {
  try {
    const { address } = req.body;
    if (!address || !ethers.utils.isAddress(address)) {
      return res.status(400).json({ error: "A valid wallet address is required." });
    }

    const tx = await faucetWallet.sendTransaction({
      to: address,
      value: ethers.utils.parseEther(FUNDING_AMOUNT_ETH),
    });
    await tx.wait();

    const newBalanceWei = await provider.getBalance(address);
    const newBalanceEth = ethers.utils.formatEther(newBalanceWei);

    return res.json({ success: true, amount: FUNDING_AMOUNT_ETH, txHash: tx.hash, newBalance: newBalanceEth });
  } catch (err) {
    console.error("Faucet error:", err.message);
    return res.status(500).json({ error: "Faucet transaction failed. Is Hardhat node running?" });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", network: "hardhat-localhost", faucet: faucetWallet?.address });
});

init().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend running at http://127.0.0.1:${PORT}`);
    console.log("DEVELOPMENT ONLY — do not deploy this server anywhere public.");
  });
});
