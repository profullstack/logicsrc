// Post-incident hardening (2026-10-28): a stolen lsk_ token must not be able to
// swap a person's identity key; rotation needs proof of the current secret key
// and re-seals every grant in one transaction; person reads are audited with IP
// and user agent; a write under a retired vault key is refused; sessions are
// stored hashed; every response carries the security headers.
process.env.DATABASE_URL = process.env.PWA_TEST_DATABASE_URL || ":memory:";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import sodium from "libsodium-wrappers";

const here = dirname(fileURLToPath(import.meta.url));
const { db, run, get, all, isPostgres } = await import("../src/db.mjs");
const { credshareRouter } = await import("../src/routes/credshare.mjs");
const { createApiKey } = await import("../src/lib/apikey.mjs");
const { createSession, sessionMiddleware } = await import("../src/lib/session.mjs");
const { sha256 } = await import("../src/lib/crypto.mjs");
const { securityHeaders } = await import("../src/lib/security-headers.mjs");
const { keyFingerprint } = await import("../src/lib/keyfp.mjs");

await sodium.ready;
const b64 = (u8) => sodium.to_base64(u8, sodium.base64_variants.ORIGINAL);
const unb64 = (s) => sodium.from_base64(s, sodium.base64_variants.ORIGINAL);
const keypair = () => { const k = sodium.crypto_box_keypair(); return { publicKey: b64(k.publicKey), secretKey: b64(k.privateKey) }; };
const seal = (msg, pk) => b64(sodium.crypto_box_seal(typeof msg === "string" ? sodium.from_string(msg) : msg, unb64(pk)));
const open = (box, kp) => sodium.crypto_box_seal_open(unb64(box), unb64(kp.publicKey), unb64(kp.secretKey));

for (const file of ["001_auth.sql", "002_credshare.sql", "005_machine_keys.sql", "007_hardening.sql"]) {
  if (isPostgres && file === "001_auth.sql") { await db.execute("DROP SCHEMA public CASCADE"); await db.execute("CREATE SCHEMA public"); }
  const sql = readFileSync(join(here, "..", "src", isPostgres ? "migrations-pg" : "migrations", file), "utf8");
  for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.execute(statement);
}

const now = Date.now();
const ann = keypair();
await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, ["u_ann", "ann@example.com", now]);
await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, ["u_new", "new@example.com", now]);
await run(`INSERT INTO credshare_keys (user_id, public_key, updated_at) VALUES (?,?,?)`, ["u_ann", ann.publicKey, now]);
await run(`INSERT INTO credshare_teams (id, slug, name, created_by, created_at) VALUES (?,?,?,?,?)`, ["t_acme", "acme", "acme", "u_ann", now]);
await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, created_at) VALUES (?,?,?,?,?,?,?)`, ["m_ann", "t_acme", "u_ann", "ann@example.com", "owner", "active", now]);
await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, created_at) VALUES (?,?,?,?,?,?,?)`, ["m_new", "t_acme", "u_new", "new@example.com", "member", "active", now]);
const dek = sodium.randombytes_buf(32);
for (const v of ["v_web", "v_api"]) {
  await run(`INSERT INTO credshare_vaults (id, team_id, name, created_by, created_at) VALUES (?,?,?,?,?)`, [v, "t_acme", v === "v_web" ? "web--prod" : "api--prod", "u_ann", now]);
  await run(`INSERT INTO credshare_vault_grants (vault_id, user_id, wrapped_dek, granted_by, created_at) VALUES (?,?,?,?,?)`, [v, "u_ann", seal(dek, ann.publicKey), "u_ann", now]);
}

const app = express();
app.set("trust proxy", 1);
app.use(securityHeaders);
app.use(express.json());
app.use(cookieParser());
app.use(sessionMiddleware);
app.post("/test/session", async (_req, res) => { await createSession(res, "u_ann"); res.json({ ok: true }); });
app.get("/test/whoami", (req, res) => res.json({ user: req.user?.id ?? null }));
app.use(credshareRouter);
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, path, token, body, headers = {}) => {
  const h = { accept: "application/json", ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (body !== undefined) h["content-type"] = "application/json";
  const res = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed, headers: res.headers };
};
test.after(() => new Promise((r) => server.close(r)));

const { plaintext: annToken } = await createApiKey("u_ann", "cli");
const { plaintext: newToken } = await createApiKey("u_new", "cli");

test("a stolen token cannot replace a registered identity key", async () => {
  const attacker = keypair();
  const r = await call("POST", "/api/credshare/keys", annToken, { publicKey: attacker.publicKey });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "identity_key_mismatch");
  assert.equal((await get(`SELECT public_key FROM credshare_keys WHERE user_id = ?`, ["u_ann"])).public_key, ann.publicKey);
  // re-registering the SAME key is still fine
  assert.equal((await call("POST", "/api/credshare/keys", annToken, { publicKey: ann.publicKey })).status, 200);
});

test("a first key still registers, and is audited", async () => {
  const k = keypair();
  const r = await call("POST", "/api/credshare/keys", newToken, { publicKey: k.publicKey }, { "x-forwarded-for": "203.0.113.9" });
  assert.equal(r.status, 200);
  assert.equal(r.body.fingerprint, keyFingerprint(k.publicKey));
  const row = await get(`SELECT * FROM credshare_audit WHERE action = 'identity:register' AND actor_user_id = 'u_new'`);
  assert.ok(row);
});

test("rotation needs the answer sealed to the CURRENT key, and the challenge burns on a wrong guess", async () => {
  const ch = (await call("POST", "/api/credshare/keys/challenge", annToken)).body;
  const next = keypair();
  const grants = (await call("GET", "/api/credshare/me/grants", annToken)).body.grants;
  const bad = await call("POST", "/api/credshare/keys/rotate", annToken, { publicKey: next.publicKey, challengeId: ch.challengeId, answer: "guess", grants: [] });
  assert.equal(bad.status, 403);
  // the real answer no longer works on the burned challenge
  const answer = sodium.to_string(open(ch.sealed, ann));
  const reuse = await call("POST", "/api/credshare/keys/rotate", annToken, { publicKey: next.publicKey, challengeId: ch.challengeId, answer, grants: grants.map((g) => ({ vaultId: g.vaultId, wrappedDek: seal(open(g.wrappedDek, ann), next.publicKey) })) });
  assert.equal(reuse.status, 403);
  assert.equal((await get(`SELECT public_key FROM credshare_keys WHERE user_id = ?`, ["u_ann"])).public_key, ann.publicKey);
});

test("rotation must re-seal every grant, then swaps key and grants together", async () => {
  const next = keypair();
  const grants = (await call("GET", "/api/credshare/me/grants", annToken)).body.grants;
  assert.equal(grants.length, 2);
  let ch = (await call("POST", "/api/credshare/keys/challenge", annToken)).body;
  let answer = sodium.to_string(open(ch.sealed, ann));
  const partial = await call("POST", "/api/credshare/keys/rotate", annToken, { publicKey: next.publicKey, challengeId: ch.challengeId, answer, grants: [{ vaultId: grants[0].vaultId, wrappedDek: seal(dek, next.publicKey) }] });
  assert.equal(partial.status, 409);
  assert.equal(partial.body.code, "grants_changed");

  ch = (await call("POST", "/api/credshare/keys/challenge", annToken)).body;
  answer = sodium.to_string(open(ch.sealed, ann));
  const ok = await call("POST", "/api/credshare/keys/rotate", annToken, {
    publicKey: next.publicKey, challengeId: ch.challengeId, answer,
    grants: grants.map((g) => ({ vaultId: g.vaultId, wrappedDek: seal(open(g.wrappedDek, ann), next.publicKey) }))
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.regranted, 2);
  assert.equal((await get(`SELECT public_key FROM credshare_keys WHERE user_id = ?`, ["u_ann"])).public_key, next.publicKey);
  for (const g of (await call("GET", "/api/credshare/me/grants", annToken)).body.grants) {
    assert.deepEqual(open(g.wrappedDek, next), dek);
  }
  assert.ok(await get(`SELECT 1 FROM credshare_audit WHERE action = 'identity:rotate'`));
  Object.assign(ann, next);
});

test("a person's grant read is audited with IP and user agent, and returns the key version", async () => {
  const r = await call("GET", "/api/credshare/vaults/v_web/grant", annToken, undefined, { "x-forwarded-for": "35.241.182.141", "user-agent": "curl/8.0" });
  assert.equal(r.status, 200);
  assert.equal(r.body.keyVersion, 1);
  const row = await get(`SELECT * FROM credshare_audit WHERE action = 'vault:read' AND vault_id = 'v_web' ORDER BY created_at DESC`);
  assert.equal(row.ip, "35.241.182.141");
  assert.equal(row.user_agent, "curl/8.0");
  const listed = await call("GET", "/api/credshare/vaults/v_web/secrets", annToken);
  assert.equal(listed.body.keyVersion, 1);
  assert.ok(await get(`SELECT 1 FROM credshare_audit WHERE action = 'secrets:fetch' AND vault_id = 'v_web'`));
  const trail = await call("GET", "/api/credshare/teams/acme/audit?vault=web--prod&limit=5", annToken);
  assert.equal(trail.status, 200);
  assert.ok(trail.body.audit.some((a) => a.ip === "35.241.182.141" && a.actor === "ann@example.com"));
});

test("a write naming a retired key version is refused", async () => {
  await run(`UPDATE credshare_vaults SET key_version = 2 WHERE id = 'v_api'`);
  const stale = await call("PUT", "/api/credshare/vaults/v_api/secrets", annToken, { keyVersion: 1, upserts: [{ name: "A", nonce: "n", ciphertext: "c", fingerprint: "f" }], deletes: [] });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "vault_rekeyed");
  const fresh = await call("PUT", "/api/credshare/vaults/v_api/secrets", annToken, { keyVersion: 2, upserts: [{ name: "A", nonce: "n", ciphertext: "c", fingerprint: "f" }], deletes: [] });
  assert.equal(fresh.status, 200);
});

test("members carry fingerprints", async () => {
  const r = await call("GET", "/api/credshare/teams/acme/members", annToken);
  const me = r.body.members.find((m) => m.email === "ann@example.com");
  assert.equal(me.fingerprint, keyFingerprint(ann.publicKey));
  assert.match(me.fingerprint, /^([0-9a-f]{4} ){7}[0-9a-f]{4}$/);
});

test("sessions are stored as sha256 of the cookie, and still sign in", async () => {
  const r = await fetch(`${base}/test/session`, { method: "POST" });
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith("mc_sess="));
  const raw = decodeURIComponent(cookie.split("=")[1]);
  assert.ok(await get(`SELECT 1 FROM sessions WHERE token = ?`, [sha256(raw)]));
  assert.equal(await get(`SELECT 1 FROM sessions WHERE token = ?`, [raw]), null);
  const who = await (await fetch(`${base}/test/whoami`, { headers: { cookie } })).json();
  assert.equal(who.user, "u_ann");
});

test("security headers: CSP without inline script, HSTS, no framing, no referrer", async () => {
  const r = await call("GET", "/api/credshare/me", annToken);
  const csp = r.headers.get("content-security-policy");
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(r.headers.get("strict-transport-security"), /max-age=\d+/);
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("cache-control"), "no-store");
});
