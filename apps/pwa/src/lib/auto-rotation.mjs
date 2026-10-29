// Paid automatic rotation (Anthony, 2026-10-29): $29 buys one team 30 days of
// rotation_auto_approve, so its due runs rotate without the approval click.
//
// CoinPay payments are one-off (crypto or PayPal), so nothing renews by itself:
// a checkout buys a fixed term and paying again extends it from the current end.
// The webhook and the Rotation page's return check both settle through
// settlePayment(), which is idempotent on the checkout session id. The hourly
// sweep turns the switch off when the paid days run out and emails the team's
// owners and admins a renewal link 3 days before.
//
// rotation_auto_paid_until NULL with the switch on means it was flipped by hand
// (a comp): it never expires and a payment does not cap it.
import { CoinPay, readWebhook, verifyWebhook } from "@profullstack/coinpay-onboard";
import { get, all, run } from "../db.mjs";
import { config } from "../config.mjs";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const AUTO_ROTATION_PRICE_USD = Number(process.env.AUTO_ROTATION_PRICE_USD || 29);
export const AUTO_ROTATION_DAYS = 30;
export const RENEWAL_NOTICE_DAYS = 3;
export const PROPERTY = "app.logicsrc.com";
export const PURPOSE = "auto_rotation";

export { readWebhook };

/** Is automatic rotation on for this team right now? */
export function autoRotationState(team, now = Date.now()) {
  const flag = Boolean(Number(team?.rotation_auto_approve));
  const paidUntil = team?.rotation_auto_paid_until == null ? null : Number(team.rotation_auto_paid_until);
  const manual = flag && paidUntil === null;
  const on = flag && (manual || paidUntil > now);
  return { on, manual, paidUntil, expired: flag && !manual && paidUntil <= now, daysLeft: on && !manual ? Math.ceil((paidUntil - now) / DAY_MS) : null };
}

export const autoRotationOn = (team, now = Date.now()) => autoRotationState(team, now).on;

/** A CoinPay client on app.logicsrc.com's business key. */
export function coinpayClient(env = process.env) {
  const token = env.COINPAY_API_KEY;
  if (!token) throw new Error("COINPAY_API_KEY is not configured");
  return new CoinPay({ token, base: env.COINPAY_API_URL || undefined });
}

/** Open a hosted checkout for 30 days of automatic rotation on one team. */
export async function createCheckout({ team, user, client = coinpayClient(), origin = config.origin }) {
  if (!user?.id || !user?.email) throw new Error("A signed-in user with an email is required");
  const back = `${origin}/teams/${encodeURIComponent(team.slug)}/rotation`;
  return client.createCheckoutSession({
    amount: AUTO_ROTATION_PRICE_USD,
    currency: "USD",
    description: `LogicSRC automatic rotation for ${team.slug}, ${AUTO_ROTATION_DAYS} days`,
    customerEmail: user.email,
    accountId: user.id,
    property: PROPERTY,
    metadata: { purpose: PURPOSE, team_id: team.id, team_slug: team.slug, user_id: user.id, days: AUTO_ROTATION_DAYS },
    successUrl: `${back}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${back}?checkout=cancelled`,
    expiresInMinutes: 60,
  });
}

/** Verify X-CoinPay-Signature over the raw body. */
export function verifySignature(rawBody, header, secret = process.env.COINPAY_WEBHOOK_SECRET) {
  if (!secret || !rawBody) return false;
  try { return verifyWebhook(rawBody, header, secret); } catch { return false; }
}

/**
 * Grant the days a paid checkout bought. Idempotent on the checkout session (or
 * payment) id: the first settle extends the team, any later one (confirmed then
 * forwarded, a webhook retry, the return check) changes nothing.
 */
export async function settlePayment(payment, now = Date.now()) {
  const { checkoutSessionId, paymentId, teamId } = payment;
  const key = checkoutSessionId || paymentId;
  if (!key) return { handled: false, reason: "no checkout session or payment id" };
  if (!teamId) return { handled: false, reason: "no team_id" };
  // No amount check: only this site's business key can open a session, at the
  // server's price, and a crypto webhook's `amount` may be in the coin, not USD.
  const team = await get(`SELECT * FROM credshare_teams WHERE id = ?`, [teamId]);
  if (!team) return { handled: false, reason: "unknown team" };

  const ins = await run(
    `INSERT INTO rotation_payments (checkout_session_id, payment_id, team_id, user_id, amount_usd, method, days, created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (checkout_session_id) DO NOTHING`,
    [key, paymentId || null, teamId, payment.userId || null, payment.amountUsd ?? null, payment.method || null, AUTO_ROTATION_DAYS, now]
  );
  if (!Number(ins.rowsAffected)) return { handled: true, duplicate: true, teamId };

  const state = autoRotationState(team, now);
  if (state.manual) {
    await run(`UPDATE rotation_payments SET paid_until = NULL WHERE checkout_session_id = ?`, [key]);
    return { handled: true, action: "already-on-by-hand", teamId };
  }
  const from = state.on ? state.paidUntil : now;
  const paidUntil = from + AUTO_ROTATION_DAYS * DAY_MS;
  await run(
    `UPDATE credshare_teams SET rotation_auto_approve = 1, rotation_auto_paid_until = ?, rotation_auto_reminded_for = NULL WHERE id = ?`,
    [paidUntil, teamId]
  );
  await run(`UPDATE rotation_payments SET paid_until = ? WHERE checkout_session_id = ?`, [paidUntil, key]);
  await run(
    `INSERT INTO credshare_audit (id, team_id, actor_user_id, action, key_name, created_at) VALUES (?,?,?,?,?,?)`,
    [`aud_${key}`, teamId, payment.userId || team.created_by, state.on ? "rotation.auto.extended" : "rotation.auto.paid", new Date(paidUntil).toISOString().slice(0, 10), now]
  ).catch(() => {});
  return { handled: true, action: state.on ? "extended" : "activated", teamId, paidUntil };
}

/** Settle from a verified webhook payload. */
export async function settleWebhook(payload, now = Date.now()) {
  const event = readWebhook(payload);
  if (!event.paid) return { handled: false, type: event.type, status: event.status };
  if (event.property && event.property !== PROPERTY) return { handled: false, reason: "other property" };
  const meta = event.metadata || {};
  if (meta.purpose && meta.purpose !== PURPOSE) return { handled: false, reason: `purpose ${meta.purpose}` };
  return settlePayment({
    checkoutSessionId: event.checkoutSessionId,
    paymentId: event.paymentId,
    teamId: meta.team_id,
    userId: meta.user_id || event.accountId,
    amountUsd: event.amountUsd,
    method: event.method,
  }, now);
}

/**
 * The Rotation page's return check: if CoinPay already marks the session paid
 * for this team, settle it now (the webhook may still be on its way).
 */
export async function reconcileReturn(sessionId, team, client = coinpayClient(), now = Date.now()) {
  if (!sessionId || !/^cs_[A-Za-z0-9_-]+$/.test(sessionId)) return null;
  const session = await client.checkoutSession(sessionId);
  const meta = session.metadata || {};
  if (meta.team_id !== team.id || (meta.purpose && meta.purpose !== PURPOSE)) return null;
  if (session.status === "paid") {
    await settlePayment({
      checkoutSessionId: session.id,
      paymentId: session.paymentId || null,
      teamId: team.id,
      userId: meta.user_id || session.accountId,
      amountUsd: session.amount,
      method: session.paidMethod || null,
    }, now);
  }
  return session.status;
}

async function sendMail(to, subject, text) {
  if (!config.resend.apiKey || !to.length) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.resend.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: config.resend.from, to, subject, text }),
  }).catch(() => null);
  return Boolean(response && response.ok);
}

async function approverEmails(teamId) {
  return (await all(
    `SELECT u.email FROM credshare_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? AND m.status = 'active' AND m.role IN ('owner', 'admin')`,
    [teamId]
  )).map((r) => r.email).filter(Boolean);
}

/**
 * The hourly sweep: turn the switch off for teams whose paid days ran out, and
 * email a renewal link to teams with 3 days or less left (once per paid term).
 */
export async function sweepAutoRotation({ now = Date.now(), send = sendMail, origin = config.origin } = {}) {
  const lapsed = await all(
    `SELECT id, slug FROM credshare_teams WHERE rotation_auto_approve = 1 AND rotation_auto_paid_until IS NOT NULL AND rotation_auto_paid_until <= ?`,
    [now]
  );
  for (const t of lapsed) {
    await run(`UPDATE credshare_teams SET rotation_auto_approve = 0 WHERE id = ? AND rotation_auto_paid_until <= ?`, [t.id, now]);
    await send(await approverEmails(t.id), `Automatic rotation is now off for ${t.slug}`,
      `The paid automatic rotation for the LogicSRC team "${t.slug}" has ended. Due keys now wait for an owner or admin to approve them again.\n\nTurn it back on ($${AUTO_ROTATION_PRICE_USD} for ${AUTO_ROTATION_DAYS} days): ${origin}/teams/${encodeURIComponent(t.slug)}/rotation`);
  }
  const ending = await all(
    `SELECT id, slug, rotation_auto_paid_until FROM credshare_teams WHERE rotation_auto_approve = 1 AND rotation_auto_paid_until > ? AND rotation_auto_paid_until <= ? AND (rotation_auto_reminded_for IS NULL OR rotation_auto_reminded_for <> rotation_auto_paid_until)`,
    [now, now + RENEWAL_NOTICE_DAYS * DAY_MS]
  );
  for (const t of ending) {
    const until = new Date(Number(t.rotation_auto_paid_until)).toISOString().slice(0, 10);
    await send(await approverEmails(t.id), `Automatic rotation for ${t.slug} ends ${until}`,
      `The paid automatic rotation for the LogicSRC team "${t.slug}" ends on ${until} (UTC). After that, due keys wait for an owner or admin to approve them.\n\nRenew for another ${AUTO_ROTATION_DAYS} days ($${AUTO_ROTATION_PRICE_USD}, added to the current end): ${origin}/teams/${encodeURIComponent(t.slug)}/rotation`);
    await run(`UPDATE credshare_teams SET rotation_auto_reminded_for = ? WHERE id = ?`, [t.rotation_auto_paid_until, t.id]);
  }
  return { expired: lapsed.map((t) => t.slug), reminded: ending.map((t) => t.slug) };
}
