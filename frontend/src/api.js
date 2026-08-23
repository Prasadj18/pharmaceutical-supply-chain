// frontend/src/api.js
//
// All calls to the local backend server (blockchain/server.js) live here,
// so App.jsx doesn't need to know URLs or fetch/error-handling details.

const API_BASE = "http://127.0.0.1:4000";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new Error(
      "Cannot reach the local backend. Is 'node server.js' running in the blockchain folder?"
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // NEW: a 404 with no JSON error field almost always means this
    // route doesn't exist on the currently-running backend — usually
    // because `node server.js` was updated but never restarted (Node
    // doesn't hot-reload). Say so directly instead of the unhelpful
    // generic "Request failed."
    if (res.status === 404 && !data.error) {
      throw new Error(
        `This feature (${path}) isn't available on the running backend. Stop and restart 'node server.js' after updating the files.`
      );
    }
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

export const signup = ({ username, password, role, city, sport, food }) =>
  request("/signup", { method: "POST", body: JSON.stringify({ username, password, role, city, sport, food }) });

export const login = ({ username, password }) =>
  request("/login", { method: "POST", body: JSON.stringify({ username, password }) });

export const adminLogin = (password) =>
  request("/admin-login", { method: "POST", body: JSON.stringify({ password }) });

export const searchUsers = (query, role) => {
  const params = new URLSearchParams();
  params.set("q", query || "");
  if (role) params.set("role", role);
  return request(`/users/search?${params.toString()}`);
};

export const verifyPassword = (username, password) =>
  request("/verify-password", { method: "POST", body: JSON.stringify({ username, password }) });

// NEW: only used if someone needs to re-import their account into
// MetaMask (new browser, cleared extension, etc.) — never called
// automatically.
export const revealPrivateKey = (username, password) =>
  request("/reveal-private-key", { method: "POST", body: JSON.stringify({ username, password }) });

export const getUserByAddress = (address) =>
  request(`/users/by-address/${address}`).catch(() => null); // 404 -> null, not an error

export const listAllUsers = () => request("/users");

export const requestFaucet = (address) =>
  request("/faucet", { method: "POST", body: JSON.stringify({ address }) });

// NEW: submits a consumer's 1-5 star rating, plus an optional name,
// required city, and optional written feedback, for a batch. No login,
// no wallet, no MetaMask — the backend relays this transaction using
// its own funded wallet (see server.js POST /rate-batch). The contract
// itself will reject this until the pharmacy has marked the batch
// Delivered.
export const rateBatch = (batchCode, { rating, name, city, feedback }) =>
  request("/rate-batch", {
    method: "POST",
    body: JSON.stringify({ batchCode, rating, name, city, feedback }),
  });

// NEW: Forgot Password / account lockout / admin enable-disable.

export const getSecurityQuestionOptions = () => request("/security-question-options");

export const verifyForgotPasswordAnswers = (username, sport, food) =>
  request("/forgot-password/verify", { method: "POST", body: JSON.stringify({ username, sport, food }) });

export const resetPasswordWithToken = (username, resetToken, newPassword) =>
  request("/forgot-password/reset", { method: "POST", body: JSON.stringify({ username, resetToken, newPassword }) });

export const adminSetAccountStatus = (adminPassword, username, disabled) =>
  request("/admin/set-account-status", {
    method: "POST",
    body: JSON.stringify({ adminPassword, username, disabled }),
  });
