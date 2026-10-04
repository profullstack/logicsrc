// The vault page shows secret names to any active team member and carries
// what public/vault.js needs to decrypt values in the browser: the vault id,
// the member's registered public key (to reject a wrong pasted key before
// trying it) and whether a grant exists. It must never carry ciphertext or a
// wrapped key — those are fetched by the script from the session-authed API.
process.env.DATABASE_URL = process.env.PWA_TEST_DATABASE_URL || ":memory:";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";

import { splitVaultName, vaultPageBody, KEY_HELP } from "../src/lib/vault-page.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { db, run, isPostgres } = await import("../src/db.mjs");
const { pagesRouter } = await import("../src/routes/pages.mjs");

async function migrate() {
  if (isPostgres) {
    await db.execute("DROP SCHEMA public CASCADE");
    await db.execute("CREATE SCHEMA public");
  }
  for (const file of ["001_auth.sql", "002_credshare.sql"]) {
    const sql = readFileSync(join(here, "..", "src", isPostgres ? "migrations-pg" : "migrations", file), "utf8");
    for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
      await db.execute(statement);
    }
  }
}

async function serve(user) {
  const app = express();
  app.use((req, _res, next) => { req.user = user; req.csrfToken = "t"; next(); });
  app.use(pagesRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    async get(path) {
      const res = await fetch(`${base}${path}`, { redirect: "manual" });
      return { status: res.status, headers: res.headers, text: await res.text() };
    },
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

const now = Date.now();
await migrate();
for (const [uid, email] of [["u-ann", "ann@example.com"], ["u-bob", "bob@example.com"], ["u-eve", "eve@example.com"]]) {
  await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, [uid, email, now]);
}
await run(`INSERT INTO credshare_teams (id, slug, name, created_by, created_at) VALUES ('t1','acme','acme','u-ann',?)`, [now]);
for (const [mid, uid, email] of [["m1", "u-ann", "ann@example.com"], ["m2", "u-bob", "bob@example.com"]]) {
  await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, joined_at, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [mid, "t1", uid, email, "member", "active", now, now]);
}
await run(`INSERT INTO credshare_keys (user_id, public_key, updated_at) VALUES ('u-ann','ANN_PUBLIC_KEY',?)`, [now]);
await run(`INSERT INTO credshare_vaults (id, team_id, name, created_by, created_at) VALUES ('v1','t1','api--prod','u-ann',?)`, [now]);
await run(`INSERT INTO credshare_vault_grants (vault_id, user_id, wrapped_dek, granted_by, created_at) VALUES ('v1','u-ann','WRAPPED_DEK_SECRET','u-ann',?)`, [now]);
for (const name of ["DATABASE_URL", "STRIPE_KEY"]) {
  await run(`INSERT INTO credshare_secrets (vault_id, name, nonce, ciphertext, fingerprint, version, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ["v1", name, "NONCE_" + name, "CIPHERTEXT_" + name, "fp", 2, "u-ann", now]);
}

test("a member with a grant sees names, their public key, and the unlock form", async () => {
  const app = await serve({ id: "u-ann", email: "ann@example.com" });
  try {
    const res = await app.get("/teams/acme/vaults/v1");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("cache-control") || "", /no-store/);
    assert.match(res.text, /data-key-name="DATABASE_URL"/);
    assert.match(res.text, /data-key-name="STRIPE_KEY"/);
    assert.match(res.text, /data-public-key="ANN_PUBLIC_KEY"/);
    assert.match(res.text, /data-has-grant="1"/);
    assert.match(res.text, /data-role="unlock"/);
    assert.match(res.text, /logicsrc teams key/);
    assert.match(res.text, /src="\/vendor\/libsodium\.js"/);
    assert.match(res.text, /src="\/vault\.js"/);
  } finally {
    await app.close();
  }
});

test("the page never embeds ciphertext, nonces or the wrapped key", async () => {
  const app = await serve({ id: "u-ann", email: "ann@example.com" });
  try {
    const { text } = await app.get("/teams/acme/vaults/v1");
    assert.doesNotMatch(text, /CIPHERTEXT_|NONCE_|WRAPPED_DEK_SECRET/);
  } finally {
    await app.close();
  }
});

test("a member with no key is offered a browser-made key, not a paste box", async () => {
  const app = await serve({ id: "u-bob", email: "bob@example.com" });
  try {
    const { status, text } = await app.get("/teams/acme/vaults/v1");
    assert.equal(status, 200);
    assert.match(text, /data-public-key=""/);
    assert.match(text, /data-has-grant="0"/);
    assert.match(text, /data-action="generate"/);
    assert.doesNotMatch(text, /data-role="unlock"/);
    assert.match(text, /logicsrc teams grant acme api prod bob@example\.com/);
  } finally {
    await app.close();
  }
});

test("a non-member and an unknown vault both fall through to 404", async () => {
  const eve = await serve({ id: "u-eve", email: "eve@example.com" });
  try {
    assert.equal((await eve.get("/teams/acme/vaults/v1")).status, 404);
  } finally {
    await eve.close();
  }
  const ann = await serve({ id: "u-ann", email: "ann@example.com" });
  try {
    assert.equal((await ann.get("/teams/acme/vaults/nope")).status, 404);
  } finally {
    await ann.close();
  }
});

test("the dashboard links each vault to its page", async () => {
  const app = await serve({ id: "u-ann", email: "ann@example.com" });
  try {
    const { text } = await app.get("/dashboard");
    assert.match(text, /href="\/teams\/acme\/vaults\/v1"/);
  } finally {
    await app.close();
  }
});

test("vault names split the way the CLI splits them", () => {
  assert.deepEqual(splitVaultName("api--prod"), { project: "api", env: "prod" });
  assert.deepEqual(splitVaultName("my-app--staging"), { project: "my-app", env: "staging" });
  assert.equal(splitVaultName("legacy"), null);
  assert.equal(splitVaultName("a--b--c"), null);
});

test("names are escaped", () => {
  const html = vaultPageBody({
    team: { slug: "acme" },
    vault: { id: "v", name: "x--y" },
    secrets: [{ name: `<img src=x onerror=alert(1)>`, version: 1, updated_at: now }],
    hasGrant: true,
    publicKey: "pk",
    email: "a@b.c"
  });
  assert.doesNotMatch(html, /<img src=x/);
});

test("the key help names the CLI command and a fallback for older CLIs", () => {
  assert.match(KEY_HELP, /logicsrc teams key/);
  assert.match(KEY_HELP, /jq -r \.keys\.secretKey ~\/\.config\/logicsrc\/identity\.json/);
});
