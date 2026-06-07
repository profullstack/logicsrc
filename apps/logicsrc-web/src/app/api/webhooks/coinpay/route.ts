import type { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { parseJson, verifyCoinPayWebhook } from "@/lib/coinpay";

export const dynamic = "force-dynamic";

// POST /api/webhooks/coinpay — verify the signed CoinPay webhook and acknowledge.
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
  const data = payload.data as Record<string, unknown> | undefined;
  const paymentId = (data?.payment_id ?? payload.payment_id ?? null) as string | null;
  const complete = payload.type === "payment.confirmed" || payload.type === "payment.forwarded";

  console.log("[coinpay] webhook received", {
    type: payload.type ?? null,
    payment_id: paymentId,
    complete
  });

  return json({ received: true, complete, payment_id: paymentId });
}
