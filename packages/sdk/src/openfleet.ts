export type OpenFleetJsonValue =
  | null | boolean | number | string
  | OpenFleetJsonValue[] | { [key: string]: OpenFleetJsonValue };

/** OpenAgent binds to a logicsrc.agent DID; OpenSwarm binds to a file key. */
export type OpenFleetMemberReference =
  | { kind: "openagent"; id: string }
  | { kind: "openswarm"; id: `ed25519:${string}` };

export type OpenFleetMember = OpenFleetMemberReference & {
  /** HTTPS URL of the agent profile or the signed ipfile manifest. */
  url: string;
  name?: string;
  role?: string;
  metadata?: Record<string, OpenFleetJsonValue>;
};

export type OpenFleetRentalScope =
  | { kind: "fleet" }
  | { kind: "members"; members: OpenFleetMemberReference[] };

export interface OpenFleetRental {
  id: string;
  name?: string;
  scope: OpenFleetRentalScope;
  rate: {
    /** Exact non-negative USD decimal string, with six fractional digits. */
    amount: string;
    currency: "USD";
    /** Whole billing units; a month is 30 days, a task an agreed deliverable. */
    unit: "hour" | "day" | "month" | "task";
  };
  minimum_units?: number;
  maximum_units?: number;
  valid_from?: string;
  valid_until?: string;
  terms_url?: string;
  payment: {
    provider: "coinpay";
    payee_did: string;
    /** Merchant-published HTTPS checkout entry point; no fixed CoinPay API. */
    checkout_url: string;
  };
  metadata?: Record<string, OpenFleetJsonValue>;
}

export interface OpenFleet {
  type: "logicsrc.openfleet";
  version: "0.1";
  /** Stable HTTPS fleet identifier, unique at its publisher's origin. */
  id: string;
  name: string;
  owner_did: string;
  description?: string;
  updated_at?: string;
  availability?: "available" | "busy" | "offline" | "unknown";
  tags?: string[];
  capabilities?: string[];
  metadata?: Record<string, OpenFleetJsonValue>;
  members: OpenFleetMember[];
  rentals?: OpenFleetRental[];
}

/**
 * Construct a descriptor without fetching members or initiating payments.
 * Use validate("openfleet", document) from @logicsrc/validators before use:
 * TypeScript alone cannot check DID/key formats or rental references.
 */
export function createOpenFleet(input: Omit<OpenFleet, "type" | "version">): OpenFleet {
  return { ...input, type: "logicsrc.openfleet", version: "0.1" };
}
