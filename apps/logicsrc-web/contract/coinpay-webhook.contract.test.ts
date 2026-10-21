import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyCoinPayWebhook } from "@/lib/coinpay";
import { readCoinPayWebhook, settleHireUsWebhook, type HireUsPaymentRow } from "@/lib/coinpay-webhook";

const SECRET = "whsecret_logicsrcContractTestSecret";

// Same signing as coinpayportal signWebhookPayload: t=<unix>,v1=hmac(`${t}.${body}`).
function sign(rawBody: string, ts = Math.floor(Date.now() / 1000)) {
  return `t=${ts},v1=${createHmac("sha256", SECRET).update(`${ts}.${rawBody}`).digest("hex")}`;
}

const PAYMENT_ID = "d084f959-c33c-4540-82b8-221181347639";
function realShaped(status = "confirmed", type = "payment.confirmed") {
  return {
    id: `evt_${PAYMENT_ID}_1775551263`,
    type,
    data: {
      payment_id: PAYMENT_ID,
      status,
      amount: 4000,
      amount_crypto: "4000.000000",
      amount_usd: 4000,
      currency: "USDC_POL",
      metadata: {
        product: "logicsrc-hire-us",
        billing: "metered_hours",
        unit: "agent_hour",
        hours: 10,
        rate_usd_per_hour: 400,
        source: "logicsrc.com/hire-us",
        property: "logicsrc.com",
        account_id: "coinpay-user-123",
        email: "buyer@example.com"
      }
    },
    created_at: "2026-10-21T00:00:00.000Z",
    business_id: "biz_1"
  };
}

function memoryStore() {
  const rows = new Map<string, HireUsPaymentRow>();
  return {
    rows,
    async insertIfAbsent(row: HireUsPaymentRow) {
      if (rows.has(row.payment_id)) return false;
      rows.set(row.payment_id, row);
      return true;
    }
  };
}

describe("CoinPay webhook (logicsrc Hire Us)", () => {
  it("verifies the X-CoinPay-Signature t=,v1= scheme over the raw body", () => {
    const raw = JSON.stringify(realShaped());
    expect(verifyCoinPayWebhook(raw, sign(raw), SECRET)).toBe(true);
    expect(verifyCoinPayWebhook(raw + " ", sign(raw), SECRET)).toBe(false);
    expect(verifyCoinPayWebhook(raw, sign(raw, Math.floor(Date.now() / 1000) - 600), SECRET)).toBe(false);
    expect(verifyCoinPayWebhook(raw, createHmac("sha256", SECRET).update(raw).digest("hex"), SECRET)).toBe(false);
  });

  it("reads the payment id from data, not the top-level event id", () => {
    const e = readCoinPayWebhook(realShaped());
    expect(e.paymentId).toBe(PAYMENT_ID);
    expect(e.eventId).toMatch(/^evt_/);
    expect(e.metadata.account_id).toBe("coinpay-user-123");
  });

  it("settles a paid Hire Us payment once, mapped to the account", async () => {
    const store = memoryStore();
    const payload = JSON.parse(JSON.stringify(realShaped()));
    const first = await settleHireUsWebhook(payload, store);
    expect(first).toMatchObject({ settled: true, duplicate: false, payment_id: PAYMENT_ID, account_id: "coinpay-user-123" });
    const row = store.rows.get(PAYMENT_ID)!;
    expect(row).toMatchObject({ amount_usd: 4000, hours: 10, buyer_email: "buyer@example.com", property: "logicsrc.com" });

    const again = await settleHireUsWebhook(realShaped("forwarded", "payment.forwarded"), store);
    expect(again).toMatchObject({ settled: true, duplicate: true });
    expect(store.rows.size).toBe(1);
  });

  it("acknowledges pending and unknown payments without recording", async () => {
    const store = memoryStore();
    expect(await settleHireUsWebhook(realShaped("pending", "payment.pending"), store)).toMatchObject({ settled: false });
    const foreign = realShaped();
    foreign.data.metadata = {} as typeof foreign.data.metadata;
    expect(await settleHireUsWebhook(foreign, store)).toMatchObject({ settled: false, reason: "unknown payment" });
    expect(store.rows.size).toBe(0);
  });
});
