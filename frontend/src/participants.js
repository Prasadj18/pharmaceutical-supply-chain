// frontend/src/participants.js
//
// OLD: this file held a hardcoded list of 4 wallet addresses mapped to
// names/roles (Swayam, ShadowFox, Iranna, Sagar), matching Hardhat's
// fixed default accounts.
//
// NEW: participants are no longer fixed — anyone can sign up as any
// role through the app, and the backend (blockchain/server.js,
// users.json) is now the source of truth for "which wallet belongs to
// which username/role". This file is kept only for small formatting
// helpers used across components.

/**
 * Shorten an address for display, e.g. 0x90F79bf6...93b906
 */
export function shortenAddress(address) {
  if (!address || address.length < 10) return address || "";
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

/**
 * Format a resolved user object (from api.js getUserByAddress /
 * searchUsers) as "Name - Role - City". Falls back to a shortened
 * address if no matching user record exists (e.g. the contract
 * deployer account, which never signed up through the app).
 */
export function formatUser(user, fallbackAddress) {
  if (user) {
    return user.city ? `${user.username} - ${user.role} - ${user.city}` : `${user.username} - ${user.role}`;
  }
  return shortenAddress(fallbackAddress);
}
