// API keys (lsk_…) for the logicsrc CLI, CI and deploy boxes.
//
// Two kinds share one table:
//   user     what `logicsrc login` mints. Acts as the person, with the person's
//            identity key. Unchanged since before machine keys existed.
//   machine  made on purpose for a box. Scoped to one team (and optionally a
//            list of vault names), read-only unless asked otherwise, may expire,
//            and carries its OWN identity public key (api_keys.public_key),
//            registered by the machine on first use. Vault keys reach it through
//            credshare_key_grants, never through the person's grants.
//
// Only sha256(key) is stored; the plaintext is shown once, at creation.
import { get, all, run } from "../db.mjs";
import { id, token, sha256 } from "./crypto.mjs";

export const KEY_KINDS = ["user", "machine"];

const VAULT_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

export class ApiKeyError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Mint a key. Returns { plaintext, row } — plaintext is shown ONCE.
 *
 * `opts` is only meaningful for machine keys: { kind, teamId, vaultScope
 * (array of vault names, or null for every vault in the team), readOnly
 * (default true), expiresAt (ms epoch, or null) }.
 */
export async function createApiKey(userId, name = "cli", opts = {}) {
  const kind = opts.kind === "machine" ? "machine" : "user";
  const plaintext = "lsk_" + token(24);
  const prefix = plaintext.slice(0, 12);
  const machine = kind === "machine";
  const row = {
    id: id(),
    user_id: userId,
    name,
    token_hash: sha256(plaintext),
    prefix,
    created_at: Date.now(),
    kind,
    team_id: machine ? opts.teamId ?? null : null,
    vault_scope: machine && Array.isArray(opts.vaultScope) && opts.vaultScope.length ? JSON.stringify(opts.vaultScope) : null,
    read_only: machine ? (opts.readOnly === false ? 0 : 1) : 0,
    expires_at: opts.expiresAt ?? null
  };
  await run(
    `INSERT INTO api_keys (id, user_id, name, token_hash, prefix, created_at, kind, team_id, vault_scope, read_only, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [row.id, row.user_id, row.name, row.token_hash, row.prefix, row.created_at, row.kind, row.team_id, row.vault_scope, row.read_only, row.expires_at]
  );
  return { plaintext, row };
}

/** A key row is usable when it exists and has not expired. Revoked keys are deleted rows. */
export function keyIsLive(key, now = Date.now()) {
  if (!key) return false;
  const exp = key.expires_at == null ? null : Number(key.expires_at);
  return exp == null || exp > now;
}

/**
 * Resolve a Bearer token to { key, user } (or null). Expired keys resolve to
 * null, which every caller answers with a 401. Updates last_used_at.
 */
export async function keyForBearer(bearerToken) {
  if (!bearerToken || !bearerToken.startsWith("lsk_")) return null;
  const key = await get(`SELECT * FROM api_keys WHERE token_hash = ?`, [sha256(bearerToken)]);
  if (!keyIsLive(key)) return null;
  const user = await get(`SELECT * FROM users WHERE id = ?`, [key.user_id]);
  if (!user) return null;
  await run(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`, [Date.now(), key.id]);
  return { key: normalizeKey(key), user };
}

/**
 * Resolve a Bearer token to its owning user, for routes that act AS the person
 * (the personal vault, /api/me). Machine keys are refused here: a deploy box
 * reads the team vaults it was granted and nothing of the person's own.
 */
export async function userForApiKey(bearerToken) {
  const found = await keyForBearer(bearerToken);
  if (!found || found.key.kind === "machine") return null;
  return found.user;
}

/** Parse the stored columns into the shape the routes use. */
export function normalizeKey(key) {
  let scope = null;
  if (key.vault_scope) {
    try {
      const parsed = JSON.parse(key.vault_scope);
      if (Array.isArray(parsed)) scope = parsed.filter((v) => typeof v === "string");
    } catch { scope = null; }
  }
  return {
    ...key,
    kind: key.kind === "machine" ? "machine" : "user",
    vaultScope: scope,
    readOnly: Number(key.read_only) === 1,
    expiresAt: key.expires_at == null ? null : Number(key.expires_at)
  };
}

/** Is `vaultName` inside this key's scope? User keys and unscoped machine keys see every vault. */
export function keyCoversVault(key, vaultName) {
  if (!key || key.kind !== "machine") return true;
  return !key.vaultScope || key.vaultScope.includes(vaultName);
}

export const listApiKeys = async (userId) =>
  (await all(
    `SELECT k.id, k.name, k.prefix, k.created_at, k.last_used_at, k.kind, k.team_id, k.vault_scope, k.read_only, k.expires_at, k.public_key, t.slug AS team_slug
       FROM api_keys k LEFT JOIN credshare_teams t ON t.id = k.team_id
      WHERE k.user_id = ? ORDER BY k.created_at DESC`,
    [userId]
  )).map(normalizeKey);

/** Public view of a key row (never the hash). */
export function keyJson(k) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    kind: k.kind,
    team: k.team_slug ?? null,
    vaults: k.vaultScope ?? null,
    readOnly: k.kind === "machine" ? k.readOnly : false,
    expiresAt: k.expiresAt ?? null,
    expired: !keyIsLive(k),
    publicKey: k.public_key ?? null,
    createdAt: Number(k.created_at),
    lastUsedAt: k.last_used_at == null ? null : Number(k.last_used_at)
  };
}

/** Revoke = delete. The key's vault grants go with it (explicitly; SQLite FKs are off by default). */
export async function revokeApiKey(userId, keyId) {
  const owned = await get(`SELECT id FROM api_keys WHERE id = ? AND user_id = ?`, [keyId, userId]);
  if (!owned) return false;
  await run(`DELETE FROM credshare_key_grants WHERE api_key_id = ?`, [keyId]);
  await run(`DELETE FROM api_keys WHERE id = ? AND user_id = ?`, [keyId, userId]);
  return true;
}

/**
 * Validate a machine-key request from the API or the settings form and turn it
 * into createApiKey options. Throws ApiKeyError with a status to answer with.
 *
 * `expires` accepts a ms epoch, an ISO date, or a duration like 30d / 12h / 90m.
 */
export async function machineKeyOptions(userId, { team, vaults, readOnly, expires }) {
  const slug = String(team || "").trim().toLowerCase();
  if (!slug) throw new ApiKeyError(422, "A machine key needs a team.");
  const teamRow = await get(`SELECT * FROM credshare_teams WHERE slug = ?`, [slug]);
  if (!teamRow) throw new ApiKeyError(404, `Unknown team: ${slug}`);
  const member = await get(`SELECT * FROM credshare_members WHERE team_id = ? AND user_id = ? AND status = 'active'`, [teamRow.id, userId]);
  if (!member) throw new ApiKeyError(403, "You are not a member of this team.");

  const list = (Array.isArray(vaults) ? vaults : typeof vaults === "string" ? vaults.split(/[\s,]+/) : [])
    .map((v) => String(v).trim().toLowerCase())
    .filter(Boolean);
  for (const v of list) {
    if (!VAULT_NAME.test(v)) throw new ApiKeyError(422, `"${v}" is not a vault name (lowercase letters, numbers, dashes; e.g. web--prod).`);
  }
  const expiresAt = parseExpiry(expires);
  if (expiresAt !== null && expiresAt <= Date.now()) throw new ApiKeyError(422, "That expiry is already in the past.");
  return {
    kind: "machine",
    teamId: teamRow.id,
    vaultScope: [...new Set(list)],
    readOnly: readOnly === false || readOnly === "false" || readOnly === 0 || readOnly === "0" ? false : true,
    expiresAt
  };
}

export function parseExpiry(value, now = Date.now()) {
  if (value === undefined || value === null || value === "" || value === "never") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).trim();
  const dur = /^(\d+)\s*(m|h|d|w|y)$/i.exec(s);
  if (dur) {
    const unit = { m: 60e3, h: 3600e3, d: 86400e3, w: 7 * 86400e3, y: 365 * 86400e3 }[dur[2].toLowerCase()];
    return now + Number(dur[1]) * unit;
  }
  if (/^\d{12,}$/.test(s)) return Number(s);
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new ApiKeyError(422, `Cannot read expiry "${s}". Use 30d, 12h, or a date like 2027-01-01.`);
  return t;
}

// Pull the Bearer token off a request.
export function bearer(req) {
  const h = req.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}
