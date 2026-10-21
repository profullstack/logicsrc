import type { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { COINPAY_SESSION_COOKIE, parseJson, verifySession } from "@/lib/coinpay";
import { HIRE_US_PRODUCT } from "@/lib/coinpay-webhook";
import { hireUsCheckoutStore } from "@/lib/hire-us-payments";

export const dynamic = "force-dynamic";

// POST /api/hire-us/coinpay-checkout — open a CoinPay hosted checkout session for
// approved Hire Us hours at $400/hour/agent. The buyer picks any coin the
// business has a wallet for, or PayPal, on CoinPay's page. Billing is metered:
// the caller supplies the approved hours and the amount is derived from them.
//
// Body: { hours?: number (default 10), email?: string }. An email is required
// (from the body or the signed-in CoinPay session). account_id is the CoinPay
// account when signed in, else the buyer email (guest checkout).
const RATE_USD_PER_HOUR = 400;
const MINIMUM_HOURS = 10;
const PROPERTY = "logicsrc.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Hours represent total approved agent-hours, not wall-clock duration.
// Hours are quoted in quarter-hour increments; anything finer is a rounding
// artifact rather than a real billing unit.
function parseHours(value: unknown): number | null {
  const hours = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(hours) || hours < MINIMUM_HOURS) return null;
  const quarters = Math.round(hours * 4);
  if (Math.abs(hours * 4 - quarters) > 1e-9) return null;
  return quarters / 4;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.COINPAY_API_KEY;
  const apiUrl = (process.env.COINPAY_API_URL || "https://coinpayportal.com").replace(/\/+$/, "").replace(/\/api$/, "");
  const publicUrl = (process.env.PUBLIC_URL || "https://logicsrc.com").replace(/\/+$/, "");

  if (!apiKey) {
    return json({ success: false, error: "CoinPay checkout is not configured" }, 503);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    // A signed-in CoinPay session (OAuth cookie) identifies the account.
    const sessionCookie = request.cookies.get(COINPAY_SESSION_COOKIE)?.value;
    let session: Record<string, unknown> | null = null;
    try {
      session = sessionCookie ? verifySession(sessionCookie) : null;
    } catch {
      session = null;
    }
    const sessionAccount = typeof session?.sub === "string" ? session.sub : "";
    const sessionEmail = typeof session?.email === "string" ? session.email : "";
    const bodyEmail = typeof body.email === "string" ? body.email.trim().slice(0, 160) : "";
    const buyerEmail = (bodyEmail || sessionEmail).toLowerCase();
    const hours = body.hours === undefined ? MINIMUM_HOURS : parseHours(body.hours);

    if (hours === null) {
      return json(
        {
          success: false,
          error: `Approved agent-hours must be a quarter-hour increment of at least ${MINIMUM_HOURS}`
        },
        422
      );
    }
    if (!EMAIL_RE.test(buyerEmail)) {
      return json({ success: false, error: "An email address is required for the receipt" }, 422);
    }

    const accountId = sessionAccount || buyerEmail;
    const amountUsdDue = Math.round(hours * RATE_USD_PER_HOUR * 100) / 100;

    const checkoutResponse = await fetch(`${apiUrl}/api/checkout/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        amount: amountUsdDue,
        currency: "USD",
        description: `LogicSRC Hire Us - ${hours} agent-hours @ $${RATE_USD_PER_HOUR}/agent-hour`,
        customer_email: buyerEmail,
        account_id: accountId,
        property: PROPERTY,
        success_url: `${publicUrl}/hire-us?payment=success&session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${publicUrl}/hire-us?payment=cancelled`,
        expires_in_minutes: 60,
        metadata: {
          product: HIRE_US_PRODUCT,
          billing: "metered_hours",
          unit: "agent_hour",
          hours,
          rate_usd_per_hour: RATE_USD_PER_HOUR,
          source: "logicsrc.com/hire-us",
          property: PROPERTY,
          account_id: accountId,
          email: buyerEmail,
          buyer_email: buyerEmail
        }
      })
    });

    const responseText = await checkoutResponse.text();
    const payload = parseJson(responseText);
    const sessionId = typeof payload.id === "string" ? payload.id : "";
    const checkoutUrl = typeof payload.url === "string" ? payload.url : "";

    if (!checkoutResponse.ok || !/^cs_[A-Za-z0-9]{8,64}$/.test(sessionId) || !checkoutUrl) {
      console.error("[coinpay] checkout session create failed", {
        status: checkoutResponse.status,
        code: payload.code ?? null,
        error: (payload.error as string) || responseText.slice(0, 300)
      });
      return json(
        { success: false, error: (payload.error as string) || "CoinPay checkout failed" },
        checkoutResponse.ok ? 502 : checkoutResponse.status
      );
    }
    // Only ever send buyers to CoinPay's own origin.
    if (new URL(checkoutUrl, apiUrl).origin !== new URL(apiUrl).origin) {
      console.error("[coinpay] checkout session url on another origin");
      return json({ success: false, error: "CoinPay checkout failed" }, 502);
    }

    try {
      await hireUsCheckoutStore().recordOpen({
        session_id: sessionId,
        account_id: accountId,
        buyer_email: buyerEmail,
        hours,
        rate_usd_per_hour: RATE_USD_PER_HOUR,
        amount_usd: amountUsdDue
      });
    } catch (error) {
      // The session still settles from its own fields on the webhook.
      console.error("[coinpay] could not record checkout session", error);
    }

    const methods = Array.isArray(payload.methods)
      ? payload.methods
          .map((m) => (typeof m === "string" ? m : String((m as { code?: unknown })?.code ?? "")))
          .filter(Boolean)
      : [];
    return json(
      {
        success: true,
        payment: {
          id: sessionId,
          session_id: sessionId,
          amount_usd: amountUsdDue,
          hours,
          rate_usd_per_hour: RATE_USD_PER_HOUR,
          payment_method: "checkout",
          methods,
          expires_at: payload.expires_at ?? null,
          status: payload.status ?? "open",
          checkout_url: checkoutUrl
        }
      },
      201
    );
  } catch (error) {
    console.error("[coinpay] checkout request failed", error);
    return json({ success: false, error: "Unable to reach CoinPay checkout" }, 500);
  }
}
