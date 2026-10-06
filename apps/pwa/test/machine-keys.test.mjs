// Machine API keys: a credential for a deploy box or CI that is narrower than
// the person who made it.
//
// What these pin: the key is stored hashed and shown once; a machine key sees
// one team and only its scoped vaults; it opens a vault only through a grant
// sealed to ITS OWN public key (never the person's); a read-only key is refused
// every write; it cannot mint keys, read /api/me or the personal vault; expired
// and revoked keys are 401; and a person's key behaves exactly as before.
process.env.DATABASE_URL = process.env.PWA_TEST_DATABASE_URL || ":memory:";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";

const here = dirname(fileURLToPath(import.meta.url));
const { db, run, get, all, isPostgres } = await import("../src/db.mjs");
const { credshareRouter } = await import("../src/routes/credshare.mjs");
const { apiKeysRouter } = await import("../src/routes/apikeys.mjs");
const { cliRouter } = await import("../src/routes/cli.mjs");
const { opencredsRouter } = await import("../src/routes/opencreds.mjs");
const { createApiKey, keyForBearer, userForApiKey, parseExpiry } = await import("../src/lib/apikey.mjs");
const { sha256 } = await import("../src/lib/crypto.mjs");

async function migrate() {
  if (isPostgres) {
    await db.execute("DROP SCHEMA public CASCADE");
    await db.execute("CREATE SCHEMA public");
  }
  for (const file of ["001_auth.sql", "002_credshare.sql", "005_machine_keys.sql"]) {
    const sql = readFileSync(join(here, "..", "src", isPostgres ? "migrations-pg" : "migrations", file), "utf8");
    for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
      await db.execute(statement);
    }
  }
}

/** The app as production mounts it, minus sessions: every request is Bearer-authed. */
async function serve() {
  const app = express();
  app.use(express.json());
  app.use(credshareRouter);
  app.use(apiKeysRouter);
  app.use(opencredsRouter);
  app.use(cliRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, token, body) => {
    const headers = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return {
    get: (path, token) => call("GET", path, token),
    post: (path, token, body) => call("POST", path, token, body ?? {}),
    put: (path, token, body) => call("PUT", path, token, body ?? {}),
    del: (path, token) => call("DELETE", path, token),
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

const now = Date.now();

/** Ann owns team acme (vaults web--prod, api--prod) and is in team other (vault x--prod). */
async function seed() {
  await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, ["u_ann", "ann@example.com", now]);
  await run(`INSERT INTO credshare_keys (user_id, public_key, updated_at) VALUES (?,?,?)`, ["u_ann", "pk-ann", now]);
  for (const [tid, slug] of [["t_acme", "acme"], ["t_other", "other"]]) {
    await run(`INSERT INTO credshare_teams (id, slug, name, created_by, created_at) VALUES (?,?,?,?,?)`, [tid, slug, slug, "u_ann", now]);
    await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, created_at) VALUES (?,?,?,?,?,?,?)`,
      [`m_${slug}`, tid, "u_ann", "ann@example.com", "owner", "active", now]);
  }
  for (const [vid, tid, name] of [["v_web", "t_acme", "web--prod"], ["v_api", "t_acme", "api--prod"], ["v_x", "t_other", "x--prod"]]) {
    await run(`INSERT INTO credshare_vaults (id, team_id, name, created_by, created_at) VALUES (?,?,?,?,?)`, [vid, tid, name, "u_ann", now]);
    await run(`INSERT INTO credshare_vault_grants (vault_id, user_id, wrapped_dek, granted_by, created_at) VALUES (?,?,?,?,?)`, [vid, "u_ann", `dek-ann-${vid}`, "u_ann", now]);
    await run(`INSERT INTO credshare_secrets (vault_id, name, nonce, ciphertext, fingerprint, version, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      [vid, "API_KEY", "n", "c", "fp", 1, "u_ann", now]);
  }
}

await migrate();
await seed();
const http = await serve();
test.after(() => http.close());

// Ann's person key, minted the way `logicsrc login` mints it.
const { plaintext: annKey } = await createApiKey("u_ann", "laptop");

test("a key is stored as sha256 with a display prefix, and the plaintext only resolves while live", async () => {
  const { plaintext, row } = await createApiKey("u_ann", "hash-check");
  assert.match(plaintext, /^lsk_/);
  const stored = await get(`SELECT * FROM api_keys WHERE id = ?`, [row.id]);
  assert.equal(stored.token_hash, sha256(plaintext));
  assert.notEqual(stored.token_hash, plaintext);
  assert.equal(stored.prefix, plaintext.slice(0, 12));
  assert.equal(stored.kind, "user");
  assert.equal(Number(stored.read_only), 0, "person keys are never read-only");
  assert.equal((await keyForBearer(plaintext)).user.id, "u_ann");
  assert.equal(await keyForBearer(plaintext + "x"), null);
  assert.equal(await keyForBearer("not-a-key"), null);
});

test("expiry durations parse, and a past date is refused", () => {
  assert.equal(parseExpiry("30d", 0), 30 * 86400e3);
  assert.equal(parseExpiry("12h", 0), 12 * 3600e3);
  assert.equal(parseExpiry(null), null);
  assert.equal(parseExpiry("2027-01-01T00:00:00Z"), Date.parse("2027-01-01T00:00:00Z"));
  assert.throws(() => parseExpiry("soonish"));
});

test("a person mints a machine key over the API; the secret is in that response only", async () => {
  const made = await http.post("/api/keys", annKey, { name: "dev2-deploy", kind: "machine", team: "acme", vaults: ["web--prod"], readOnly: true, expiresAt: "90d" });
  assert.equal(made.status, 201);
  assert.match(made.body.secret, /^lsk_/);
  assert.equal(made.body.key.kind, "machine");
  assert.equal(made.body.key.team, "acme");
  assert.deepEqual(made.body.key.vaults, ["web--prod"]);
  assert.equal(made.body.key.readOnly, true);
  assert.ok(made.body.key.expiresAt > Date.now());

  const listed = await http.get("/api/keys", annKey);
  assert.equal(listed.status, 200);
  const row = listed.body.keys.find((k) => k.name === "dev2-deploy");
  assert.ok(row);
  assert.equal(JSON.stringify(listed.body).includes(made.body.secret), false, "the list never carries a secret");
  assert.equal("token_hash" in row, false);
});

test("machine key requests are validated: team required, membership required, vault names checked", async () => {
  assert.equal((await http.post("/api/keys", annKey, { name: "m", kind: "machine" })).status, 422);
  assert.equal((await http.post("/api/keys", annKey, { name: "m", kind: "machine", team: "nope" })).status, 404);
  assert.equal((await http.post("/api/keys", annKey, { name: "m", kind: "machine", team: "acme", vaults: ["Bad Name"] })).status, 422);
  assert.equal((await http.post("/api/keys", annKey, { name: "m", kind: "machine", team: "acme", expiresAt: "2001-01-01" })).status, 422);
  assert.equal((await http.post("/api/keys", null, { name: "m" })).status, 401);
});

async function machineKey(opts = {}) {
  const { plaintext, row } = await createApiKey("u_ann", opts.name || `m-${Math.random().toString(36).slice(2, 8)}`, {
    kind: "machine",
    teamId: "t_acme",
    vaultScope: opts.vaults ?? ["web--prod"],
    readOnly: opts.readOnly ?? true,
    expiresAt: opts.expiresAt ?? null
  });
  return { token: plaintext, id: row.id, name: row.name };
}

test("a machine key cannot mint, list or revoke keys", async () => {
  const m = await machineKey();
  assert.equal((await http.post("/api/keys", m.token, { name: "escalate", kind: "user" })).status, 403);
  assert.equal((await http.post("/api/keys", m.token, { name: "escalate", kind: "machine", team: "acme" })).status, 403);
  assert.equal((await http.get("/api/keys", m.token)).status, 403);
  assert.equal((await http.del(`/api/keys/${m.id}`, m.token)).status, 403);
});

test("a machine key cannot read /api/me or the personal vault; a person key still can read /api/me", async () => {
  const m = await machineKey();
  assert.equal((await http.get("/api/me", m.token)).status, 403);
  assert.equal((await http.get("/api/opencreds/vault", m.token)).status, 403);
  assert.equal(await userForApiKey(m.token), null);
  const me = await http.get("/api/me", annKey);
  assert.equal(me.status, 200);
  assert.equal(me.body.email, "ann@example.com");
});

test("a machine key registers its OWN public key, leaving the person's untouched", async () => {
  const m = await machineKey();
  const reg = await http.post("/api/credshare/keys", m.token, { publicKey: "pk-machine-1" });
  assert.equal(reg.status, 200, "registering is allowed even for a read-only key");
  assert.equal((await get(`SELECT public_key FROM api_keys WHERE id = ?`, [m.id])).public_key, "pk-machine-1");
  assert.equal((await get(`SELECT public_key FROM credshare_keys WHERE user_id = ?`, ["u_ann"])).public_key, "pk-ann");

  const me = await http.get("/api/credshare/me", m.token);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.publicKey, "pk-machine-1");
  assert.deepEqual(me.body.teams.map((t) => t.slug), ["acme"]);
  assert.equal(me.body.key.kind, "machine");
  assert.equal(me.body.key.team, "acme");
  assert.deepEqual(me.body.key.vaults, ["web--prod"]);
  assert.equal(me.body.key.readOnly, true);
});

test("a machine key sees one team and only its scoped vaults", async () => {
  const m = await machineKey({ vaults: ["web--prod"] });
  const teams = await http.get("/api/credshare/teams", m.token);
  assert.deepEqual(teams.body.teams.map((t) => t.slug), ["acme"]);

  const vaults = await http.get("/api/credshare/teams/acme/vaults", m.token);
  assert.equal(vaults.status, 200);
  assert.deepEqual(vaults.body.vaults.map((v) => v.name), ["web--prod"]);
  assert.equal(vaults.body.vaults[0].hasAccess, false, "access means a grant to the KEY, not to Ann");

  assert.equal((await http.get("/api/credshare/teams/other/vaults", m.token)).status, 403);
  assert.equal((await http.get("/api/credshare/vaults/v_api/secrets", m.token)).status, 403);
  assert.equal((await http.get("/api/credshare/vaults/v_x/secrets", m.token)).status, 403);
  assert.equal((await http.get("/api/credshare/vaults/v_web/secrets", m.token)).status, 200);

  // An unscoped machine key sees every vault in its team, and still no other team.
  const all = await machineKey({ vaults: [] });
  const allVaults = await http.get("/api/credshare/teams/acme/vaults", all.token);
  assert.deepEqual(allVaults.body.vaults.map((v) => v.name).sort(), ["api--prod", "web--prod"]);
});

test("the vault key reaches a machine only through a grant sealed to its own key", async () => {
  const m = await machineKey({ name: "grant-me" });

  // Not registered yet: a grant is refused with the instruction to use the key once.
  const early = await http.post("/api/credshare/vaults/v_web/key-grants", annKey, { keyId: m.id, wrappedDek: "sealed-to-machine" });
  assert.equal(early.status, 409);
  assert.equal(early.body.code, "no_public_key");

  await http.post("/api/credshare/keys", m.token, { publicKey: "pk-grant-me" });
  const before = await http.get("/api/credshare/vaults/v_web/grant", m.token);
  assert.equal(before.status, 403);
  assert.equal(before.body.code, "no_key_grant");

  // Out-of-scope vault: refused even for the owner.
  assert.equal((await http.post("/api/credshare/vaults/v_api/key-grants", annKey, { keyId: m.id, wrappedDek: "x" })).status, 409);
  // A machine key cannot grant itself (or anything).
  assert.equal((await http.post("/api/credshare/vaults/v_web/key-grants", m.token, { keyId: m.id, wrappedDek: "x" })).status, 403);

  const granted = await http.post("/api/credshare/vaults/v_web/key-grants", annKey, { keyId: m.id, wrappedDek: "sealed-to-machine" });
  assert.equal(granted.status, 201);

  const after = await http.get("/api/credshare/vaults/v_web/grant", m.token);
  assert.equal(after.status, 200);
  assert.equal(after.body.wrappedDek, "sealed-to-machine", "never Ann's wrapped key");

  const listed = await http.get("/api/credshare/teams/acme/vaults", m.token);
  assert.equal(listed.body.vaults.find((v) => v.name === "web--prod").hasAccess, true);

  // The read is in the vault's audit trail, attributed to the key.
  const reads = await all(`SELECT * FROM credshare_audit WHERE vault_id = ? AND action = 'vault:read' AND actor_key_id = ?`, ["v_web", m.id]);
  assert.equal(reads.length, 1);
  assert.equal(reads[0].actor_user_id, "u_ann");

  // Ann's own grant is untouched.
  assert.equal((await http.get("/api/credshare/vaults/v_web/grant", annKey)).body.wrappedDek, "dek-ann-v_web");
});

test("a read-only machine key is refused every write; a read-write one may write a granted vault", async () => {
  const ro = await machineKey({ readOnly: true });
  const upsert = { upserts: [{ name: "NEW", nonce: "n", ciphertext: "c", fingerprint: "f" }], deletes: [] };
  const roPut = await http.put("/api/credshare/vaults/v_web/secrets", ro.token, upsert);
  assert.equal(roPut.status, 403);
  assert.equal(roPut.body.code, "read_only_key");
  assert.equal((await http.post("/api/credshare/teams/acme/vaults", ro.token, { name: "new--prod" })).status, 403);
  assert.equal((await http.post("/api/credshare/teams", ro.token, { slug: "evil" })).status, 403);
  assert.equal((await http.post("/api/credshare/teams/acme/invites", ro.token, { email: "x@example.com" })).status, 403);
  assert.equal((await http.post("/api/credshare/vaults/v_web/grants", ro.token, { email: "ann@example.com", wrappedDek: "x" })).status, 403);
  assert.equal((await http.get("/api/credshare/users?email=ann@example.com", ro.token)).status, 403);

  const rw = await machineKey({ readOnly: false });
  await http.post("/api/credshare/keys", rw.token, { publicKey: "pk-rw" });
  // Write needs a grant first, so a key cannot plant values in a vault it cannot read.
  assert.equal((await http.put("/api/credshare/vaults/v_web/secrets", rw.token, upsert)).status, 403);
  await http.post("/api/credshare/vaults/v_web/key-grants", annKey, { keyId: rw.id, wrappedDek: "sealed-rw" });
  const ok = await http.put("/api/credshare/vaults/v_web/secrets", rw.token, upsert);
  assert.equal(ok.status, 200);
  const row = await get(`SELECT * FROM credshare_audit WHERE vault_id = ? AND key_name = 'NEW' AND action = 'secret:add'`, ["v_web"]);
  assert.equal(row.actor_key_id, rw.id);
  // Team admin stays people-only for a read-write key too.
  assert.equal((await http.post("/api/credshare/teams", rw.token, { slug: "evil" })).status, 403);
  await run(`DELETE FROM credshare_secrets WHERE vault_id = ? AND name = 'NEW'`, ["v_web"]);
});

test("expired and revoked keys are 401, and revoking drops the key's grants", async () => {
  const expired = await machineKey({ expiresAt: Date.now() - 1000 });
  assert.equal((await http.get("/api/credshare/me", expired.token)).status, 401);

  const m = await machineKey();
  await http.post("/api/credshare/keys", m.token, { publicKey: "pk-revoke" });
  await http.post("/api/credshare/vaults/v_web/key-grants", annKey, { keyId: m.id, wrappedDek: "sealed" });
  assert.equal((await http.get("/api/credshare/vaults/v_web/grant", m.token)).status, 200);

  assert.equal((await http.del(`/api/keys/${m.id}`, annKey)).status, 200);
  assert.equal((await http.get("/api/credshare/vaults/v_web/grant", m.token)).status, 401);
  assert.equal((await all(`SELECT * FROM credshare_key_grants WHERE api_key_id = ?`, [m.id])).length, 0);
  assert.equal((await http.del(`/api/keys/${m.id}`, annKey)).status, 404);
});

test("re-registering a different public key drops the grants sealed to the old one", async () => {
  const m = await machineKey();
  await http.post("/api/credshare/keys", m.token, { publicKey: "pk-old" });
  await http.post("/api/credshare/vaults/v_web/key-grants", annKey, { keyId: m.id, wrappedDek: "sealed-old" });
  const again = await http.post("/api/credshare/keys", m.token, { publicKey: "pk-new" });
  assert.equal(again.body.droppedGrants, 1);
  assert.equal((await http.get("/api/credshare/vaults/v_web/grant", m.token)).status, 403);
});

test("a re-key re-seals the machine grants it is given and drops the rest", async () => {
  const keep = await machineKey({ name: "keep" });
  const drop = await machineKey({ name: "drop" });
  for (const k of [keep, drop]) {
    await http.post("/api/credshare/keys", k.token, { publicKey: `pk-${k.name}` });
    await http.post("/api/credshare/vaults/v_web/key-grants", annKey, { keyId: k.id, wrappedDek: `old-${k.name}` });
  }
  const listed = await http.get("/api/credshare/vaults/v_web/key-grants", annKey);
  assert.deepEqual(listed.body.keyGrants.map((g) => g.name).filter((n) => n === "keep" || n === "drop").sort(), ["drop", "keep"]);
  assert.equal(listed.body.keyGrants.find((g) => g.name === "keep").publicKey, "pk-keep");

  const secrets = (await all(`SELECT name, fingerprint FROM credshare_secrets WHERE vault_id = ?`, ["v_web"]))
    .map((s) => ({ name: s.name, nonce: "n2", ciphertext: "c2", fingerprint: s.fingerprint }));
  const rekey = await http.post("/api/credshare/vaults/v_web/rekey", annKey, {
    grants: [{ email: "ann@example.com", wrappedDek: "dek-ann-v_web" }],
    secrets,
    keyGrants: [{ keyId: keep.id, wrappedDek: "new-keep" }]
  });
  assert.equal(rekey.status, 200, JSON.stringify(rekey.body));
  assert.deepEqual(rekey.body.keysResealed, ["keep"]);
  assert.ok(rekey.body.keysDropped.includes("drop"));
  assert.equal((await http.get("/api/credshare/vaults/v_web/grant", keep.token)).body.wrappedDek, "new-keep");
  assert.equal((await http.get("/api/credshare/vaults/v_web/grant", drop.token)).status, 403);
});

test("a person's key still registers the person's identity key, as before", async () => {
  const { plaintext } = await createApiKey("u_ann", "ci-person");
  const reg = await http.post("/api/credshare/keys", plaintext, { publicKey: "pk-ann" });
  assert.equal(reg.status, 200);
  assert.equal((await get(`SELECT public_key FROM credshare_keys WHERE user_id = ?`, ["u_ann"])).public_key, "pk-ann");
  const me = await http.get("/api/credshare/me", plaintext);
  assert.deepEqual(me.body.teams.map((t) => t.slug).sort(), ["acme", "other"]);
  assert.equal(me.body.key.kind, "user");
});
