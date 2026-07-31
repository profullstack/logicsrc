// Integration tests for POST /api/credshare/vaults/:id/rekey.
//
// The endpoint is the last line of defence on a genuinely unrecoverable
// operation: the vault DEK exists only inside the grants, so a rotation that
// commits half-way, drops a secret, or leaves the caller ungranted destroys the
// vault permanently. These tests pin the guards that stop that.
//
// Runs against an in-memory libSQL database, so DATABASE_URL must be set before
// anything imports db.mjs.
process.env.DATABASE_URL = ":memory:";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";

const here = dirname(fileURLToPath(import.meta.url));
const { db, run, get, all } = await import("../src/db.mjs");
const { credshareRouter } = await import("../src/routes/credshare.mjs");

/** Apply the schema this router depends on. */
async function migrate() {
  for (const file of ["001_auth.sql", "002_credshare.sql"]) {
    const sql = readFileSync(join(here, "..", "src", "migrations", file), "utf8");
    for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
      await db.execute(statement);
    }
  }
}

/**
 * Mount the router with a fixed acting user, mimicking a browser session.
 * Returns a fetch-like helper bound to an ephemeral port.
 */
async function serve(actingUserId) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: actingUserId };
    next();
  });
  app.use(credshareRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    async post(path, body) {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      return { status: res.status, body: await res.json() };
    },
    async get(path) {
      const res = await fetch(`${base}${path}`);
      return { status: res.status, body: await res.json() };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const now = Date.now();

/** A team with one vault, two granted members, and two secrets. */
async function seed() {
  await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, ["u_me", "me@example.com", now]);
  await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, ["u_them", "them@example.com", now]);
  await run(`INSERT INTO credshare_keys (user_id, public_key, updated_at) VALUES (?,?,?)`, ["u_me", "pk-me", now]);
  await run(`INSERT INTO credshare_keys (user_id, public_key, updated_at) VALUES (?,?,?)`, ["u_them", "pk-them", now]);
  await run(`INSERT INTO credshare_teams (id, slug, name, created_by, created_at) VALUES (?,?,?,?,?)`, ["t1", "acme", "Acme", "u_me", now]);
  await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, created_at) VALUES (?,?,?,?,?,?,?)`,
    ["m1", "t1", "u_me", "me@example.com", "owner", "active", now]);
  await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, created_at) VALUES (?,?,?,?,?,?,?)`,
    ["m2", "t1", "u_them", "them@example.com", "member", "active", now]);
  await run(`INSERT INTO credshare_vaults (id, team_id, name, created_by, created_at) VALUES (?,?,?,?,?)`, ["v1", "t1", "app--prod", "u_me", now]);
  for (const uid of ["u_me", "u_them"]) {
    await run(`INSERT INTO credshare_vault_grants (vault_id, user_id, wrapped_dek, granted_by, created_at) VALUES (?,?,?,?,?)`,
      ["v1", uid, `old-wrapped-${uid}`, "u_me", now]);
  }
  await run(`INSERT INTO credshare_secrets (vault_id, name, nonce, ciphertext, fingerprint, version, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ["v1", "API_KEY", "n1", "c1", "fp-api", 1, "u_me", now]);
  await run(`INSERT INTO credshare_secrets (vault_id, name, nonce, ciphertext, fingerprint, version, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ["v1", "DB_URL", "n2", "c2", "fp-db", 1, "u_me", now]);
}

/** A well-formed rotation: same names, same fingerprints, fresh ciphertext. */
function validBody(overrides = {}) {
  return {
    grants: [
      { email: "me@example.com", wrappedDek: "new-wrapped-me" },
      { email: "them@example.com", wrappedDek: "new-wrapped-them" }
    ],
    secrets: [
      { name: "API_KEY", nonce: "n1b", ciphertext: "c1b", fingerprint: "fp-api" },
      { name: "DB_URL", nonce: "n2b", ciphertext: "c2b", fingerprint: "fp-db" }
    ],
    revoke: [],
    ...overrides
  };
}

await migrate();
await seed();

test("re-keys every secret and grant in one commit", async (t) => {
  const app = await serve("u_me");
  t.after(() => app.close());

  const res = await app.post("/api/credshare/vaults/v1/rekey", validBody());
  assert.equal(res.status, 200);
  assert.equal(res.body.rekeyed, 2);

  const secrets = await all(`SELECT name, nonce, ciphertext, fingerprint, version FROM credshare_secrets WHERE vault_id = 'v1' ORDER BY name`);
  // New ciphertext, bumped version -- and the fingerprint is untouched, which
  // is the machine-checkable statement that no VALUE changed.
  assert.deepEqual(secrets.map((s) => s.ciphertext), ["c1b", "c2b"]);
  assert.deepEqual(secrets.map((s) => s.version), [2, 2]);
  assert.deepEqual(secrets.map((s) => s.fingerprint), ["fp-api", "fp-db"]);

  const grants = await all(`SELECT user_id, wrapped_dek FROM credshare_vault_grants WHERE vault_id = 'v1' ORDER BY user_id`);
  assert.deepEqual(grants.map((g) => g.wrapped_dek), ["new-wrapped-me", "new-wrapped-them"]);

  const audit = await get(`SELECT action FROM credshare_audit WHERE vault_id = 'v1' AND action = 'vault:rekey'`);
  assert.equal(audit.action, "vault:rekey");
});

test("refuses a rotation that would change a value", async (t) => {
  const app = await serve("u_me");
  t.after(() => app.close());

  const res = await app.post("/api/credshare/vaults/v1/rekey", validBody({
    secrets: [
      { name: "API_KEY", nonce: "x", ciphertext: "x", fingerprint: "fp-DIFFERENT" },
      { name: "DB_URL", nonce: "n2c", ciphertext: "c2c", fingerprint: "fp-db" }
    ]
  }));

  assert.equal(res.status, 409);
  assert.match(res.body.error, /never changes values/);
  // Nothing was written.
  const row = await get(`SELECT ciphertext FROM credshare_secrets WHERE vault_id = 'v1' AND name = 'DB_URL'`);
  assert.equal(row.ciphertext, "c2b");
});

test("refuses a rotation that drops a secret", async (t) => {
  const app = await serve("u_me");
  t.after(() => app.close());

  const res = await app.post("/api/credshare/vaults/v1/rekey", validBody({
    secrets: [{ name: "API_KEY", nonce: "z", ciphertext: "z", fingerprint: "fp-api" }]
  }));

  assert.equal(res.status, 409);
  assert.match(res.body.error, /covers 1 secret\(s\) but the vault holds 2/);
});

test("refuses to let the caller lock themselves out", async (t) => {
  const app = await serve("u_me");
  t.after(() => app.close());

  const res = await app.post("/api/credshare/vaults/v1/rekey", validBody({
    grants: [{ email: "them@example.com", wrappedDek: "new-wrapped-them" }]
  }));

  assert.equal(res.status, 422);
  assert.match(res.body.error, /must include your own grant/);
});

test("refuses a rotation that grants nobody", async (t) => {
  const app = await serve("u_me");
  t.after(() => app.close());

  const res = await app.post("/api/credshare/vaults/v1/rekey", validBody({ grants: [] }));

  assert.equal(res.status, 422);
  assert.match(res.body.error, /at least one member/);
});

test("revoking drops the grant row so access is not merely stale", async (t) => {
  const app = await serve("u_me");
  t.after(() => app.close());

  const res = await app.post("/api/credshare/vaults/v1/rekey", validBody({
    grants: [{ email: "me@example.com", wrappedDek: "newer-me" }],
    secrets: [
      { name: "API_KEY", nonce: "n1d", ciphertext: "c1d", fingerprint: "fp-api" },
      { name: "DB_URL", nonce: "n2d", ciphertext: "c2d", fingerprint: "fp-db" }
    ],
    revoke: ["them@example.com"]
  }));

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.revoked, ["them@example.com"]);

  const theirs = await get(`SELECT 1 AS hit FROM credshare_vault_grants WHERE vault_id = 'v1' AND user_id = 'u_them'`);
  assert.equal(theirs, null, "revoked member should have no grant row left");

  // And the revocation is on the audit trail by name.
  const ev = await get(`SELECT key_name FROM credshare_audit WHERE vault_id = 'v1' AND action = 'vault:revoke'`);
  assert.equal(ev.key_name, "them@example.com");
});

test("a member with no vault access cannot re-key it", async (t) => {
  // u_them was just revoked above, so they are an active member without a grant.
  const app = await serve("u_them");
  t.after(() => app.close());

  const res = await app.post("/api/credshare/vaults/v1/rekey", validBody());

  assert.equal(res.status, 403);
  assert.match(res.body.error, /Only a member with vault access/);
});

test("grants expose public keys and status so a client can re-seal in one pass", async (t) => {
  const app = await serve("u_me");
  t.after(() => app.close());

  const res = await app.get("/api/credshare/vaults/v1/grants");

  assert.equal(res.status, 200);
  const me = res.body.grants.find((g) => g.email === "me@example.com");
  assert.equal(me.publicKey, "pk-me");
  assert.equal(me.status, "active");
  assert.equal(me.hasAccess, true);
});
