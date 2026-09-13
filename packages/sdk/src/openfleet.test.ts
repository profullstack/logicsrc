import { describe, expect, it } from "vitest";
import { createOpenFleet, type OpenFleetMember } from "./index.js";

const members: OpenFleetMember[] = [
  { kind: "openagent", id: "analyst.coinpay", url: "https://example.com/agent.json" },
  { kind: "openswarm", id: `ed25519:${"a".repeat(64)}`, url: "https://example.com/manifest.json" }
];

describe("createOpenFleet", () => {
  it.each([members.slice(0, 1), members.slice(1), members])("constructs single-kind and mixed fleets", (...fleetMembers) => {
    const fleet = createOpenFleet({
      id: "https://example.com/fleets/research", name: "Research", owner_did: "operator.coinpay",
      members: fleetMembers
    });
    expect(fleet.type).toBe("logicsrc.openfleet");
    expect(fleet.version).toBe("0.1");
    expect(fleet.members).toEqual(fleetMembers);
    expect(fleet.rentals).toBeUndefined();
  });

  it("keeps rental amounts as decimal strings and preserves metadata", () => {
    const input: Parameters<typeof createOpenFleet>[0] = {
      id: "https://example.com/fleets/research", name: "Research", owner_did: "operator.coinpay", members,
      metadata: { support: { languages: ["en", "fr"] } },
      rentals: [{
        id: "hourly", scope: { kind: "fleet" },
        rate: { amount: "9007199254740993.123456", currency: "USD", unit: "hour" },
        payment: { provider: "coinpay", payee_did: "operator.coinpay", checkout_url: "https://example.com/rent" }
      }]
    };
    const snapshot = structuredClone(input);
    expect(createOpenFleet(input)).toEqual({ ...input, type: "logicsrc.openfleet", version: "0.1" });
    expect(input).toEqual(snapshot);
  });
});
