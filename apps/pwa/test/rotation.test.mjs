// Rotation plan + run queue (routes/rotation.mjs). The server holds only names,
// fingerprints and ciphertext: these tests check the plan comes from those, that
// a run carries no values, and who may queue, claim, report and cancel.
process.env.DATABASE_URL = process.env.PWA_TEST_DATABASE_URL || ":memory:";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";

const here = dirname(fileURLToPath(import.meta.url));
const { db, run, isPostgres } = await import("../src/db.mjs");
const { rotationRouter } = await import("../src/routes/rotation.mjs");
const { parseRunRequest, sanitizeResults } = await import("../src/lib/rotation.mjs");

async function migrate() {
  if (isPostgres) {
    await db.execute("DROP SCHEMA public CASCADE");
    await db.execute("CREATE SCHEMA public");
  }
  for (const file of ["001_auth.sql", "002_credshare.sql", "005_machine_keys.sql", "007_hardening.sql", "010_rotation_runs.sql"]) {
    const sql = readFileSync(join(here, "..", "src", isPostgres ? "migrations-pg" : "migrations", file), "utf8");
    for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.execute(statement);
  }
}

async function serve(userId) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  app.use(rotationRouter);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text.startsWith("{") ? JSON.parse(text) : text };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

const now = Date.now();
await migrate();
for (const [uid, email] of [["u_owner", "owner@example.com"], ["u_member", "member@example.com"], ["u_out", "out@example.com"]]) {
  await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, [uid, email, now]);
}
await run(`INSERT INTO credshare_teams (id, slug, name, created_by, created_at) VALUES (?,?,?,?,?)`, ["t1", "acme", "acme", "u_owner", now]);
await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, created_at) VALUES (?,?,?,?,?,?,?)`, ["m1", "t1", "u_owner", "owner@example.com", "owner", "active", now]);
await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, created_at) VALUES (?,?,?,?,?,?,?)`, ["m2", "t1", "u_member", "member@example.com", "member", "active", now]);
for (const v of ["app--prod", "web--prod"]) await run(`INSERT INTO credshare_vaults (id, team_id, name, created_by, created_at) VALUES (?,?,?,?,?)`, [v, "t1", v, "u_owner", now]);
const secret = (vault, name, fp) =>
  run(`INSERT INTO credshare_secrets (vault_id, name, nonce, ciphertext, fingerprint, version, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)`, [vault, name, "n", "CIPHERTEXT", fp, 1, "u_owner", now]);
await secret("app--prod", "OPENAI_API_KEY", "fp-openai");
await secret("web--prod", "OPENAI_KEY_COPY", "fp-openai"); // same value under another name
await secret("app--prod", "CRON_SECRET", "fp-cron");
await secret("app--prod", "__ROTATE__CRON_SECRET", "fp-entry");
await secret("app--prod", "STRIPE_SECRET_KEY", "fp-stripe");
await secret("app--prod", "CLOUDFLARE_GLOBAL_API_KEY", "fp-cfg");
await secret("app--prod", "PUBLIC_SITE_URL", "fp-url");

test("plan: catalog methods by key name, vault counts by fingerprint, never ciphertext", async (t) => {
  const app = await serve("u_member");
  t.after(app.close);
  const { status, body } = await app.call("GET", "/api/credshare/teams/acme/rotation");
  assert.equal(status, 200);
  const by = Object.fromEntries(body.plan.map((p) => [p.key, p]));
  assert.equal(by.OPENAI_API_KEY.method, "desktop");
  assert.equal(by.OPENAI_API_KEY.recipe, "openai");
  assert.equal(by.OPENAI_API_KEY.automatic, true);
  assert.equal(by.OPENAI_API_KEY.vaultCount, 2);
  assert.deepEqual(by.OPENAI_API_KEY.alsoIn, ["web--prod:OPENAI_KEY_COPY"]);
  assert.equal(by.CLOUDFLARE_GLOBAL_API_KEY.desktopMode, "roll");
  assert.equal(by.CRON_SECRET.method, "random");
  assert.equal(by.CRON_SECRET.hasEntry, true);
  assert.equal(by.STRIPE_SECRET_KEY.never, true);
  assert.equal(by.PUBLIC_SITE_URL, undefined);
  assert.equal(by.__ROTATE__CRON_SECRET, undefined);
  assert.ok(by.OPENAI_API_KEY.steps.length > 3);
  assert.ok(!JSON.stringify(body).includes("CIPHERTEXT"));
  assert.ok(!JSON.stringify(body).includes("fp-openai"));
});

test("plan: outsiders get 403", async (t) => {
  const app = await serve("u_out");
  t.after(app.close);
  assert.equal((await app.call("GET", "/api/credshare/teams/acme/rotation")).status, 403);
});

test("queue: a member may queue a dry run but not an approved run", async (t) => {
  const app = await serve("u_member");
  t.after(app.close);
  const denied = await app.call("POST", "/api/credshare/teams/acme/rotation/runs", { keys: ["CRON_SECRET"], approve: true });
  assert.equal(denied.status, 400);
  assert.match(denied.body.error, /owner or admin/);
  const ok = await app.call("POST", "/api/credshare/teams/acme/rotation/runs", { keys: ["CRON_SECRET"], desktop: "bonita" });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.run.status, "queued");
  assert.equal(ok.body.run.approve, false);
  assert.deepEqual(ok.body.run.options, { desktop: "bonita" });
});

test("queue -> claim (once) -> result (sanitized) -> listed", async (t) => {
  const owner = await serve("u_owner");
  t.after(owner.close);
  const q = await owner.call("POST", "/api/credshare/teams/acme/rotation/runs", { keys: ["OPENAI_API_KEY", "CRON_SECRET"], approve: true, propagate: true });
  assert.equal(q.status, 201);
  const runId = q.body.run.id;
  const queued = await owner.call("GET", "/api/credshare/teams/acme/rotation/runs?status=queued");
  assert.ok(queued.body.runs.some((r) => r.id === runId));
  const c1 = await owner.call("POST", `/api/credshare/teams/acme/rotation/runs/${runId}/claim`);
  assert.equal(c1.status, 200);
  assert.equal(c1.body.run.status, "running");
  assert.equal((await owner.call("POST", `/api/credshare/teams/acme/rotation/runs/${runId}/claim`)).status, 409);
  // Another member cannot report a run they did not claim.
  const other = await serve("u_member");
  t.after(other.close);
  assert.equal((await other.call("POST", `/api/credshare/teams/acme/rotation/runs/${runId}/result`, { results: [] })).status, 409);
  const done = await owner.call("POST", `/api/credshare/teams/acme/rotation/runs/${runId}/result`, {
    results: [
      { key: "OPENAI_API_KEY", status: "needs-login", error: "login wall", value: "sk-SHOULD-NOT-BE-STORED" },
      { key: "CRON_SECRET", status: "rotated", written: ["app--prod:CRON_SECRET"], secret: "nope" }
    ]
  });
  assert.equal(done.status, 200);
  assert.equal(done.body.run.status, "done");
  assert.match(done.body.run.summary, /1 needs-login, 1 rotated/);
  assert.ok(!JSON.stringify(done.body).includes("SHOULD-NOT"));
  assert.ok(!JSON.stringify(done.body).includes("nope"));
});

test("cancel: only queued runs", async (t) => {
  const app = await serve("u_member");
  t.after(app.close);
  const q = await app.call("POST", "/api/credshare/teams/acme/rotation/runs", { keys: "CRON_SECRET" });
  assert.equal((await app.call("POST", `/api/credshare/teams/acme/rotation/runs/${q.body.run.id}/cancel`)).status, 200);
  assert.equal((await app.call("POST", `/api/credshare/teams/acme/rotation/runs/${q.body.run.id}/cancel`)).status, 409);
});

test("parseRunRequest rejects junk", () => {
  assert.throws(() => parseRunRequest({ keys: [] }), /at least one/);
  assert.throws(() => parseRunRequest({ keys: ["BAD KEY;"] }), /Not a key name/);
  assert.throws(() => parseRunRequest({ keys: ["A"], desktop: "bonita; rm -rf /" }), /ssh host/);
  assert.deepEqual(parseRunRequest({ keys: "A, B", approve: "1", allowRoll: "on" }).options, { allowRoll: true });
  assert.equal(sanitizeResults([{ key: "A", status: "weird" }])[0].status, "failed");
});

test("the Rotation page lists the plan with checkboxes, no values, and the runner command", async (t) => {
  const app = await serve("u_member");
  t.after(app.close);
  const { status, body } = await app.call("GET", "/teams/acme/rotation");
  assert.equal(status, 200);
  assert.match(body, /OPENAI_API_KEY/);
  assert.match(body, /desktop: openai/);
  assert.match(body, /name="keys" value="CRON_SECRET"/);
  assert.match(body, /value="STRIPE_SECRET_KEY" aria-label="Rotate STRIPE_SECRET_KEY" disabled/);
  assert.match(body, /--from-queue/);
  assert.match(body, /owner\/admin only/); // a member cannot queue an approved run
  assert.ok(!body.includes("CIPHERTEXT"));
  assert.ok(!/<script>/.test(body));
});
