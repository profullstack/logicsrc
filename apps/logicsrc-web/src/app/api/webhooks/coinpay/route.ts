import type { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { parseJson, verifyCoinPayWebhook } from "@/lib/coinpay";
import { settleHireUsWebhook } from "@/lib/coinpay-webhook";
import { supabaseHireUsPaymentStore } from "@/lib/hire-us-payments";

export const dynamic = "force-dynamic";

// POST /api/webhooks/coinpay — verify the signed CoinPay webhook
// (X-CoinPay-Signature: t=<unix>,v1=<hmac-sha256 of "t.rawBody">) and settle a
// paid Hire Us checkout exactly once, keyed on data.payment_id.
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.COINPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return json({ success: false, error: "CoinPay webhook is not configured" }, 503);
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-coinpay-signature");
  if (!verifyCoinPayWebhook(rawBody, signatureHeader, webhookSecret)) {
    return json({ success: false, error: "Invalid signature" }, 401);
  }

  const payload = parseJson(rawBody);
  try {
    const result = await settleHireUsWebhook(payload, supabaseHireUsPaymentStore());
    console.log("[coinpay] webhook", { type: payload.type ?? null, ...result });
    return json({ received: true, ...result });
  } catch (error) {
    // 500 so CoinPay retries: the payment is real but we could not record it.
    console.error("[coinpay] webhook settle failed", error);
    return json({ received: false, error: "settlement failed" }, 500);
  }
}
