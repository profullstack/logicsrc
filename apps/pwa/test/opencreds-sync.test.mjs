// /api/opencreds: the account copy of a personal vault. The server stores
// ciphertext and enforces one rule, optimistic revisions: a write based on a
// revision someone else already moved is refused with the current row.
process.env.DATABASE_URL = process.env.PWA_TEST_DATABASE_URL || ":memory:";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";

const here = dirname(fileURLToPath(import.meta.url));
const { db, run, isPostgres } = await import("../src/db.mjs");
const { opencredsRouter } = await import("../src/routes/opencreds.mjs");

if (isPostgres) {
  await db.execute("DROP SCHEMA public CASCADE");
  await db.execute("CREATE SCHEMA public");
}
for (const file of ["001_auth.sql", "004_opencreds_sync.sql"]) {
  const sql = readFileSync(join(here, "..", "src", isPostgres ? "migrations-pg" : "migrations", file), "utf8");
  for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.execute(statement);
}
for (const uid of ["u1", "u2"]) await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, [uid, `${uid}@e.test`, Date.now()]);

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use((req, _res, next) => { req.user = req.get("x-user") ? { id: req.get("x-user") } : null; next(); });
app.use(opencredsRouter);
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => new Promise((r) => server.close(r)));

async function call(user, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(user ? { "x-user": user } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}
const meta = (tag) => ({ opencreds: "0.1", namespace: "opencreds", createdAt: "2026-10-04T00:00:00Z", protectedUserKey: "pk-" + tag, protectedUserKeyIv: "iv" });
const env = (id, c) => ({ id, type: 1, ciphertext: c, iv: "iv-" + c });

test("no session, no key: 401", async () => {
  assert.equal((await call(null, "GET", "/api/opencreds/vault")).status, 401);
});

test("meta: create once, update on the current revision, refuse a stale one", async () => {
  assert.equal((await call("u1", "GET", "/api/opencreds/vault")).status, 404);
  assert.deepEqual((await call("u1", "PUT", "/api/opencreds/vault/meta", { meta: meta("a"), baseRevision: 0 })).body, { ok: true, revision: 1 });

  const again = await call("u1", "PUT", "/api/opencreds/vault/meta", { meta: meta("b"), baseRevision: 0 });
  assert.equal(again.status, 409);
  assert.equal(again.body.vault.meta.protectedUserKey, "pk-a");

  assert.equal((await call("u1", "PUT", "/api/opencreds/vault/meta", { meta: meta("c"), baseRevision: 1 })).body.revision, 2);
  const stale = await call("u1", "PUT", "/api/opencreds/vault/meta", { meta: meta("d"), baseRevision: 1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.vault.metaRevision, 2);
});

test("items: insert, update, conflict returns the current row, tombstone, cursor", async () => {
  let r = await call("u1", "PUT", "/api/opencreds/items", { changes: [{ id: "i1", envelope: env("i1", "c1"), baseRevision: 0 }, { id: "i2", envelope: env("i2", "x"), baseRevision: 0 }] });
  assert.equal(r.body.applied.length, 2);
  assert.equal(r.body.conflicts.length, 0);

  r = await call("u1", "PUT", "/api/opencreds/items", { changes: [{ id: "i1", envelope: env("i1", "c2"), baseRevision: 1 }] });
  assert.deepEqual(r.body.applied.map((a) => a.revision), [2]);

  r = await call("u1", "PUT", "/api/opencreds/items", { changes: [{ id: "i1", envelope: env("i1", "stale"), baseRevision: 1 }] });
  assert.equal(r.body.applied.length, 0);
  assert.equal(r.body.conflicts[0].revision, 2);
  assert.equal(r.body.conflicts[0].envelope.ciphertext, "c2");

  r = await call("u1", "PUT", "/api/opencreds/items", { changes: [{ id: "i2", envelope: null, baseRevision: 1 }] });
  assert.equal(r.body.applied[0].revision, 2);

  const all = await call("u1", "GET", "/api/opencreds/items?since=0");
  const byId = Object.fromEntries(all.body.items.map((i) => [i.id, i]));
  assert.equal(byId.i1.envelope.ciphertext, "c2");
  assert.equal(byId.i1.envelope.revision, 2);
  assert.equal(byId.i2.envelope, null);

  const later = await call("u1", "GET", `/api/opencreds/items?since=${byId.i2.seq}`);
  assert.deepEqual(later.body.items.map((i) => i.id), ["i2"]);

  const v = await call("u1", "GET", "/api/opencreds/vault");
  assert.equal(v.body.vault.itemCount, 1);
});

test("an update to a row that does not exist is a conflict at revision 0", async () => {
  const r = await call("u1", "PUT", "/api/opencreds/items", { changes: [{ id: "ghost", envelope: env("ghost", "g"), baseRevision: 3 }] });
  assert.deepEqual(r.body.conflicts, [{ id: "ghost", envelope: null, revision: 0, seq: 0 }]);
});

test("one user's vault is invisible to another", async () => {
  assert.equal((await call("u2", "GET", "/api/opencreds/vault")).status, 404);
  assert.deepEqual((await call("u2", "GET", "/api/opencreds/items?since=0")).body.items, []);
  const r = await call("u2", "PUT", "/api/opencreds/items", { changes: [{ id: "i1", envelope: env("i1", "u2"), baseRevision: 0 }] });
  assert.equal(r.status, 409, "items need the user's own vault first");
});

test("malformed changes are refused before anything is written", async () => {
  const mismatch = await call("u1", "PUT", "/api/opencreds/items", { changes: [{ id: "a", envelope: env("b", "x"), baseRevision: 0 }] });
  assert.equal(mismatch.status, 422);
  const noBase = await call("u1", "PUT", "/api/opencreds/items", { changes: [{ id: "a", envelope: env("a", "x") }] });
  assert.equal(noBase.status, 422);
  assert.equal((await call("u1", "PUT", "/api/opencreds/vault/meta", { meta: "nope", baseRevision: 0 })).status, 422);
});

test("folders follow the same revision rule", async () => {
  assert.equal((await call("u1", "PUT", "/api/opencreds/vault/folders", { ciphertext: "f", iv: "i", baseRevision: 0 })).body.revision, 1);
  assert.equal((await call("u1", "PUT", "/api/opencreds/vault/folders", { ciphertext: "g", iv: "i", baseRevision: 0 })).status, 409);
});

test("reset drops the vault and its items", async () => {
  await call("u1", "DELETE", "/api/opencreds/vault");
  assert.equal((await call("u1", "GET", "/api/opencreds/vault")).status, 404);
  assert.deepEqual((await call("u1", "GET", "/api/opencreds/items?since=0")).body.items, []);
});
