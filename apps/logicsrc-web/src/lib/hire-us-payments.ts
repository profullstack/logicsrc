import { serviceClient } from "@/lib/supabase";
import type { HireUsPaymentRow, HireUsPaymentStore } from "@/lib/coinpay-webhook";

// Supabase-backed store for settled Hire Us payments (table hire_us_payments,
// payment_id primary key). ignoreDuplicates makes a redelivery a no-op.
export function supabaseHireUsPaymentStore(): HireUsPaymentStore {
  return {
    async insertIfAbsent(row: HireUsPaymentRow) {
      const { data, error } = await serviceClient()
        .from("hire_us_payments")
        .upsert(row, { onConflict: "payment_id", ignoreDuplicates: true })
        .select("payment_id");
      if (error) throw new Error(`hire_us_payments insert failed: ${error.message}`);
      return Array.isArray(data) && data.length > 0;
    }
  };
}
