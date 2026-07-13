// User creation + lookups.
import { get, run } from "../db.mjs";
import { id } from "./crypto.mjs";

export async function createUserWithPassword(email, passwordHash, displayName) {
  const uid = id();
  await run(`INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?,?,?,?,?)`,
    [uid, email, passwordHash, displayName || email.split("@")[0], Date.now()]);
  return get(`SELECT * FROM users WHERE id = ?`, [uid]);
}

export async function createUserForCoinpay(sub, displayName) {
  const uid = id();
  await run(`INSERT INTO users (id, coinpay_sub, display_name, created_at) VALUES (?,?,?,?)`,
    [uid, sub, displayName || "logicsrc user", Date.now()]);
  return get(`SELECT * FROM users WHERE id = ?`, [uid]);
}

// Passkey-first signup (no email/password yet).
export async function createUserPasskey(displayName) {
  const uid = id();
  await run(`INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)`,
    [uid, displayName || "logicsrc user", Date.now()]);
  return get(`SELECT * FROM users WHERE id = ?`, [uid]);
}

export const userByEmail = (email) => get(`SELECT * FROM users WHERE email = ?`, [String(email).toLowerCase()]);
export const userByCoinpay = (sub) => get(`SELECT * FROM users WHERE coinpay_sub = ?`, [sub]);
export const userById = (uid) => get(`SELECT * FROM users WHERE id = ?`, [uid]);
