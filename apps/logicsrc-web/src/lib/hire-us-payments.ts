import { serviceClient } from "@/lib/supabase";
import type { HireUsPaymentRow, HireUsPaymentStore } from "@/lib/coinpay-webhook";

// Supabase-backed store for settled Hire Us payments (table hire_us_payments,
// payment_id primary key). ignoreDuplicates makes a redelivery a no-op. A paid
// checkout session is also marked on hire_us_checkouts.
export function supabaseHireUsPaymentStore(): HireUsPaymentStore {
  return {
    async insertIfAbsent(row: HireUsPaymentRow) {
      const { data, error } = await serviceClient()
        .from("hire_us_payments")
        .upsert(row, { onConflict: "payment_id", ignoreDuplicates: true })
        .select("payment_id");
      if (error) throw new Error(`hire_us_payments insert failed: ${error.message}`);
      return Array.isArray(data) && data.length > 0;
    },
    async markCheckoutPaid(sessionId: string, paymentId: string) {
      const { error } = await serviceClient()
        .from("hire_us_checkouts")
        .update({ status: "paid", payment_id: paymentId, paid_at: new Date().toISOString() })
        .eq("session_id", sessionId)
        .eq("status", "open");
      if (error) throw new Error(`hire_us_checkouts update failed: ${error.message}`);
    }
  };
}

export interface HireUsCheckoutRow {
  session_id: string;
  account_id: string;
  buyer_email: string;
  hours: number;
  rate_usd_per_hour: number;
  amount_usd: number;
}

export interface HireUsCheckoutStore {
  recordOpen(row: HireUsCheckoutRow): Promise<void>;
}

export function supabaseHireUsCheckoutStore(): HireUsCheckoutStore {
  return {
    async recordOpen(row: HireUsCheckoutRow) {
      const { error } = await serviceClient().from("hire_us_checkouts").insert(row);
      if (error) throw new Error(`hire_us_checkouts insert failed: ${error.message}`);
    }
  };
}

let checkoutStoreOverride: HireUsCheckoutStore | null = null;

/** The checkout store routes use; tests swap in a memory store. */
export function hireUsCheckoutStore(): HireUsCheckoutStore {
  return checkoutStoreOverride ?? supabaseHireUsCheckoutStore();
}

export function setHireUsCheckoutStore(store: HireUsCheckoutStore | null): void {
  checkoutStoreOverride = store;
}
