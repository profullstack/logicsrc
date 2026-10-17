/** Draft private contracts; constructors do not assign users, authorize events or pay money. */
export type OpenABTestVersion = "0.1-draft" | "0.2-draft";
export interface OpenABTestManifest {
  openabtest: OpenABTestVersion;
  id: string;
  revision: number;
  name: string;
  state: "draft" | "running" | "paused" | "closed";
  cohort: { id: string; eligibilityRule: string; purchaseScope: "all-referred-purchases" | "all-eligible-purchases" | "first-eligible-purchase" | "custom" };
  assignment: { unit: "user" | "account" | "session" | "device" | "custom"; authority: "server"; keyVersion: string; algorithm: string; persistence: "sticky" };
  variants: Array<{ id: string; weight: number; parameters: Record<string, string | number | boolean | null> }>;
  window: { startsAt: string; endsAt: string };
  metrics: {
    primary: "conversion-rate" | "retained-profit-per-eligible-visitor";
    denominator: "unique-eligible-participants";
    /** 0.2: unique-participants-with-goal counts participants who reached metrics.goal. */
    conversion: "unique-participants-with-confirmed-purchase" | "unique-participants-with-goal";
    profit: "reconciled-net-retained-profit" | "none";
    goal?: string;
    minimumEligiblePerVariant: number;
    minimumObservationSeconds: number;
    winnerPolicy: "manual-review";
  };
  guardrails: { preserveAcceptedOffers: true; preserveAccruedCommissions: true; requireReconciledCostsForPayout: true; onBreach: "pause-new-assignments" };
  economics?: { currency: string; minorUnitExponent: number; unit: string; listUnitPriceMinor: number; modeledUnitCostMinor: number | null; minimumRetainedUnitProfitMinor: number };
}

export interface OpenABTestPrice {
  offerId: string;
  acceptedAt: string;
  currency: string;
  listUnitPriceMinor: number;
  chargedUnitPriceMinor: number;
  discountBps: number;
  quantityMilliUnits: number;
  rounding: "half-up";
  totalMinor: number;
}

type Assigned = { assignmentId: string; variantId: string };
type Converted = Assigned & { conversionId: string };
export interface OpenABTestReconciliation extends Converted {
  accountingRevision: number;
  currency: string;
  state: "pending" | "reconciled";
  revenueMinor: number;
  refundsMinor: number;
  actualCostMinor: number | null;
  feesMinor: number | null;
  affiliateMinor: number | null;
  retainedProfitMinor: number | null;
  minimumRetainedProfitMinor: number;
  payoutStatus: "withheld" | "eligible";
  proofRefs: string[];
}

type EventDetail =
  | { kind: "eligibility"; payload: { cohortId: string; eligible: true } }
  | { kind: "assignment"; payload: Assigned & { cohortId: string } }
  | { kind: "exposure"; payload: Assigned & { offerId: string; surface: string } }
  | { kind: "conversion"; payload: Converted & ({ price: OpenABTestPrice; goal?: never } | { goal: string; price?: never; value?: { currency: string; amountMinor: number } }) }
  | { kind: "adjustment"; payload: Converted & { adjustmentId: string; currency: string; amountMinor: number; reason: "refund" | "chargeback" | "correction"; proofRefs: string[] } }
  | { kind: "reconciliation"; payload: OpenABTestReconciliation };

export type OpenABTestEvent = {
  openabtest: OpenABTestVersion;
  id: string;
  producerId: string;
  manifestId: string;
  manifestRevision: number;
  participantId: string;
  at: string;
} & EventDetail;

/** Validate with @logicsrc/validators before storing or using the document. */
export function createOpenABTestManifest(input: Omit<OpenABTestManifest, "openabtest">): OpenABTestManifest {
  const goal = input.metrics.conversion === "unique-participants-with-goal" || input.metrics.profit === "none";
  return { ...input, openabtest: goal ? "0.2-draft" : "0.1-draft" };
}

type EventInput = Omit<OpenABTestEvent, "openabtest" | "kind" | "payload"> & EventDetail;
/** The caller supplies authenticated context and durable IDs; this helper creates neither. */
export function createOpenABTestEvent(input: EventInput): OpenABTestEvent {
  const goal = input.kind === "conversion" && "goal" in input.payload && input.payload.goal !== undefined;
  return { ...input, openabtest: goal ? "0.2-draft" : "0.1-draft" } as OpenABTestEvent;
}
