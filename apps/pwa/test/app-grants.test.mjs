// App grants: a person seals one secret to an external app's per-user inbox.
// The app proves its origin by serving the manifest; the server only ever
// handles ciphertext; the app's own key opens what was delivered; signing keys
// never leave; stale values, other people's requests and revokes behave.
process.env.DATABASE_URL = process.env.PWA_TEST_DATABASE_URL || ":memory:";
process.env.APP_GRANTS_ALLOW_LOCAL = "1";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHmac } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import { createSealer } from "@profullstack/sealed-secrets";

const here = dirname(fileURLToPath(import.meta.url));
const { db, run, get, isPostgres } = await import("../src/db.mjs");
const { appGrantsRouter } = await import("../src/routes/app-grants.mjs");
const { isPrivateAddress, parseOrigin, validateManifest, signWebhook } = await import("../src/lib/app-grants.mjs");

if (isPostgres) {
  await db.execute("DROP SCHEMA public CASCADE");
  await db.execute("CREATE SCHEMA public");
}
const migDir = join(here, "..", "src", isPostgres ? "migrations-pg" : "migrations");
for (const file of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = readFileSync(join(migDir, file), "utf8");
  for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.execute(statement);
}
const now = Date.now();
for (const uid of ["u1", "u2"]) await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, [uid, `${uid}@e.test`, now]);
await run(`INSERT INTO credshare_teams (id, slug, name, created_by, created_at) VALUES (?,?,?,?,?)`, ["t1", "acme", "acme", "u1", now]);
await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, created_at) VALUES (?,?,?,?,?,?,?)`, ["m1", "t1", "u1", "u1@e.test", "owner", "active", now]);
await run(`INSERT INTO credshare_vaults (id, team_id, name, created_by, created_at) VALUES (?,?,?,?,?)`, ["v1", "t1", "meshhook--prod", "u1", now]);
await run(`INSERT INTO credshare_vault_grants (vault_id, user_id, wrapped_dek, granted_by, created_at) VALUES (?,?,?,?,?)`, ["v1", "u1", "wrapped", "u1", now]);
for (const [name, fp] of [["COINPAY_API_KEY", "fp-coinpay-1"], ["X402_PRIVATE_KEY", "fp-x402"]]) {
  await run(`INSERT INTO credshare_secrets (vault_id, name, nonce, ciphertext, fingerprint, version, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)`, ["v1", name, "n", "c", fp, 1, "u1", now]);
}

// ---- the external app: an inbox for its user, a manifest, a webhook receiver
const appSealer = createSealer({ app: "meshhook", scope: "workflow_secrets" });
const appUser = "mh-user-42";
const vault = await appSealer.createSeal("correct horse battery staple", appUser);
const WEBHOOK_SECRET = "s".repeat(40);
const received = [];
const ext = express();
ext.use(express.text({ type: "*/*" }));
let extBase = "";
const manifests = new Map();
ext.get("/.well-known/logicsrc-grant/:nonce", (req, res) => (manifests.has(req.params.nonce) ? res.json(manifests.get(req.params.nonce)) : res.sendStatus(404)));
ext.post("/hook", (req, res) => {
  received.push({ headers: req.headers, body: req.body });
  res.sendStatus(200);
});
const extServer = ext.listen(0);
await new Promise((r) => extServer.once("listening", r));
extBase = `http://127.0.0.1:${extServer.address().port}`;
const manifest = (keys = ["COINPAY_API_KEY"]) => ({
  v: 1,
  app_name: "MeshHook",
  keys: keys.map((name) => ({ name })),
  recipient: { format: "sealed-secrets/inbox-v2", app: "meshhook", scope: "workflow_secrets", user_id: appUser, inbox_public_key: vault.seal.inbox_public_key },
  webhook_url: `${extBase}/hook`,
  webhook_secret: WEBHOOK_SECRET,
  return_url: `${extBase}/secrets`,
});

// ---- logicsrc
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use((req, _res, next) => {
  const u = req.get("x-user");
  req.user = u ? { id: u, email: `${u}@e.test` } : null;
  next();
});
app.use(appGrantsRouter);
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => Promise.all([new Promise((r) => server.close(r)), new Promise((r) => extServer.close(r))]));

const call = async (method, path, user, body) => {
  const res = await fetch(base + path, { method, headers: { "x-user": user, "content-type": "application/json", accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
};
const open = (nonce, user = "u1") => call("GET", `/grant?origin=${encodeURIComponent(extBase)}&nonce=${nonce}`, user);
const requestIdOf = (html) => html.match(/data-request-id="([^"]+)"/)?.[1];
// What the browser does: seal the plaintext to the app's inbox.
const seal = async (keyName, value) => `sealed:v2:${JSON.stringify(await appSealer.sealToInbox(vault.seal.inbox_public_key, { [keyName]: value }, appUser))}`;
const verifySig = ({ headers, body }) =>
  headers["webhook-signature"] === `v1,${createHmac("sha256", WEBHOOK_SECRET).update(`${headers["webhook-id"]}.${headers["webhook-timestamp"]}.${body}`).digest("base64")}`;

test("origin and manifest checks", () => {
  assert.equal(parseOrigin("https://meshhook.com"), "https://meshhook.com");
  assert.throws(() => parseOrigin("http://meshhook.com"), /https/);
  assert.throws(() => parseOrigin("https://10.0.0.1"), /public host/);
  assert.throws(() => parseOrigin("https://meshhook.com/path"), /bare origin/);
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.20.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ["8.8.8.8", "2606:4700::1111"]) assert.ok(!isPrivateAddress(ip), ip);
  const m = manifest();
  assert.throws(() => validateManifest({ ...m, webhook_url: "https://evil.test/hook" }, extBase), /own origin/);
  assert.throws(() => validateManifest({ ...m, webhook_secret: "short" }, extBase), /32\+/);
  assert.equal(validateManifest({ ...m, return_url: "https://evil.test/" }, extBase).return_url, extBase);
  assert.match(signWebhook("whsec_" + Buffer.from("k").toString("base64"), "id", 1, "b"), /^v1,/);
});

test("approve seals a value the app can open, and the webhook is signed", async () => {
  manifests.set("nonce-approve-0001", manifest());
  const page = await open("nonce-approve-0001");
  assert.equal(page.status, 200);
  assert.match(page.text, /Verified origin: <b>127\.0\.0\.1:\d+<\/b>/);
  const rid = requestIdOf(page.text);
  assert.ok(rid);

  // Someone else cannot take or approve it.
  assert.equal((await open("nonce-approve-0001", "u2")).status, 409);
  const sealed = await seal("COINPAY_API_KEY", "cp_live_fixture_value");
  assert.equal((await call("POST", `/api/v1/app-grants/requests/${rid}/approve`, "u2", { deliveries: [{ key_name: "COINPAY_API_KEY", vault_id: "v1", source_name: "COINPAY_API_KEY", fingerprint: "fp-coinpay-1", sealed }] })).status, 404);

  // Stale value (rotated since the page opened) is refused.
  const stale = await call("POST", `/api/v1/app-grants/requests/${rid}/approve`, "u1", { deliveries: [{ key_name: "COINPAY_API_KEY", vault_id: "v1", source_name: "COINPAY_API_KEY", fingerprint: "old", sealed }] });
  assert.equal(stale.status, 409);

  const ok = await call("POST", `/api/v1/app-grants/requests/${rid}/approve`, "u1", { deliveries: [{ key_name: "COINPAY_API_KEY", vault_id: "v1", source_name: "COINPAY_API_KEY", fingerprint: "fp-coinpay-1", sealed }] });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.delivered[0].delivered, true);
  assert.equal(ok.json.return_url, `${extBase}/secrets`);

  const hook = received.at(-1);
  assert.ok(verifySig(hook), "webhook signature");
  const event = JSON.parse(hook.body);
  assert.equal(event.type, "grant.delivered");
  assert.equal(event.recipient_user_id, appUser);
  // The app opens it with its own data key: the full round trip.
  const entry = JSON.parse(event.sealed.slice("sealed:v2:".length));
  assert.deepEqual(await appSealer.openInbox(vault.dek, vault.seal, [entry], appUser).then((r) => r.patch), { COINPAY_API_KEY: "cp_live_fixture_value" });

  // Nothing readable was stored by logicsrc.
  const row = await get(`SELECT * FROM app_grants WHERE request_id = ?`, [rid]);
  assert.ok(!JSON.stringify(row).includes("cp_live_fixture_value"));
  assert.equal((await call("POST", `/api/v1/app-grants/requests/${rid}/approve`, "u1", { deliveries: [] })).status, 409);
});

test("signing keys never go to an app", async () => {
  manifests.set("nonce-signing-0001", manifest(["X402_PRIVATE_KEY", "COINPAY_API_KEY"]));
  const page = await open("nonce-signing-0001");
  assert.match(page.text, /Refused: X402_PRIVATE_KEY/);
  const rid = requestIdOf(page.text);
  const r = await call("POST", `/api/v1/app-grants/requests/${rid}/approve`, "u1", { deliveries: [{ key_name: "X402_PRIVATE_KEY", vault_id: "v1", source_name: "X402_PRIVATE_KEY", fingerprint: "fp-x402", sealed: await seal("X402_PRIVATE_KEY", "k") }] });
  assert.equal(r.status, 403);
  assert.equal(r.json.code, "signing_key");
});

test("rotation re-delivers by fingerprint; revoke tells the app", async () => {
  const mine = await call("GET", "/api/v1/app-grants?fingerprint=fp-coinpay-1", "u1");
  assert.equal(mine.json.grants.length, 1);
  assert.equal((await call("GET", "/api/v1/app-grants?fingerprint=fp-coinpay-1", "u2")).json.grants.length, 0, "no vault access, no grants");
  const g = mine.json.grants[0];

  await run(`UPDATE credshare_secrets SET fingerprint = ? WHERE vault_id = ? AND name = ?`, ["fp-coinpay-2", "v1", "COINPAY_API_KEY"]);
  const sealed = await seal("COINPAY_API_KEY", "cp_live_rotated");
  assert.equal((await call("POST", `/api/v1/app-grants/${g.id}/deliveries`, "u1", { sealed, fingerprint: "fp-coinpay-1" })).status, 409);
  const d = await call("POST", `/api/v1/app-grants/${g.id}/deliveries`, "u1", { sealed, fingerprint: "fp-coinpay-2" });
  assert.equal(d.status, 200, d.text);
  const upd = JSON.parse(received.at(-1).body);
  assert.equal(upd.type, "grant.updated");
  assert.equal(upd.grant_id, g.id);

  const rv = await call("DELETE", `/api/v1/app-grants/${g.id}`, "u1");
  assert.equal(rv.status, 200);
  assert.equal(JSON.parse(received.at(-1).body).type, "grant.revoked");
  assert.equal((await call("POST", `/api/v1/app-grants/${g.id}/deliveries`, "u1", { sealed, fingerprint: "fp-coinpay-2" })).status, 404);
});

test("an unknown nonce or a bad manifest is refused", async () => {
  assert.equal((await open("nonce-missing-00001")).status, 404);
  manifests.set("nonce-badhook-0001", { ...manifest(), webhook_url: "https://elsewhere.test/hook" });
  assert.equal((await open("nonce-badhook-0001")).status, 502);
});

test("a webhook host that now resolves privately gets no delivery", async () => {
  const { sendWebhook } = await import("../src/lib/app-grants.mjs");
  let called = false;
  const r = await sendWebhook("https://localhost.localdomain./hook", "s".repeat(40), {}, { fetchImpl: async () => ((called = true), new Response("ok")) });
  assert.equal(r.ok, false);
  assert.equal(called, false);
});
