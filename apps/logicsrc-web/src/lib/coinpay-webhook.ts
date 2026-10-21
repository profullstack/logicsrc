// CoinPay webhook reading + Hire Us settlement.
//
// CoinPay signs and sends a NESTED body (coinpayportal src/lib/webhooks/service.ts):
//   { id: "evt_<paymentId>_<ts>", type: "payment.confirmed",
//     data: { payment_id, status, amount, amount_usd, metadata: {...} },
//     created_at, business_id }
// The top-level `id` is the EVENT id, not the payment id. Read `data` first and
// fall back to the flat shape only for the legacy test sender.

export interface CoinPayWebhookEvent {
  eventId: string | null;
  type: string | null;
  paymentId: string | null;
  status: string;
  amountUsd: number | null;
  metadata: Record<string, unknown>;
}

// `forwarded` counts: CoinPay retries a failed payment.forwarded delivery, while
// a failed payment.confirmed stops retrying after a few minutes.
const SETTLED_STATUSES = new Set(["confirmed", "forwarded", "completed", "paid"]);
const SETTLED_TYPES = new Set(["payment.confirmed", "payment.forwarded"]);

export const HIRE_US_PRODUCT = "logicsrc-hire-us";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function readCoinPayWebhook(payload: Record<string, unknown>): CoinPayWebhookEvent {
  const nested = asRecord(payload.data);
  const d = nested ?? payload;
  const paymentId = asString(d.payment_id) ?? (nested ? asString(nested.id) : asString(payload.payment_id));
  const type = asString(payload.type) ?? asString(payload.event);
  let status = (asString(d.status) ?? "").toLowerCase();
  if (!status && type && SETTLED_TYPES.has(type)) status = type.slice("payment.".length);
  return {
    eventId: nested ? asString(payload.id) : null,
    type,
    paymentId,
    status,
    amountUsd: asNumber(d.amount_usd) ?? asNumber(d.amount),
    metadata: asRecord(d.metadata) ?? asRecord(payload.metadata) ?? {}
  };
}

export function isSettled(event: CoinPayWebhookEvent): boolean {
  return SETTLED_STATUSES.has(event.status);
}

export interface HireUsPaymentRow {
  payment_id: string;
  event_id: string | null;
  event_type: string | null;
  status: string;
  amount_usd: number | null;
  hours: number | null;
  rate_usd_per_hour: number | null;
  account_id: string | null;
  buyer_email: string | null;
  property: string | null;
  metadata: Record<string, unknown>;
}

export interface HireUsPaymentStore {
  /** Insert once; resolve true if this call created the row, false if it already existed. */
  insertIfAbsent(row: HireUsPaymentRow): Promise<boolean>;
}

export type SettleResult =
  | { handled: true; settled: true; duplicate: boolean; payment_id: string; account_id: string | null; email: string | null }
  | { handled: true; settled: false; reason: string; payment_id: string | null };

export async function settleHireUsWebhook(
  payload: Record<string, unknown>,
  store: HireUsPaymentStore
): Promise<SettleResult> {
  const event = readCoinPayWebhook(payload);
  if (!event.paymentId) return { handled: true, settled: false, reason: "no payment id", payment_id: null };
  if (!isSettled(event)) {
    return { handled: true, settled: false, reason: `status ${event.status || "unknown"}`, payment_id: event.paymentId };
  }
  const meta = event.metadata;
  if (meta.product !== HIRE_US_PRODUCT) {
    // Not a Hire Us checkout (or an unknown/test payment): acknowledge, do nothing.
    return { handled: true, settled: false, reason: "unknown payment", payment_id: event.paymentId };
  }

  const accountId = asString(meta.account_id);
  const email = asString(meta.email) ?? asString(meta.buyer_email);
  const inserted = await store.insertIfAbsent({
    payment_id: event.paymentId,
    event_id: event.eventId,
    event_type: event.type,
    status: event.status,
    amount_usd: event.amountUsd,
    hours: asNumber(meta.hours),
    rate_usd_per_hour: asNumber(meta.rate_usd_per_hour),
    account_id: accountId,
    buyer_email: email,
    property: asString(meta.property),
    metadata: meta
  });
  return { handled: true, settled: true, duplicate: !inserted, payment_id: event.paymentId, account_id: accountId, email };
}
