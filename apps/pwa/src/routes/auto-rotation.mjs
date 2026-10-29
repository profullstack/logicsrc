// Buying automatic rotation ($29 / 30 days per team) through CoinPay.
//
//   POST /teams/:slug/rotation/auto/checkout                 the Rotation page button: 303 to CoinPay checkout
//   POST /api/credshare/teams/:slug/rotation/auto/checkout   the same for the CLI / MCP: {url, sessionId}
//   GET  /api/credshare/teams/:slug/rotation/auto            the switch's state
//   POST /api/coinpay/webhook                                CoinPay events (X-CoinPay-Signature over the raw body)
//
// Only a team owner or admin can buy (a person, never a machine key). The webhook
// and the page's return check settle through lib/auto-rotation.mjs settlePayment().
import { Router } from "express";
import { get } from "../db.mjs";
import { requireAuth } from "../lib/session.mjs";
import { api, requireMember } from "./credshare.mjs";
import { autoRotationState, createCheckout, settleWebhook, verifySignature, AUTO_ROTATION_PRICE_USD, AUTO_ROTATION_DAYS } from "../lib/auto-rotation.mjs";

export const autoRotationRouter = Router();

const canBuy = (member) => member?.role === "owner" || member?.role === "admin";

async function buyer(userId) {
  return get(`SELECT id, email FROM users WHERE id = ?`, [userId]);
}

autoRotationRouter.post("/teams/:slug/rotation/auto/checkout", requireAuth, async (req, res, next) => {
  const team = await get(`SELECT * FROM credshare_teams WHERE slug = ?`, [req.params.slug]);
  const member = team && await get(`SELECT * FROM credshare_members WHERE team_id = ? AND user_id = ? AND status = 'active'`, [team.id, req.user.id]);
  if (!team || !member) return next();
  const back = `/teams/${encodeURIComponent(team.slug)}/rotation`;
  if (!canBuy(member)) return res.redirect(`${back}?err=${encodeURIComponent("Only a team owner or admin can turn on automatic rotation.")}`);
  try {
    const session = await createCheckout({ team, user: await buyer(req.user.id) });
    res.redirect(303, session.url);
  } catch (e) {
    console.error("auto-rotation checkout failed:", e.message);
    res.redirect(`${back}?err=${encodeURIComponent("Could not open the CoinPay checkout. Try again in a minute.")}`);
  }
});

autoRotationRouter.get("/api/credshare/teams/:slug/rotation/auto", api(async (req, res, user, key) => {
  const ctx = await requireMember(res, req.params.slug, user.id, key); if (!ctx) return;
  const s = autoRotationState(ctx.team);
  res.json({ team: ctx.team.slug, on: s.on, manual: s.manual, paidUntil: s.paidUntil ? new Date(s.paidUntil).toISOString() : null, daysLeft: s.daysLeft, priceUsd: AUTO_ROTATION_PRICE_USD, days: AUTO_ROTATION_DAYS });
}, { machine: "read" }));

autoRotationRouter.post("/api/credshare/teams/:slug/rotation/auto/checkout", api(async (req, res, user, key) => {
  const ctx = await requireMember(res, req.params.slug, user.id, key); if (!ctx) return;
  if (!canBuy(ctx.member)) return res.status(403).json({ error: "Only a team owner or admin can turn on automatic rotation." });
  const session = await createCheckout({ team: ctx.team, user: await buyer(user.id) });
  res.status(201).json({ sessionId: session.id, url: session.url, priceUsd: AUTO_ROTATION_PRICE_USD, days: AUTO_ROTATION_DAYS });
}));

autoRotationRouter.post("/api/coinpay/webhook", async (req, res) => {
  if (!verifySignature(req.rawBody, req.get("x-coinpay-signature"))) return res.status(401).json({ error: "Invalid signature" });
  try {
    const result = await settleWebhook(req.body);
    console.log("coinpay webhook", JSON.stringify(result));
    res.json({ received: true, ...result });
  } catch (e) {
    console.error("coinpay webhook settle failed:", e);
    res.status(500).json({ error: "Settle failed" });
  }
});
