import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validate } from "./index.js";

function fixture(name: string) {
  return JSON.parse(readFileSync(new URL(`../../schemas/fixtures/openabtest/${name}.json`, import.meta.url), "utf8"));
}

describe("OpenABTest draft contracts", () => {
  it("accepts the every-referred-purchase experiment", () => {
    expect(validate("openabtest-manifest", fixture("chovy-manifest")).ok).toBe(true);
  });
  it.each(["eligibility", "assignment", "exposure", "conversion", "adjustment", "reconciliation-pending", "reconciliation"])("accepts %s independently", (name) => {
    expect(validate("openabtest-event", fixture(name)).ok).toBe(true);
  });
  it("rejects duplicate variant identities even when weights differ", () => {
    const manifest = fixture("chovy-manifest");
    manifest.variants[1].id = manifest.variants[0].id;
    manifest.variants[1].weight = 2;
    expect(validate("openabtest-manifest", manifest).ok).toBe(false);
  });
  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid weight %s", (weight) => {
    const manifest = fixture("chovy-manifest");
    manifest.variants[0].weight = weight;
    expect(validate("openabtest-manifest", manifest).ok).toBe(false);
  });
  it("rejects unsafe sums and backwards windows", () => {
    const manifest = fixture("chovy-manifest");
    manifest.variants[0].weight = Number.MAX_SAFE_INTEGER;
    expect(validate("openabtest-manifest", manifest).ok).toBe(false);
    manifest.variants[0].weight = 1;
    manifest.window.endsAt = manifest.window.startsAt;
    expect(validate("openabtest-manifest", manifest).ok).toBe(false);
  });
  it("rejects client pricing authority and malformed discounts", () => {
    const manifest = fixture("chovy-manifest");
    manifest.assignment.authority = "client";
    expect(validate("openabtest-manifest", manifest).ok).toBe(false);
    manifest.assignment.authority = "server";
    manifest.variants[0].parameters.discountBps = "500";
    expect(validate("openabtest-manifest", manifest).ok).toBe(false);
  });
  it.each(["assignment", "exposure", "conversion"])("requires assignment attribution on %s", (name) => {
    const event = fixture(name);
    delete event.payload.assignmentId;
    expect(validate("openabtest-event", event).ok).toBe(false);
  });
  it("rejects unrecognized event payloads and identifiable participant values", () => {
    const event = fixture("exposure");
    event.payload.email = "person@example.com";
    expect(validate("openabtest-event", event).ok).toBe(false);
    delete event.payload.email;
    event.participantId = "person@example.com";
    expect(validate("openabtest-event", event).ok).toBe(false);
  });
  it("checks the accepted discount and half-up usage arithmetic", () => {
    const event = fixture("conversion");
    event.payload.price.chargedUnitPriceMinor = 38000;
    expect(validate("openabtest-event", event).ok).toBe(false);
    Object.assign(event.payload.price, { listUnitPriceMinor: 101, chargedUnitPriceMinor: 91, quantityMilliUnits: 500, totalMinor: 46 });
    expect(validate("openabtest-event", event).ok).toBe(true);
    event.payload.price.totalMinor = 45;
    expect(validate("openabtest-event", event).ok).toBe(false);
  });
  it("rejects a conversion dated before the accepted offer", () => {
    const event = fixture("conversion");
    event.at = "2026-09-14T00:00:00Z";
    expect(validate("openabtest-event", event).ok).toBe(false);
  });
  it("requires a revenue reduction and evidence for refunds", () => {
    const event = fixture("adjustment");
    event.payload.amountMinor = 3600;
    expect(validate("openabtest-event", event).ok).toBe(false);
    event.payload.amountMinor = -3600;
    event.payload.proofRefs = [];
    expect(validate("openabtest-event", event).ok).toBe(false);
  });
  it("withholds payouts when actual costs or fees are missing", () => {
    const event = fixture("reconciliation");
    event.payload.actualCostMinor = null;
    expect(validate("openabtest-event", event).ok).toBe(false);
    event.payload.state = "pending";
    expect(validate("openabtest-event", event).ok).toBe(false);
    Object.assign(event.payload, { affiliateMinor: null, retainedProfitMinor: null, payoutStatus: "withheld" });
    expect(validate("openabtest-event", event).ok).toBe(true);
  });
  it("rejects inconsistent accounting and unsupported profit claims", () => {
    const event = fixture("reconciliation");
    event.payload.affiliateMinor = 21000;
    expect(validate("openabtest-event", event).ok).toBe(false);
    event.payload.retainedProfitMinor = 4000;
    expect(validate("openabtest-event", event).ok).toBe(false);
    Object.assign(event.payload, { affiliateMinor: 0, actualCostMinor: 36000, retainedProfitMinor: -1000, payoutStatus: "withheld" });
    expect(validate("openabtest-event", event).ok).toBe(true);
  });
  it("requires reconciliation evidence without bearer URLs", () => {
    const event = fixture("reconciliation");
    event.payload.proofRefs = [];
    expect(validate("openabtest-event", event).ok).toBe(false);
    event.payload.proofRefs = ["https://example.com/receipt?token=secret"];
    expect(validate("openabtest-event", event).ok).toBe(false);
  });
});
