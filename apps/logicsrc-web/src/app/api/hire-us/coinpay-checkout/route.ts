import type { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { choosePaymentRail, fetchMerchantEligibility, parseJson } from "@/lib/coinpay";

export const dynamic = "force-dynamic";

// POST /api/hire-us/coinpay-checkout — create a CoinPay checkout for approved
// Hire Us hours at $400/hour, choosing card/crypto/both based on merchant
// eligibility. Billing is metered: the caller supplies the approved hours and the
// amount is derived from them, never a fixed recurring figure.
const RATE_USD_PER_HOUR = 400;
const MINIMUM_HOURS = 10;

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
  const eligibilityApiKey = process.env.COINPAY_ELIGIBILITY_API_KEY || process.env.COINPAY_AGENT_API_KEY || apiKey;
  const businessId = process.env.COINPAY_BUSINESS_ID || process.env.COINPAY_MERCHANT_ID;
  const eligibilityMerchantId = process.env.COINPAY_ELIGIBILITY_MERCHANT_ID || process.env.COINPAY_MERCHANT_ID;
  const apiUrl = process.env.COINPAY_API_URL || "https://coinpayportal.com";
  const blockchain = process.env.COINPAY_HIRE_US_BLOCKCHAIN || "USDC_POL";
  const publicUrl = process.env.PUBLIC_URL || "https://logicsrc.com";

  if (!apiKey || !businessId) {
    return json({ success: false, error: "CoinPay checkout is not configured" }, 503);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const buyerEmail = typeof body.email === "string" ? body.email.trim().slice(0, 160) : "";
    const hours = body.hours === undefined ? MINIMUM_HOURS : parseHours(body.hours);

    if (hours === null) {
      return json(
        {
          success: false,
          error: `Approved hours must be a quarter-hour increment of at least ${MINIMUM_HOURS}`
        },
        422
      );
    }

    const amountUsdDue = Math.round(hours * RATE_USD_PER_HOUR * 100) / 100;
    const eligibility = await fetchMerchantEligibility(apiUrl, eligibilityApiKey, eligibilityMerchantId);
    const paymentRail = choosePaymentRail(eligibility, blockchain);

    if (!paymentRail) {
      return json({ success: false, error: "CoinPay checkout is not available for this merchant" }, 503);
    }

    const checkoutResponse = await fetch(new URL("/api/payments/create", apiUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        business_id: businessId,
        amount_usd: amountUsdDue,
        payment_method: paymentRail.method,
        currency: paymentRail.currency,
        ...(paymentRail.blockchain ? { blockchain: paymentRail.blockchain } : {}),
        description: `LogicSRC Hire Us - ${hours}h @ $${RATE_USD_PER_HOUR}/hour`,
        success_url: `${publicUrl}/hire-us?payment=success`,
        cancel_url: `${publicUrl}/hire-us?payment=cancelled`,
        redirect_url: `${publicUrl}/hire-us?payment=coinpay`,
        webhook_url: `${publicUrl}/api/webhooks/coinpay`,
        metadata: {
          product: "logicsrc-hire-us",
          billing: "metered_hours",
          hours,
          rate_usd_per_hour: RATE_USD_PER_HOUR,
          source: "logicsrc.com/hire-us",
          ...(buyerEmail ? { buyer_email: buyerEmail } : {})
        }
      })
    });

    const responseText = await checkoutResponse.text();
    const payload = parseJson(responseText);

    if (!checkoutResponse.ok || payload.success !== true) {
      console.error("[coinpay] checkout create failed", {
        status: checkoutResponse.status,
        error: (payload.error as string) || responseText.slice(0, 300)
      });
      return json(
        { success: false, error: (payload.error as string) || "CoinPay checkout failed" },
        checkoutResponse.ok ? 502 : checkoutResponse.status
      );
    }

    const payment = (payload.payment as Record<string, unknown>) || {};
    const amountUsd = Number(payment.amount_usd ?? payment.amount ?? amountUsdDue);
    return json(
      {
        success: true,
        payment: {
          id: payment.id,
          amount_usd: Number.isFinite(amountUsd) ? amountUsd : amountUsdDue,
          hours,
          rate_usd_per_hour: RATE_USD_PER_HOUR,
          payment_method: payment.stripe_checkout_url ? "card" : paymentRail.method,
          currency: payment.currency ?? payment.blockchain ?? paymentRail.blockchain ?? paymentRail.currency,
          crypto_amount: payment.amount_crypto ?? payment.crypto_amount ?? null,
          address: payment.payment_address ?? null,
          qr_code: payment.qr_code ?? null,
          expires_at: payment.expires_at ?? null,
          status: payment.status ?? "pending",
          checkout_url: payment.stripe_checkout_url ?? payload.checkout_url ?? payment.checkout_url ?? null
        }
      },
      201
    );
  } catch (error) {
    console.error("[coinpay] checkout request failed", error);
    return json({ success: false, error: "Unable to reach CoinPay checkout" }, 500);
  }
}
