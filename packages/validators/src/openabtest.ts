import type { ErrorObject } from "ajv";

type AccountingEvent =
  | { kind: "conversion"; at: string; payload: { price: { listUnitPriceMinor: number; discountBps: number; quantityMilliUnits: number; chargedUnitPriceMinor: number; totalMinor: number; acceptedAt: string } } }
  | { kind: "adjustment"; payload: { reason: string; amountMinor: number } }
  | { kind: "reconciliation"; payload: { revenueMinor: number; refundsMinor: number; actualCostMinor: number | null; feesMinor: number | null; affiliateMinor: number | null; retainedProfitMinor: number | null; minimumRetainedProfitMinor: number; state: string; payoutStatus: string; proofRefs: string[] } };

// These checks run only after structural validation. Cross-event authorization,
// assignment lookup and idempotency still require the issuer's private ledger.
export function validateOpenABTest(kind: string, data: unknown): ErrorObject[] {
  const errors: ErrorObject[] = [];
  function report(path: string, message: string) {
    errors.push({ keyword: "openabtest", instancePath: path, schemaPath: "#/openabtest-semantics", params: {}, message });
  }
  if (kind === "openabtest-manifest") {
    const manifest = data as {
      variants: Array<{ id: string; weight: number; parameters: Record<string, unknown> }>;
      window: { startsAt: string; endsAt: string };
    };
    const seen = new Set<string>();
    let total = 0n;
    manifest.variants.forEach((variant, index) => {
      if (seen.has(variant.id)) report(`/variants/${index}/id`, "must be unique within the manifest");
      seen.add(variant.id);
      total += BigInt(variant.weight);
      const discount = variant.parameters.discountBps;
      if (discount !== undefined && (typeof discount !== "number" || !Number.isInteger(discount) || discount < 0 || discount > 10000)) {
        report(`/variants/${index}/parameters/discountBps`, "must be an integer from 0 to 10000");
      }
    });
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) report("/variants", "total weight must be a safe integer");
    if (Date.parse(manifest.window.endsAt) <= Date.parse(manifest.window.startsAt)) {
      report("/window/endsAt", "must be later than startsAt");
    }
  } else {
    const event = data as AccountingEvent;
    if (event.kind === "conversion") {
      const price = event.payload.price;
      const unit = (BigInt(price.listUnitPriceMinor) * BigInt(10000 - price.discountBps) + 5000n) / 10000n;
      const total = (unit * BigInt(price.quantityMilliUnits) + 500n) / 1000n;
      if (BigInt(price.chargedUnitPriceMinor) !== unit) report("/payload/price/chargedUnitPriceMinor", "must equal the discounted list unit price rounded half up");
      if (BigInt(price.totalMinor) !== total) report("/payload/price/totalMinor", "must equal the charged unit price times quantity rounded half up");
      if (Date.parse(price.acceptedAt) > Date.parse(event.at)) report("/payload/price/acceptedAt", "cannot be after the conversion event");
    }
    if (event.kind === "adjustment" && (event.payload.reason === "refund" || event.payload.reason === "chargeback") && event.payload.amountMinor >= 0) {
      report("/payload/amountMinor", "refunds and chargebacks must reduce recognized revenue");
    }
    if (event.kind === "reconciliation") {
      const p = event.payload;
      if (p.refundsMinor > p.revenueMinor) report("/payload/refundsMinor", "cannot exceed revenue; other expenses belong in actual costs or fees");
      if (p.state === "pending") {
        if (p.payoutStatus !== "withheld" || p.affiliateMinor !== null || p.retainedProfitMinor !== null) {
          report("/payload", "pending reconciliation must withhold payout and leave affiliate and retained profit unknown");
        }
      } else if (p.actualCostMinor === null || p.feesMinor === null || p.affiliateMinor === null || p.retainedProfitMinor === null) {
        report("/payload", "reconciled accounting requires actual costs, fees, affiliate and retained profit");
      } else {
        const retained = BigInt(p.revenueMinor) - BigInt(p.refundsMinor) - BigInt(p.actualCostMinor) - BigInt(p.feesMinor) - BigInt(p.affiliateMinor);
        if (retained !== BigInt(p.retainedProfitMinor)) report("/payload/retainedProfitMinor", "must reconcile exactly to net revenue less actual costs, fees and affiliate allocation");
        if (p.proofRefs.length === 0) report("/payload/proofRefs", "reconciled accounting requires private evidence references");
        if (p.retainedProfitMinor < p.minimumRetainedProfitMinor && (p.affiliateMinor !== 0 || p.payoutStatus !== "withheld")) {
          report("/payload", "a profit-floor shortfall must withhold new payout and allocate zero new affiliate amount");
        }
      }
    }
  }
  return errors;
}
