// Paid automatic rotation (lib/auto-rotation.mjs, routes/auto-rotation.mjs): a
// CoinPay checkout buys a team 30 days of auto-approve; settling is idempotent,
// a second payment extends from the current end, a hand-flipped team is never
// capped, the hourly sweep switches lapsed teams off and sends one renewal notice.
process.env.DATABASE_URL = process.env.PWA_TEST_DATABASE_URL || ":memory:";
process.env.COINPAY_WEBHOOK_SECRET = "whsec_test";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import { signWebhook } from "@profullstack/coinpay-onboard";

const here = dirname(fileURLToPath(import.meta.url));
const { db, run, get, isPostgres } = await import("../src/db.mjs");
const { autoRotationRouter } = await import("../src/routes/auto-rotation.mjs");
const { rotationRouter, queueDueRun } = await import("../src/routes/rotation.mjs");
const ar = await import("../src/lib/auto-rotation.mjs");

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

async function migrate() {
  if (isPostgres) {
    await db.execute("DROP SCHEMA public CASCADE");
    await db.execute("CREATE SCHEMA public");
  }
  for (const file of ["001_auth.sql", "002_credshare.sql", "005_machine_keys.sql", "007_hardening.sql", "010_rotation_runs.sql", "011_rotation_policy.sql", "012_auto_rotation_billing.sql"]) {
    const sql = readFileSync(join(here, "..", "src", isPostgres ? "migrations-pg" : "migrations", file), "utf8");
    for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.execute(statement);
  }
}

await migrate();
for (const [uid, email] of [["u_owner", "owner@example.com"], ["u_member", "member@example.com"]]) {
  await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, [uid, email, now]);
}
async function team(id, { auto = 0, paidUntil = null } = {}) {
  await run(`INSERT INTO credshare_teams (id, slug, name, created_by, created_at, rotation_auto_approve, rotation_auto_paid_until) VALUES (?,?,?,?,?,?,?)`, [id, id, id, "u_owner", now, auto, paidUntil]);
  await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, created_at) VALUES (?,?,?,?,?,?,?)`, [`${id}-o`, id, "u_owner", "owner@example.com", "owner", "active", now]);
  await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, created_at) VALUES (?,?,?,?,?,?,?)`, [`${id}-m`, id, "u_member", "member@example.com", "member", "active", now]);
  const vault = `${id}--prod`;
  await run(`INSERT INTO credshare_vaults (id, team_id, name, created_by, created_at) VALUES (?,?,?,?,?)`, [vault, id, vault, "u_owner", now]);
  await run(`INSERT INTO credshare_secrets (vault_id, name, nonce, ciphertext, fingerprint, version, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)`, [vault, "CRON_SECRET", "n", "CIPHERTEXT", `${id}-cron`, 1, "u_owner", now - 120 * DAY]);
}
const row = (id) => get(`SELECT * FROM credshare_teams WHERE id = ?`, [id]);

async function serve(userId) {
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString("utf8"); } }));
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => { if (userId) req.user = { id: userId }; req.csrfToken = "t"; next(); });
  app.use(autoRotationRouter);
  app.use(rotationRouter);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const raw = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
    const res = await fetch(`${base}${path}`, { method, redirect: "manual", headers: raw ? { "content-type": "application/json", ...headers } : headers, body: raw });
    const text = await res.text();
    return { status: res.status, location: res.headers.get("location"), body: text.startsWith("{") ? JSON.parse(text) : text };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

test("state: off, paid, lapsed, and hand-flipped", () => {
  assert.equal(ar.autoRotationState({ rotation_auto_approve: 0 }, now).on, false);
  const paid = ar.autoRotationState({ rotation_auto_approve: 1, rotation_auto_paid_until: now + 2.5 * DAY }, now);
  assert.equal(paid.on, true);
  assert.equal(paid.daysLeft, 3);
  const lapsed = ar.autoRotationState({ rotation_auto_approve: 1, rotation_auto_paid_until: now - 1 }, now);
  assert.equal(lapsed.on, false);
  assert.equal(lapsed.expired, true);
  const manual = ar.autoRotationState({ rotation_auto_approve: 1, rotation_auto_paid_until: null }, now);
  assert.equal(manual.on, true);
  assert.equal(manual.manual, true);
});

test("settle: activates 30 days, is idempotent, and a second payment extends from the end", async () => {
  await team("buy");
  const first = await ar.settlePayment({ checkoutSessionId: "cs_one", teamId: "buy", userId: "u_owner", amountUsd: 29, method: "USDC_POL" }, now);
  assert.equal(first.action, "activated");
  assert.equal(first.paidUntil, now + 30 * DAY);
  assert.equal(Number((await row("buy")).rotation_auto_approve), 1);
  const dup = await ar.settlePayment({ checkoutSessionId: "cs_one", teamId: "buy", amountUsd: 29 }, now + 1000);
  assert.equal(dup.duplicate, true);
  assert.equal(Number((await row("buy")).rotation_auto_paid_until), now + 30 * DAY);
  const second = await ar.settlePayment({ checkoutSessionId: "cs_two", teamId: "buy", amountUsd: 29 }, now + 5 * DAY);
  assert.equal(second.action, "extended");
  assert.equal(Number((await row("buy")).rotation_auto_paid_until), now + 60 * DAY);
});

test("settle: a hand-flipped team is never capped by a payment", async () => {
  await team("comp", { auto: 1 });
  const r = await ar.settlePayment({ checkoutSessionId: "cs_comp", teamId: "comp", amountUsd: 29 }, now);
  assert.equal(r.action, "already-on-by-hand");
  assert.equal((await row("comp")).rotation_auto_paid_until, null);
});

test("webhook: rejects a bad signature, settles a signed paid event once, ignores other properties", async (t) => {
  await team("hook");
  const app = await serve(null);
  t.after(app.close);
  const event = (id, extra = {}) => JSON.stringify({ id, type: "payment.confirmed", data: { payment_id: `pay_${id}`, status: "confirmed", checkout_session_id: `cs_${id}`, amount_usd: 29, blockchain: "USDC_POL", property: "app.logicsrc.com", metadata: { purpose: "auto_rotation", team_id: "hook", user_id: "u_owner" }, ...extra } });
  const body = event("h1");
  assert.equal((await app.call("POST", "/api/coinpay/webhook", body, { "x-coinpay-signature": "t=1,v1=bad" })).status, 401);
  const ok = await app.call("POST", "/api/coinpay/webhook", body, { "x-coinpay-signature": signWebhook(body, "whsec_test") });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.action, "activated");
  const again = await app.call("POST", "/api/coinpay/webhook", body, { "x-coinpay-signature": signWebhook(body, "whsec_test") });
  assert.equal(again.body.duplicate, true);
  const other = event("h2", { property: "logicsrc.com" });
  const o = await app.call("POST", "/api/coinpay/webhook", other, { "x-coinpay-signature": signWebhook(other, "whsec_test") });
  assert.equal(o.body.handled, false);
  const pending = JSON.stringify({ id: "h3", type: "payment.pending", data: { status: "pending", metadata: { team_id: "hook" } } });
  assert.equal((await app.call("POST", "/api/coinpay/webhook", pending, { "x-coinpay-signature": signWebhook(pending, "whsec_test") })).body.handled, false);
});

test("sweep: one renewal notice per term, then switches a lapsed team off", async () => {
  await team("ending", { auto: 1, paidUntil: now + 2 * DAY });
  await team("lapsed", { auto: 1, paidUntil: now - 1000 });
  const sent = [];
  const send = async (to, subject, text) => { sent.push({ to, subject, text }); return true; };
  const r1 = await ar.sweepAutoRotation({ now, send, origin: "https://app.example" });
  assert.ok(r1.reminded.includes("ending"));
  assert.ok(r1.expired.includes("lapsed"));
  assert.ok(!r1.reminded.includes("comp") && !r1.expired.includes("comp")); // hand-flipped: never touched
  assert.equal(Number((await row("lapsed")).rotation_auto_approve), 0);
  assert.equal(Number((await row("ending")).rotation_auto_approve), 1);
  const notice = sent.find((m) => m.subject.includes("ending"));
  assert.deepEqual(notice.to, ["owner@example.com"]); // owners/admins only
  assert.match(notice.text, /https:\/\/app\.example\/teams\/ending\/rotation/);
  const r2 = await ar.sweepAutoRotation({ now: now + 1000, send });
  assert.ok(!r2.reminded.includes("ending"));
  // Renewing clears the notice for the new term.
  await ar.settlePayment({ checkoutSessionId: "cs_renew", teamId: "ending", amountUsd: 29 }, now);
  assert.equal((await row("ending")).rotation_auto_reminded_for, null);
});

test("due runs: a paid team skips approval, a lapsed one waits for it", async () => {
  const paid = await queueDueRun(await row("buy"), { id: "u_owner" }, null, { now });
  assert.equal(paid.run.status, "queued");
  await team("late", { auto: 1, paidUntil: now - 1000 }); // lapsed but not swept yet
  const late = await queueDueRun(await row("late"), { id: "u_owner" }, null, { now });
  assert.equal(late.run.status, "awaiting-approval");
});

test("checkout: owner gets a CoinPay URL, a member is refused, the page shows the button", async (t) => {
  await team("shop");
  const owner = await serve("u_owner");
  const member = await serve("u_member");
  t.after(owner.close);
  t.after(member.close);
  const page = await owner.call("GET", "/teams/shop/rotation");
  assert.match(page.body, /Turn on automatic rotation, \$29 \/ 30 days/);
  assert.match(page.body, /action="\/teams\/shop\/rotation\/auto\/checkout"/);
  const memberPage = await member.call("GET", "/teams/shop/rotation");
  assert.ok(!memberPage.body.includes("/rotation/auto/checkout"));
  const refused = await member.call("POST", "/teams/shop/rotation/auto/checkout", {});
  assert.equal(refused.status, 302);
  assert.match(refused.location, /err=/);
  // createCheckout builds the session from the server's own price and the team.
  let input;
  const client = { createCheckoutSession: async (i) => { input = i; return { id: "cs_x", url: "https://coinpayportal.com/pay/cs_x" }; } };
  const s = await ar.createCheckout({ team: await row("shop"), user: { id: "u_owner", email: "owner@example.com" }, client, origin: "https://app.example" });
  assert.equal(s.url, "https://coinpayportal.com/pay/cs_x");
  assert.equal(input.amount, 29);
  assert.equal(input.property, "app.logicsrc.com");
  assert.deepEqual(input.metadata, { purpose: "auto_rotation", team_id: "shop", team_slug: "shop", user_id: "u_owner", days: 30 });
  assert.equal(input.successUrl, "https://app.example/teams/shop/rotation?checkout=success&session_id={CHECKOUT_SESSION_ID}");
});
