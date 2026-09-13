export type OpenRentalJsonValue =
  | null | boolean | number | string
  | OpenRentalJsonValue[] | { [key: string]: OpenRentalJsonValue };

/** OpenAgent binds to a logicsrc.agent DID; OpenSwarm binds to a file key. */
export type OpenRentalMemberReference =
  | { kind: "openagent"; id: string }
  | { kind: "openswarm"; id: `ed25519:${string}` };

export type OpenRentalMember = OpenRentalMemberReference & {
  /** HTTPS URL of the agent profile or the signed ipfile manifest. */
  url: string;
  name?: string;
  role?: string;
  metadata?: Record<string, OpenRentalJsonValue>;
};

export type OpenRentalRentalScope =
  | { kind: "listing" }
  | { kind: "members"; members: OpenRentalMemberReference[] };

export interface OpenRentalRental {
  id: string;
  name?: string;
  scope: OpenRentalRentalScope;
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
  metadata?: Record<string, OpenRentalJsonValue>;
}

export interface OpenRental {
  type: "logicsrc.openrental";
  version: "0.1";
  /** Stable HTTPS listing identifier, unique at its publisher's origin. */
  id: string;
  name: string;
  owner_did: string;
  description?: string;
  updated_at?: string;
  availability?: "available" | "busy" | "offline" | "unknown";
  tags?: string[];
  capabilities?: string[];
  metadata?: Record<string, OpenRentalJsonValue>;
  members: OpenRentalMember[];
  rentals?: OpenRentalRental[];
}

/**
 * Construct a descriptor without fetching members or initiating payments.
 * Use validate("openrental", document) from @logicsrc/validators before use:
 * TypeScript alone cannot check DID/key formats or rental references.
 */
export function createOpenRental(input: Omit<OpenRental, "type" | "version">): OpenRental {
  return { ...input, type: "logicsrc.openrental", version: "0.1" };
}
