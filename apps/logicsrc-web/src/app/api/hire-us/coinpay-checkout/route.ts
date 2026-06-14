import type { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { choosePaymentRail, fetchMerchantEligibility, parseJson } from "@/lib/coinpay";

export const dynamic = "force-dynamic";

// POST /api/hire-us/coinpay-checkout — create a $250/week CoinPay checkout for
// the Hire Us plan, choosing card/crypto/both based on merchant eligibility.
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
        amount_usd: 250,
        payment_method: paymentRail.method,
        currency: paymentRail.currency,
        ...(paymentRail.blockchain ? { blockchain: paymentRail.blockchain } : {}),
        description: "LogicSRC Hire Us - $250/week",
        success_url: `${publicUrl}/hire-us?payment=success`,
        cancel_url: `${publicUrl}/hire-us?payment=cancelled`,
        redirect_url: `${publicUrl}/hire-us?payment=coinpay`,
        webhook_url: `${publicUrl}/api/webhooks/coinpay`,
        metadata: {
          product: "logicsrc-hire-us",
          interval: "week",
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
    const amountUsd = Number(payment.amount_usd ?? payment.amount ?? 250);
    return json(
      {
        success: true,
        payment: {
          id: payment.id,
          amount_usd: Number.isFinite(amountUsd) ? amountUsd : 250,
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
