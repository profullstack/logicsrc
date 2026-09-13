import { describe, expect, it } from "vitest";
import { createOpenRental, type OpenRentalMember } from "./index.js";

const members: OpenRentalMember[] = [
  { kind: "openagent", id: "analyst.coinpay", url: "https://example.com/agent.json" },
  { kind: "openswarm", id: `ed25519:${"a".repeat(64)}`, url: "https://example.com/manifest.json" }
];

describe("createOpenRental", () => {
  it.each([members.slice(0, 1), members.slice(1), members])("constructs single-kind and mixed listings", (...fleetMembers) => {
    const listing = createOpenRental({
      id: "https://example.com/listings/research", name: "Research", owner_did: "operator.coinpay",
      members: fleetMembers
    });
    expect(listing.type).toBe("logicsrc.openrental");
    expect(listing.version).toBe("0.1");
    expect(listing.members).toEqual(fleetMembers);
    expect(listing.rentals).toBeUndefined();
  });

  it("keeps rental amounts as decimal strings and preserves metadata", () => {
    const input: Parameters<typeof createOpenRental>[0] = {
      id: "https://example.com/listings/research", name: "Research", owner_did: "operator.coinpay", members,
      metadata: { support: { languages: ["en", "fr"] } },
      rentals: [{
        id: "hourly", scope: { kind: "listing" },
        rate: { amount: "9007199254740993.123456", currency: "USD", unit: "hour" },
        payment: { provider: "coinpay", payee_did: "operator.coinpay", checkout_url: "https://example.com/rent" }
      }]
    };
    const snapshot = structuredClone(input);
    expect(createOpenRental(input)).toEqual({ ...input, type: "logicsrc.openrental", version: "0.1" });
    expect(input).toEqual(snapshot);
  });
});
