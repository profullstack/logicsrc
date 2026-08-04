// Integration tests for GET /api/credshare/teams/:slug/vaults.
//
// This endpoint used to issue two queries per vault inside a loop. libSQL is a
// remote database, so each one is a network round trip: a real team with 176
// vaults spent ~10s in here, and `logicsrc teams pull` resolves the vault id
// twice, which is where the ~24s pull came from.
//
// The behavioural assertions below are the ones the loop already satisfied. The
// one that matters for the regression is `issues the same number of queries`:
// it pins the cost as INDEPENDENT of vault count rather than at some magic
// number, so any future rewrite that reintroduces per-vault I/O fails here
// regardless of how many statements the constant part happens to use.
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
const { db, run } = await import("../src/db.mjs");
const { credshareRouter } = await import("../src/routes/credshare.mjs");

async function migrate() {
  for (const file of ["001_auth.sql", "002_credshare.sql"]) {
    const sql = readFileSync(join(here, "..", "src", "migrations", file), "utf8");
    for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
      await db.execute(statement);
    }
  }
}

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
    async get(path) {
      const res = await fetch(`${base}${path}`);
      return { status: res.status, body: await res.json() };
    },
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

const now = Date.now();

/** Count db.execute() calls while fn runs -- one call is one network round trip. */
async function countQueries(fn) {
  const original = db.execute.bind(db);
  let calls = 0;
  db.execute = (...args) => {
    calls += 1;
    return original(...args);
  };
  try {
    await fn();
  } finally {
    db.execute = original;
  }
  return calls;
}

/**
 * A team with `vaultCount` vaults. Every vault gets `secretsPerVault` secrets;
 * the caller is granted access to all but the last, so hasAccess has both
 * values in play.
 */
async function seedTeam({ teamId, slug, vaultCount, secretsPerVault = 2 }) {
  await run(`INSERT INTO credshare_teams (id, slug, name, created_by, created_at) VALUES (?,?,?,?,?)`,
    [teamId, slug, slug, "u_me", now]);
  await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, created_at) VALUES (?,?,?,?,?,?,?)`,
    [`m_${teamId}`, teamId, "u_me", "me@example.com", "owner", "active", now]);

  for (let i = 0; i < vaultCount; i += 1) {
    // Zero-padded so lexical name order matches creation order for the ORDER BY assertion.
    const vid = `${teamId}_v${String(i).padStart(3, "0")}`;
    await run(`INSERT INTO credshare_vaults (id, team_id, name, created_by, created_at) VALUES (?,?,?,?,?)`,
      [vid, teamId, `app${String(i).padStart(3, "0")}--prod`, "u_me", now]);
    if (i < vaultCount - 1) {
      await run(`INSERT INTO credshare_vault_grants (vault_id, user_id, wrapped_dek, granted_by, created_at) VALUES (?,?,?,?,?)`,
        [vid, "u_me", `wrapped-${vid}`, "u_me", now]);
    }
    for (let s = 0; s < secretsPerVault; s += 1) {
      await run(`INSERT INTO credshare_secrets (vault_id, name, nonce, ciphertext, fingerprint, version, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
        [vid, `KEY_${s}`, `n${s}`, `c${s}`, `fp${s}`, 1, "u_me", now]);
    }
  }
}

await migrate();
await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, ["u_me", "me@example.com", now]);
await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, ["u_outsider", "outsider@example.com", now]);
await seedTeam({ teamId: "t_small", slug: "small", vaultCount: 3, secretsPerVault: 2 });
await seedTeam({ teamId: "t_big", slug: "big", vaultCount: 30, secretsPerVault: 4 });

test("reports each vault's secret count and whether the caller holds a grant", async (t) => {
  const app = await serve("u_me");
  t.after(() => app.close());

  const res = await app.get("/api/credshare/teams/small/vaults");
  assert.equal(res.status, 200);
  assert.equal(res.body.vaults.length, 3);

  // Ordered by name, counts per vault, and the last vault is the ungranted one.
  assert.deepEqual(res.body.vaults.map((v) => v.name), ["app000--prod", "app001--prod", "app002--prod"]);
  assert.deepEqual(res.body.vaults.map((v) => v.secretCount), [2, 2, 2]);
  assert.deepEqual(res.body.vaults.map((v) => v.hasAccess), [true, true, false]);

  // hasAccess must be a real boolean, not SQLite's 0/1 leaking through: clients
  // branch on it, and `if (0)` and `if ("0")` disagree.
  for (const v of res.body.vaults) {
    assert.equal(typeof v.hasAccess, "boolean");
    assert.equal(typeof v.secretCount, "number");
  }
});

test("counts secrets per vault rather than across the team", async (t) => {
  const app = await serve("u_me");
  t.after(() => app.close());

  const res = await app.get("/api/credshare/teams/big/vaults");
  assert.equal(res.status, 200);
  assert.equal(res.body.vaults.length, 30);
  // 30 vaults x 4 secrets: a join that multiplied rows would report 120 here.
  assert.ok(res.body.vaults.every((v) => v.secretCount === 4),
    `expected every vault to report 4 secrets, got ${JSON.stringify(res.body.vaults.map((v) => v.secretCount))}`);
});

test("issues the same number of queries for 3 vaults as for 30", async (t) => {
  const app = await serve("u_me");
  t.after(() => app.close());

  const small = await countQueries(() => app.get("/api/credshare/teams/small/vaults"));
  const big = await countQueries(() => app.get("/api/credshare/teams/big/vaults"));

  assert.equal(big, small,
    `vault listing must not scale with vault count: 3 vaults took ${small} queries, 30 took ${big}`);
  // And the constant is small -- membership check plus the listing itself.
  assert.ok(small <= 4, `expected a handful of queries, got ${small}`);
});

test("refuses a caller who is not a member", async (t) => {
  const app = await serve("u_outsider");
  t.after(() => app.close());

  const res = await app.get("/api/credshare/teams/small/vaults");
  assert.equal(res.status, 403);
});

test("404s an unknown team", async (t) => {
  const app = await serve("u_me");
  t.after(() => app.close());

  const res = await app.get("/api/credshare/teams/nope/vaults");
  assert.equal(res.status, 404);
});
