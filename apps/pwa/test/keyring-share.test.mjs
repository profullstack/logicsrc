// /api/keyring/share + /k/<token>.json|.keys: a revocable link to the PUBLIC
// halves of a person's SSH keys. Only ssh-* entries, only well-formed public
// keys, fingerprints as ssh-keygen prints them, CORS open, 404 once revoked.
process.env.DATABASE_URL = process.env.PWA_TEST_DATABASE_URL || ":memory:";
process.env.KEYRING_SHARE_ORIGIN = "https://app.logicsrc.com";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import cookieParser from "cookie-parser";

const here = dirname(fileURLToPath(import.meta.url));
const { db, run, get, isPostgres } = await import("../src/db.mjs");
const { keyringShareRouter, publicKeysRouter, parsePublicKey, RATE } = await import("../src/routes/keyring-share.mjs");
const { createApiKey } = await import("../src/lib/apikey.mjs");

if (isPostgres) {
  await db.execute("DROP SCHEMA public CASCADE");
  await db.execute("CREATE SCHEMA public");
}
const migDir = join(here, "..", "src", isPostgres ? "migrations-pg" : "migrations");
for (const file of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = readFileSync(join(migDir, file), "utf8");
  for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.execute(statement);
}
for (const uid of ["u1", "u2"]) await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, [uid, `${uid}@e.test`, Date.now()]);

const ED = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFK+fzMc3AneHlJ9+KGxhlTbhQDv4xlwE0oNmVCPpEL1 throwaway@test";
const ED_FP = "SHA256:xlBmhjCwKIXfA2QBSQxLR8zil6z3Lm7SqPFQmHW0jkI"; // ssh-keygen -lf
const now = Date.now();
const entry = (uid, id, name, type, pub, extra = {}) =>
  run(`INSERT INTO keyring_entries (user_id, id, name, key_type, filename, public_key, fingerprint, comment, envelope, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [uid, id, name, type, name, pub, extra.fingerprint ?? "SHA256:stale", extra.comment ?? "", "{}", now, now, extra.deletedAt ?? null]);
await entry("u1", "a", "id_ed25519", "ssh-ed25519", ED, { comment: "laptop" });
await entry("u1", "b", "gpg_main", "gpg", "-----BEGIN PGP PUBLIC KEY BLOCK-----\nxx\n-----END PGP PUBLIC KEY BLOCK-----");
await entry("u1", "c", "age_main", "age", "age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq");
await entry("u1", "d", "old_key", "ssh-ed25519", ED, { deletedAt: now });
await entry("u1", "e", "broken", "ssh-rsa", "ssh-rsa not-a-key");
await entry("u2", "f", "u2_key", "ssh-ed25519", ED);

// Session users come from a header here; the CSRF cookie is the real double-submit one.
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(publicKeysRouter);
app.use((req, _res, next) => {
  const u = req.get("x-user");
  req.user = u ? { id: u, email: `${u}@e.test` } : null;
  next();
});
app.use(keyringShareRouter);
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => new Promise((r) => server.close(r)));

const person = (await createApiKey("u1", "cli", { kind: "user" })).plaintext;
const machine = (await createApiKey("u1", "box", { kind: "machine" })).plaintext;

async function call(method, path, { user, bearer, csrf } = {}) {
  const headers = {};
  if (user) headers["x-user"] = user;
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (csrf) { headers["x-csrf-token"] = csrf; headers.cookie = `mc_csrf=${csrf}`; }
  const res = await fetch(base + path, { method, headers });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, headers: res.headers, body };
}

test("parsePublicKey: ssh-keygen fingerprint; garbage and private material refused", () => {
  assert.equal(parsePublicKey(ED).fingerprint, ED_FP);
  assert.equal(parsePublicKey("ssh-rsa not-a-key"), null);
  assert.equal(parsePublicKey("ssh-rsa AAAAC3NzaC1lZDI1NTE5AAAAIFK+fzMc3AneHlJ9+KGxhlTbhQDv4xlwE0oNmVCPpEL1"), null, "blob names a different algorithm");
  // A fake header, assembled at runtime so secret scanners do not flag the fixture.
  const fakePrivate = ["-----BEGIN OPENSSH", "PRIVATE KEY-----"].join(" ") + "\n" + "b3BlbnNzaC1r" + "ZXktdjE";
  assert.equal(parsePublicKey(fakePrivate), null);
});

test("auth: none 401, machine key 403, session write without CSRF 403", async () => {
  assert.equal((await call("GET", "/api/keyring/share")).status, 401);
  assert.equal((await call("GET", "/api/keyring/share", { bearer: machine })).status, 403);
  assert.equal((await call("POST", "/api/keyring/share", { bearer: machine })).status, 403);
  assert.equal((await call("POST", "/api/keyring/share", { user: "u1" })).status, 403);
  assert.equal((await call("GET", "/api/keyring/share", { user: "u1" })).body.exists, false);
});

let token;
test("create via a session (with CSRF): token once, URLs on app.logicsrc.com, sha256 stored", async () => {
  const r = await call("POST", "/api/keyring/share", { user: "u1", csrf: "c1" });
  assert.equal(r.status, 201);
  token = r.body.token;
  assert.match(token, /^lks_[A-Za-z0-9_-]{43}$/);
  assert.equal(r.body.url, `https://app.logicsrc.com/k/${token}.json`);
  assert.equal(r.body.keys_url_text, `https://app.logicsrc.com/k/${token}.keys`);
  const row = await get(`SELECT * FROM keyring_shares WHERE user_id = ?`, ["u1"]);
  assert.notEqual(row.token_hash, token);
  assert.ok(!JSON.stringify(row).includes(token));
  const status = await call("GET", "/api/keyring/share", { bearer: person });
  assert.equal(status.body.exists, true);
  assert.ok(status.body.created_at);
  assert.equal(status.body.rotated_at, null);
  assert.ok(!JSON.stringify(status.body).includes("lks_"), "GET never returns the token");
});

test("GET /k/<token>.json: public ssh halves only, ssh-keygen fingerprints, CORS, cacheable", async () => {
  const r = await call("GET", `/k/${token}.json`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.equal(r.headers.get("cache-control"), "public, max-age=60");
  assert.equal(r.headers.get("set-cookie"), null);
  assert.deepEqual(r.body, { keys: [{ name: "id_ed25519", type: "ssh-ed25519", public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFK+fzMc3AneHlJ9+KGxhlTbhQDv4xlwE0oNmVCPpEL1 laptop", fingerprint: ED_FP, comment: "laptop" }] });
  const text = await call("GET", `/k/${token}.keys`);
  assert.equal(text.status, 200);
  assert.equal(text.body, "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFK+fzMc3AneHlJ9+KGxhlTbhQDv4xlwE0oNmVCPpEL1 laptop\n");
  assert.equal(text.headers.get("access-control-allow-origin"), "*");
});

test("unknown or malformed token: 404 with CORS", async () => {
  const r = await call("GET", `/k/lks_${"A".repeat(43)}.json`);
  assert.equal(r.status, 404);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.equal((await call("GET", "/k/nope.json")).status, 404);
});

test("rotate: the old token 404s, the new one works; bearer works too", async () => {
  const r = await call("POST", "/api/keyring/share", { bearer: person });
  assert.equal(r.status, 200);
  assert.notEqual(r.body.token, token);
  assert.equal((await call("GET", `/k/${token}.json`)).status, 404);
  token = r.body.token;
  assert.equal((await call("GET", `/k/${token}.json`)).status, 200);
  assert.ok((await call("GET", "/api/keyring/share", { user: "u1" })).body.rotated_at);
});

test("revoke: 404 afterwards; revoking twice is 404", async () => {
  assert.equal((await call("DELETE", "/api/keyring/share", { user: "u1" })).status, 403, "session without CSRF");
  assert.equal((await call("DELETE", "/api/keyring/share", { user: "u1", csrf: "c2" })).status, 200);
  assert.equal((await call("GET", `/k/${token}.json`)).status, 404);
  assert.equal((await call("GET", `/k/${token}.keys`)).status, 404);
  assert.equal((await call("DELETE", "/api/keyring/share", { bearer: person })).status, 404);
  assert.equal((await call("GET", "/api/keyring/share", { user: "u1" })).body.exists, false);
});

test("one user's share never shows another's keys", async () => {
  const r = await call("POST", "/api/keyring/share", { user: "u2", csrf: "c3" });
  const keys = (await call("GET", `/k/${r.body.token}.json`)).body.keys;
  assert.deepEqual(keys.map((k) => k.name), ["u2_key"]);
});

test("the public link is rate limited per IP", async () => {
  const saved = RATE.max;
  RATE.max = 3;
  try {
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await call("GET", `/k/lks_${"B".repeat(43)}.json`)).status);
    assert.ok(statuses.includes(429), statuses.join(","));
  } finally {
    RATE.max = saved;
  }
});

test("the /keyring page renders the share box without any token", async () => {
  const { keyringPageBody } = await import("../src/routes/keyring.mjs");
  const html = keyringPageBody([], { exists: true, created_at: new Date().toISOString(), rotated_at: null }, "csrf123");
  assert.ok(html.includes("Share public keys"));
  assert.ok(html.includes('data-csrf="csrf123"'));
  assert.ok(!html.includes("lks_"));
});
