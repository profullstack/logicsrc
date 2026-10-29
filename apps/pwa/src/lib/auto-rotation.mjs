// Paid automatic rotation (Anthony, 2026-10-29): $29 buys one team 30 days of
// rotation_auto_approve, so its due runs rotate without the approval click.
//
// The checkout, webhook settle, return check and hourly expiry/renewal sweep live
// in @profullstack/key-rotation; this file binds it to credshare_teams, the
// team's owners and admins, the audit log and this app's CoinPay business.
//
// rotation_auto_paid_until NULL with the switch on means it was flipped by hand
// (a comp): it never expires and a payment does not cap it.
import { CoinPay, readWebhook } from "@profullstack/coinpay-onboard";
import { createAutoRotation, sqlStore, resendMailer, DAY_MS } from "@profullstack/key-rotation";
import { get, all, run } from "../db.mjs";
import { config } from "../config.mjs";

export { DAY_MS, readWebhook };
export const AUTO_ROTATION_PRICE_USD = Number(process.env.AUTO_ROTATION_PRICE_USD || 29);
export const AUTO_ROTATION_DAYS = 30;
export const RENEWAL_NOTICE_DAYS = 3;
export const PROPERTY = "app.logicsrc.com";
export const PURPOSE = "auto_rotation";

export const store = sqlStore({
  get, all, run,
  subjects: { table: "credshare_teams" },
  payments: { table: "rotation_payments", subject: "team_id" },
  approverEmails: async (teamId) => (await all(
    `SELECT u.email FROM credshare_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? AND m.status = 'active' AND m.role IN ('owner', 'admin')`,
    [teamId]
  )).map((r) => r.email).filter(Boolean),
  audit: ({ key, subject, userId, action, paidUntil, now }) => run(
    `INSERT INTO credshare_audit (id, team_id, actor_user_id, action, key_name, created_at) VALUES (?,?,?,?,?,?)`,
    [`aud_${key}`, subject.id, userId || subject.created_by, action === "extended" ? "rotation.auto.extended" : "rotation.auto.paid", new Date(paidUntil).toISOString().slice(0, 10), now]
  ),
});

/** A CoinPay client on app.logicsrc.com's business key. */
export function coinpayClient(env = process.env) {
  const token = env.COINPAY_API_KEY;
  if (!token) throw new Error("COINPAY_API_KEY is not configured");
  return new CoinPay({ token, base: env.COINPAY_API_URL || undefined });
}

/** The module bound to this app; `origin` only changes the links (tests). */
export function autoRotation(origin = config.origin, send = resendMailer(config.resend)) {
  return createAutoRotation({
    property: PROPERTY,
    purpose: PURPOSE,
    product: "LogicSRC",
    priceUsd: AUTO_ROTATION_PRICE_USD,
    days: AUTO_ROTATION_DAYS,
    noticeDays: RENEWAL_NOTICE_DAYS,
    store,
    coinpay: () => coinpayClient(),
    webhookSecret: () => process.env.COINPAY_WEBHOOK_SECRET,
    pageUrl: (team) => `${origin}/teams/${encodeURIComponent(team.slug)}/rotation`,
    send,
  });
}
const app = autoRotation();

/** Is automatic rotation on for this team row right now? */
export const autoRotationState = (team, now = Date.now()) => app.state(store.toSubject(team), now);
export const autoRotationOn = (team, now = Date.now()) => autoRotationState(team, now).on;

/** Open a hosted checkout for 30 days of automatic rotation on one team. */
export const createCheckout = ({ team, user, client, origin }) =>
  (origin ? autoRotation(origin) : app).createCheckout({ subject: team, user, client });

export const verifySignature = (rawBody, header, secret) => app.verifySignature(rawBody, header, secret);

/** Grant the days a paid checkout bought; idempotent on the checkout session id. */
export async function settlePayment({ teamId, ...payment }, now = Date.now()) {
  const { subjectId, ...result } = await app.settlePayment({ ...payment, subjectId: teamId }, now);
  return subjectId === undefined ? result : { ...result, teamId: subjectId };
}

/** Settle from a verified webhook payload. */
export async function settleWebhook(payload, now = Date.now()) {
  const { subjectId, ...result } = await app.settleWebhook(payload, now);
  return subjectId === undefined ? result : { ...result, teamId: subjectId };
}

/** The Rotation page's return check. */
export const reconcileReturn = (sessionId, team, client, now = Date.now()) =>
  app.reconcileReturn(sessionId, team, client, now);

/** The hourly sweep: expiry + one renewal notice per term. */
export const sweepAutoRotation = ({ now = Date.now(), send, origin } = {}) =>
  (origin ? autoRotation(origin) : app).sweep({ now, ...(send ? { send } : {}) });
