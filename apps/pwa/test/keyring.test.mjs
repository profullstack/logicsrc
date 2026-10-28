// /api/keyring + /keyring: the account copy of `logicsrc keyring`. The server
// must hold ciphertext only: real envelopes made with the OpenCreds reference
// code are accepted, anything carrying plaintext private key material is
// refused, the stored row never contains it, and the page's in-browser
// decryption (public/keyring.js) opens what the CLI sealed.
process.env.DATABASE_URL = process.env.PWA_TEST_DATABASE_URL || ":memory:";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import express from "express";
import { createItem, createVault, encryptItem } from "@logicsrc/opencreds";

const here = dirname(fileURLToPath(import.meta.url));
const { db, run, all, isPostgres } = await import("../src/db.mjs");
const { keyringRouter, containsPrivateMaterial } = await import("../src/routes/keyring.mjs");

if (isPostgres) {
  await db.execute("DROP SCHEMA public CASCADE");
  await db.execute("CREATE SCHEMA public");
}
const { readdirSync } = await import("node:fs");
const migDir = join(here, "..", "src", isPostgres ? "migrations-pg" : "migrations");
for (const file of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = readFileSync(join(migDir, file), "utf8");
  for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.execute(statement);
}
for (const uid of ["u1", "u2"]) await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, [uid, `${uid}@e.test`, Date.now()]);

// Bearer handling is the shared lib's; here a header stands in for a person's key.
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use((req, _res, next) => {
  const u = req.get("x-user");
  req.user = u ? { id: u, email: `${u}@e.test` } : null;
  next();
});
app.use(keyringRouter);
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;

async function call(user, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(user ? { "x-user": user } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

// The write path: real person API keys, resolved by the real lib/apikey lookup.
const bearerApp = express();
bearerApp.use(express.json({ limit: "10mb" }));
bearerApp.use((req, _res, next) => { req.user = null; next(); });
const realUser = await import("../src/lib/apikey.mjs");
// Insert real person API keys so keyForBearer resolves them.
const keyFor = {};
for (const uid of ["u1", "u2"]) {
  const created = await realUser.createApiKey(uid, `test-${uid}`, { kind: "user" });
  keyFor[uid] = created.plaintext;
}
bearerApp.use(keyringRouter);
const server2 = bearerApp.listen(0);
await new Promise((r) => server2.once("listening", r));
const base2 = `http://127.0.0.1:${server2.address().port}`;
test.after(() => Promise.all([new Promise((r) => server.close(r)), new Promise((r) => server2.close(r))]));

async function cli(user, method, path, body) {
  const res = await fetch(base2 + path, {
    method,
    headers: { authorization: `Bearer ${keyFor[user]}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

const PASS = "correct horse battery staple";
const vault = await createVault(PASS);
const { privateKey: PRIV } = generateKeyPairSync("ed25519", { privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const PUB = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFK+fzMc3AneHlJ9+KGxhlTbhQDv4xlwE0oNmVCPpEL1 throwaway@test";

// A browser session may only read; writes need the CLI's Bearer key.
test("no session, no key: 401; a session cannot write", async () => {
  assert.equal((await call(null, "GET", "/api/keyring")).status, 401);
  assert.equal((await call("u1", "PUT", "/api/keyring/meta", { meta: {} })).status, 403);
});

async function sealed(id, privateKey = PRIV) {
  const item = createItem("key", { name: "id_ed25519", key: { keyType: "ssh", algorithm: "ssh-ed25519", publicKey: PUB, privateKey } });
  item.id = id;
  const envelope = await encryptItem(vault.userKey, item);
  const now = new Date().toISOString();
  return { id, name: "id_ed25519", type: "ssh-ed25519", filename: "id_ed25519", publicKey: PUB, fingerprint: "SHA256:xlBmhjCwKIXfA2QBSQxLR8zil6z3Lm7SqPFQmHW0jkI", comment: "throwaway@test", createdAt: now, updatedAt: now, envelope, deletedAt: null };
}

test("meta: created once, identical re-put ok, a different keyring is 409", async () => {
  assert.deepEqual((await cli("u1", "GET", "/api/keyring")).body, { meta: null, entries: [] });
  assert.equal((await cli("u1", "PUT", "/api/keyring/meta", { meta: vault.meta })).status, 200);
  assert.equal((await cli("u1", "PUT", "/api/keyring/meta", { meta: vault.meta })).status, 200);
  const other = await createVault("another");
  const r = await cli("u1", "PUT", "/api/keyring/meta", { meta: other.meta });
  assert.equal(r.status, 409);
  assert.equal(r.body.meta.kdfSalt, vault.meta.kdfSalt);
});

test("an entry with a real envelope is stored; the row holds ciphertext only", async () => {
  const entry = await sealed("11111111-1111-4111-8111-111111111111");
  assert.equal((await cli("u1", "PUT", `/api/keyring/entries/${entry.id}`, { entry })).status, 200);
  const rows = await all(`SELECT * FROM keyring_entries WHERE user_id = ?`, ["u1"]);
  assert.equal(rows.length, 1);
  const dump = JSON.stringify(rows);
  assert.ok(!dump.includes("PRIVATE KEY"), "no PEM header in the row");
  assert.ok(!dump.includes(PRIV.split("\n")[1]), "no private key body in the row");
  assert.ok(!containsPrivateMaterial(dump));
  assert.equal(JSON.parse(rows[0].envelope).ciphertext, entry.envelope.ciphertext);

  // Default listing: public halves only, no envelopes.
  const list = await cli("u1", "GET", "/api/keyring");
  assert.equal(list.body.entries[0].publicKey, PUB);
  assert.equal(list.body.entries[0].envelope, undefined);
  // Other users see nothing.
  assert.deepEqual((await cli("u2", "GET", "/api/keyring")).body.entries, []);
});

test("plaintext private key material is refused wherever it is put", async () => {
  const id = "22222222-2222-4222-8222-222222222222";
  const good = await sealed(id);
  const cases = [
    { ...good, publicKey: PRIV },
    { ...good, comment: "-----BEGIN OPENSSH PRIVATE KEY-----" },
    { ...good, envelope: { ...good.envelope, ciphertext: Buffer.from(PRIV).toString("base64").replace(/=+$/, "") + "==" , iv: good.envelope.iv } },
    { ...good, envelope: { ...good.envelope, privateKey: PRIV } },
    { ...good, envelope: { ...good.envelope, extra: "x" } },
    { ...good, envelope: { ...good.envelope, ciphertext: "not base64!" } },
    { ...good, envelope: null },
    { ...good, comment: "AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ" }
  ];
  for (const entry of cases) {
    const r = await cli("u1", "PUT", `/api/keyring/entries/${id}`, { entry });
    assert.equal(r.status, 422, `case refused: ${JSON.stringify(r.body)}`);
  }
  const rows = await all(`SELECT * FROM keyring_entries WHERE user_id = ? AND id = ?`, ["u1", id]);
  for (const row of rows) assert.ok(!containsPrivateMaterial(JSON.stringify(row)));
});

test("last writer wins; tombstones reach the listing with include=envelopes", async () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const first = await sealed(id);
  assert.equal((await cli("u1", "PUT", `/api/keyring/entries/${id}`, { entry: first })).status, 200);
  const stale = { ...first, comment: "older", updatedAt: new Date(Date.parse(first.updatedAt) - 60_000).toISOString() };
  const r = await cli("u1", "PUT", `/api/keyring/entries/${id}`, { entry: stale });
  assert.equal(r.status, 409);
  assert.equal(r.body.entry.comment, "throwaway@test");

  const del = await cli("u1", "DELETE", `/api/keyring/entries/${id}`);
  assert.equal(del.status, 200);
  const all1 = await cli("u1", "GET", "/api/keyring?include=envelopes");
  const tomb = all1.body.entries.find((e) => e.id === id);
  assert.ok(tomb.deletedAt);
  assert.equal(tomb.envelope, null);
  assert.ok(!(await cli("u1", "GET", "/api/keyring")).body.entries.some((e) => e.id === id));
});

test("the page's in-browser decryption opens what the CLI sealed", async () => {
  runInThisContext(readFileSync(join(here, "..", "public", "keyring.js"), "utf8"));
  const { userKeyFrom, openEnvelope } = globalThis.__logicsrcKeyring;
  const { body } = await cli("u1", "GET", "/api/keyring?include=envelopes");
  const entry = body.entries.find((e) => e.envelope);
  const userKey = await userKeyFrom(body.meta, PASS);
  assert.equal(await openEnvelope(body.meta, userKey, entry.envelope), PRIV);
  await assert.rejects(() => userKeyFrom(body.meta, "wrong"), /Wrong keyring passphrase/);
});

test("a machine key is refused", async () => {
  const machine = await realUser.createApiKey("u1", "box", { kind: "machine" });
  const res = await fetch(base2 + "/api/keyring", { headers: { authorization: `Bearer ${machine.plaintext}` } });
  assert.equal(res.status, 403);
});

test("the /keyring page lists public halves and never an envelope", async () => {
  const { keyringPageBody } = await import("../src/routes/keyring.mjs");
  const rows = await all(`SELECT * FROM keyring_entries WHERE user_id = ? AND deleted_at IS NULL`, ["u1"]);
  const html = keyringPageBody(rows);
  assert.ok(html.includes("SHA256:xlBmhjCwKIXfA2QBSQxLR8zil6z3Lm7SqPFQmHW0jkI"));
  assert.ok(html.includes("ssh-ed25519 AAAAC3"));
  assert.ok(!html.includes(rows[0].envelope ? JSON.parse(rows[0].envelope).ciphertext : "@@"));
});
