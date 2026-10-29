// The keyring share link: a revocable, read-only URL that exposes ONLY the
// public halves of a person's SSH keys, for other apps to read (w3bs.org/fleet,
// threatcrush.com/fleet, crawlproof's SSH uptime checks).
//
//   POST   /api/keyring/share   create or rotate -> { url, keys_url_text, token }
//   GET    /api/keyring/share   { exists, created_at, rotated_at } (never the token)
//   DELETE /api/keyring/share   revoke
//   GET    /k/<token>.json      public: { keys: [{ name, type, public_key, fingerprint, comment }] }
//   GET    /k/<token>.keys      public: authorized_keys text
//
// The token is `lks_` + 32 random bytes (base64url); only sha256(token) is
// stored, so it is shown once, on create or rotate. One share per person.
//
// Auth for the /api routes: a person's `Bearer lsk_…` key, or a browser session
// (unlike the rest of the keyring these touch public keys only). A session
// write must carry the double-submit CSRF header, because the app-wide guard
// skips /api/*. Machine keys are refused: the keyring is the person's.
import { Router } from "express";
import crypto from "node:crypto";
import { get, all, run } from "../db.mjs";
import { bearer, keyForBearer } from "../lib/apikey.mjs";
import { id as newId, sha256 } from "../lib/crypto.mjs";
import { config } from "../config.mjs";
import { containsPrivateMaterial } from "./keyring.mjs";

export const keyringShareRouter = Router();
export const publicKeysRouter = Router();

const SHARE_ORIGIN = () => (process.env.KEYRING_SHARE_ORIGIN || config.origin).replace(/\/+$/, "");
export const TOKEN_RE = /^lks_[A-Za-z0-9_-]{43}$/;
export const newShareToken = () => `lks_${crypto.randomBytes(32).toString("base64url")}`;

export const shareUrls = (token) => ({
  url: `${SHARE_ORIGIN()}/k/${token}.json`,
  keys_url_text: `${SHARE_ORIGIN()}/k/${token}.keys`
});

const iso = (ms) => (ms === null || ms === undefined ? null : new Date(Number(ms)).toISOString());

// ---- public-key parsing ----

/**
 * Parse one OpenSSH public key line ("ssh-ed25519 AAAA… comment"). Returns
 * { algo, blob, comment, fingerprint } or null when it is not a well-formed
 * key whose blob names the same algorithm as the line. The fingerprint is what
 * `ssh-keygen -lf` prints: "SHA256:" + unpadded base64 of sha256(blob).
 */
export function parsePublicKey(line) {
  if (typeof line !== "string") return null;
  const first = line.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (!first || containsPrivateMaterial(first)) return null;
  const [algo, b64, ...rest] = first.split(/\s+/);
  if (!/^(ssh-|ecdsa-sha2-|sk-)[A-Za-z0-9@.-]+$/.test(algo || "")) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64 || "")) return null;
  const blob = Buffer.from(b64, "base64");
  if (blob.length < 8) return null;
  const n = blob.readUInt32BE(0);
  if (n > 64 || 4 + n > blob.length || blob.subarray(4, 4 + n).toString("latin1") !== algo) return null;
  const fingerprint = "SHA256:" + crypto.createHash("sha256").update(blob).digest("base64").replace(/=+$/, "");
  return { algo, blob: b64, comment: rest.join(" "), fingerprint };
}

/** The public view of a user's SSH keys: only ssh-* entries, only well-formed public keys. */
export async function sharedKeys(userId) {
  const rows = await all(
    `SELECT name, key_type, public_key, comment FROM keyring_entries WHERE user_id = ? AND deleted_at IS NULL ORDER BY name`,
    [userId]
  );
  const keys = [];
  for (const r of rows) {
    if (!String(r.key_type).startsWith("ssh-")) continue;
    const k = parsePublicKey(r.public_key);
    if (!k) continue;
    const comment = r.comment || k.comment || "";
    keys.push({ name: r.name, type: r.key_type, public_key: `${k.algo} ${k.blob}${comment ? ` ${comment}` : ""}`, fingerprint: k.fingerprint, comment });
  }
  return keys;
}

// ---- auth for the /api routes ----

function shareAuth(handler) {
  return async (req, res) => {
    let user = null;
    const token = bearer(req);
    if (token) {
      const found = await keyForBearer(token);
      if (!found) return res.status(401).json({ error: "Not authenticated. Run: logicsrc login" });
      if (found.key.kind === "machine") {
        return res.status(403).json({ error: "A machine API key cannot use the personal keyring.", code: "machine_key_forbidden" });
      }
      user = found.user;
    } else if (req.user) {
      if (req.method !== "GET") {
        const sent = req.get("x-csrf-token");
        const cookie = req.cookies?.mc_csrf;
        if (!sent || !cookie || sent !== cookie) return res.status(403).json({ error: "Missing or bad CSRF token." });
      }
      user = req.user;
    } else {
      return res.status(401).json({ error: "Not authenticated. Sign in or run: logicsrc login" });
    }
    res.set("Cache-Control", "no-store");
    try {
      await handler(req, res, user);
    } catch (e) {
      console.error("keyring share:", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  };
}

export async function shareStatus(userId) {
  const row = await get(`SELECT created_at, rotated_at FROM keyring_shares WHERE user_id = ?`, [userId]);
  return { exists: Boolean(row), created_at: iso(row?.created_at), rotated_at: iso(row?.rotated_at) };
}

keyringShareRouter.get("/api/keyring/share", shareAuth(async (_req, res, user) => {
  res.json(await shareStatus(user.id));
}));

// Create, or rotate (a new token; the old URL stops working at once).
keyringShareRouter.post("/api/keyring/share", shareAuth(async (_req, res, user) => {
  const token = newShareToken();
  const now = Date.now();
  const existing = await get(`SELECT id FROM keyring_shares WHERE user_id = ?`, [user.id]);
  if (existing) {
    await run(`UPDATE keyring_shares SET token_hash = ?, rotated_at = ? WHERE user_id = ?`, [sha256(token), now, user.id]);
  } else {
    await run(`INSERT INTO keyring_shares (id, user_id, token_hash, created_at, rotated_at) VALUES (?,?,?,?,NULL)`, [newId(), user.id, sha256(token), now]);
  }
  res.status(existing ? 200 : 201).json({ ...shareUrls(token), token, rotated: Boolean(existing) });
}));

keyringShareRouter.delete("/api/keyring/share", shareAuth(async (_req, res, user) => {
  const existing = await get(`SELECT id FROM keyring_shares WHERE user_id = ?`, [user.id]);
  if (!existing) return res.status(404).json({ error: "No share link to revoke." });
  await run(`DELETE FROM keyring_shares WHERE user_id = ?`, [user.id]);
  res.json({ ok: true });
}));

// ---- the public link ----

// A small per-IP limit: the token space is unguessable, this only keeps one
// client from hammering the database. In-memory, per process.
export const RATE = { windowMs: 60_000, max: 120 };
const hits = new Map();
let windowStart = Date.now();
export function rateLimited(ip, now = Date.now()) {
  if (now - windowStart >= RATE.windowMs) { hits.clear(); windowStart = now; }
  const n = (hits.get(ip) || 0) + 1;
  hits.set(ip, n);
  return n > RATE.max;
}

function cors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  res.set("X-Robots-Tag", "noindex");
}

publicKeysRouter.options(/^\/k\/[^/]+$/, (_req, res) => { cors(res); res.set("Access-Control-Max-Age", "86400").status(204).end(); });

publicKeysRouter.get(/^\/k\/([^/]+)\.(json|keys)$/, async (req, res) => {
  cors(res);
  const notFound = () => res.status(404).set("Cache-Control", "no-store").json({ error: "not_found" });
  const ip = (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  if (rateLimited(ip)) return res.status(429).set("Retry-After", "60").set("Cache-Control", "no-store").json({ error: "rate_limited" });
  const token = req.params[0];
  const format = req.params[1];
  if (!TOKEN_RE.test(token)) return notFound();
  try {
    const share = await get(`SELECT user_id FROM keyring_shares WHERE token_hash = ?`, [sha256(token)]);
    if (!share) return notFound();
    const keys = await sharedKeys(share.user_id);
    res.set("Cache-Control", "public, max-age=60");
    if (format === "keys") return res.type("text/plain; charset=utf-8").send(keys.map((k) => k.public_key).join("\n") + (keys.length ? "\n" : ""));
    res.json({ keys });
  } catch (e) {
    console.error("keyring share /k:", e);
    res.status(500).set("Cache-Control", "no-store").json({ error: "server_error" });
  }
});
