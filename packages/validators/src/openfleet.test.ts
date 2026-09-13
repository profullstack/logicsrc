import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertSchemaKind, createValidator, schemas, validate } from "./index.js";

function fixture() {
  return JSON.parse(readFileSync(new URL("../../schemas/fixtures/openfleet/mixed.json", import.meta.url), "utf8"));
}

function errorAt(data: unknown, keyword: string, path: string) {
  const result = validate("openfleet", data);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ keyword, instancePath: path }));
}

describe("OpenFleet", () => {
  it("registers a publicly exported schema and validates the mixed fixture", () => {
    expect(assertSchemaKind("openfleet")).toBe("openfleet");
    expect(validate("openfleet", fixture()).ok).toBe(true);
    const ajv = createValidator();
    ajv.addSchema(schemas.agent);
    expect(ajv.compile(schemas.openfleet)(fixture())).toBe(true);
  });

  it("validates the complete descriptor in the public specification", () => {
    const doc = readFileSync(new URL("../../../docs/openfleet.md", import.meta.url), "utf8");
    const example = doc.match(/```json\n([\s\S]*?)\n```/);
    expect(example).not.toBeNull();
    expect(validate("openfleet", JSON.parse(example![1])).ok).toBe(true);
  });

  it.each(["openagent", "openswarm"])("accepts a fleet containing only %s members", (kind) => {
    const fleet = fixture();
    fleet.members = fleet.members.filter((member: { kind: string }) => member.kind === kind);
    // A whole-fleet rate applies to either single-kind fleet without expansion.
    fleet.rentals = [fleet.rentals[0]];
    expect(validate("openfleet", fleet).ok).toBe(true);
  });

  it("accepts membership without rental offers and preserves extension metadata", () => {
    const fleet = fixture();
    delete fleet.rentals;
    fleet.metadata = { custom: { nested: [null, true, 42, "value"] } };
    const snapshot = structuredClone(fleet);
    expect(validate("openfleet", fleet).ok).toBe(true);
    expect(fleet).toEqual(snapshot);
  });

  it.each([
    ["no members", (f: ReturnType<typeof fixture>) => { f.members = []; }],
    ["unsupported kind", (f: ReturnType<typeof fixture>) => { f.members[0].kind = "openfleet"; }],
    ["agent without identity", (f: ReturnType<typeof fixture>) => { delete f.members[0].id; }],
    ["swarm without identity", (f: ReturnType<typeof fixture>) => { delete f.members[1].id; }],
    ["swarm with an agent DID", (f: ReturnType<typeof fixture>) => { f.members[1].id = "analyst.coinpay"; }],
    ["agent with a swarm key", (f: ReturnType<typeof fixture>) => { f.members[0].id = f.members[1].id; }],
    ["short swarm key", (f: ReturnType<typeof fixture>) => { f.members[1].id = "ed25519:abcd"; }],
    ["non-HTTPS member URL", (f: ReturnType<typeof fixture>) => { f.members[0].url = "http://example.com/agent"; }],
    ["unsupported version", (f: ReturnType<typeof fixture>) => { f.version = "9.0"; }],
    ["unknown contract field", (f: ReturnType<typeof fixture>) => { f.rental = []; }]
  ])("rejects %s", (_, mutate) => {
    const fleet = fixture();
    mutate(fleet);
    expect(validate("openfleet", fleet).ok).toBe(false);
  });

  it("rejects duplicate member identities even when URL and metadata differ", () => {
    const fleet = fixture();
    fleet.members.push({ ...fleet.members[0], url: "https://elsewhere.example/agent", metadata: { alias: true } });
    errorAt(fleet, "uniqueMember", "/members/2");
  });

  it("rejects duplicate rental IDs", () => {
    const fleet = fixture();
    fleet.rentals[1].id = fleet.rentals[0].id;
    errorAt(fleet, "uniqueRental", "/rentals/1/id");
  });

  it("rejects dangling references after a member is removed", () => {
    const fleet = fixture();
    fleet.members.shift();
    errorAt(fleet, "memberReference", "/rentals/1/scope/members/0");
  });

  it("accepts a rental scoped to both kinds without counting a member twice", () => {
    const fleet = fixture();
    fleet.rentals[1].scope.members.push({ kind: "openswarm", id: fleet.members[1].id });
    expect(validate("openfleet", fleet).ok).toBe(true);
    fleet.rentals[1].scope.members.push({ ...fleet.rentals[1].scope.members[0] });
    errorAt(fleet, "uniqueMember", "/rentals/1/scope/members/2");
  });

  it.each([25, -1, "-1.000000", "01.000000", "1e3", "NaN", "Infinity", "1.00", "0.0000001"])(
    "rejects an inexact or invalid amount %s", (amount) => {
      const fleet = fixture();
      fleet.rentals[0].rate.amount = amount;
      expect(validate("openfleet", fleet).ok).toBe(false);
    }
  );

  it.each(["0.000000", "0.000001", "9007199254740993.123456"])("preserves exact amount %s", (amount) => {
    const fleet = fixture();
    fleet.rentals[0].rate.amount = amount;
    expect(validate("openfleet", fleet).ok).toBe(true);
    expect(fleet.rentals[0].rate.amount).toBe(amount);
  });

  it.each([
    ["non-CoinPay provider", (r: ReturnType<typeof fixture>) => { r.payment.provider = "other"; }],
    ["missing CoinPay metadata", (r: ReturnType<typeof fixture>) => { delete r.payment; }],
    ["missing payee", (r: ReturnType<typeof fixture>) => { delete r.payment.payee_did; }],
    ["missing checkout", (r: ReturnType<typeof fixture>) => { delete r.payment.checkout_url; }],
    ["insecure checkout", (r: ReturnType<typeof fixture>) => { r.payment.checkout_url = "http://example.com/checkout"; }],
    ["unsupported currency", (r: ReturnType<typeof fixture>) => { r.rate.currency = "EUR"; }],
    ["missing unit", (r: ReturnType<typeof fixture>) => { delete r.rate.unit; }],
    ["unsupported unit", (r: ReturnType<typeof fixture>) => { r.rate.unit = "second"; }],
    ["fractional billing units", (r: ReturnType<typeof fixture>) => { r.minimum_units = 0.5; }],
    ["unsafe integer units", (r: ReturnType<typeof fixture>) => { r.maximum_units = 9007199254740992; }],
    ["empty member scope", (r: ReturnType<typeof fixture>) => { r.scope = { kind: "members", members: [] }; }],
    ["ambiguous fleet scope", (r: ReturnType<typeof fixture>) => { r.scope.members = []; }]
  ])("rejects a rental with %s", (_, mutate) => {
    const fleet = fixture();
    mutate(fleet.rentals[0]);
    expect(validate("openfleet", fleet).ok).toBe(false);
  });

  it("rejects maximum units below the minimum", () => {
    const fleet = fixture();
    fleet.rentals[0].minimum_units = 25;
    errorAt(fleet, "rentalUnits", "/rentals/0/maximum_units");
  });

  it("checks offer windows by instant, including timezone offsets", () => {
    const fleet = fixture();
    fleet.rentals[0].valid_from = "2026-09-13T12:00:00Z";
    fleet.rentals[0].valid_until = "2026-09-13T14:00:00+02:00";
    errorAt(fleet, "rentalPeriod", "/rentals/0/valid_until");
    fleet.rentals[0].valid_until = "2026-09-13T13:00:00+02:00";
    errorAt(fleet, "rentalPeriod", "/rentals/0/valid_until");
    fleet.rentals[0].valid_until = "2026-09-13T15:00:00+02:00";
    expect(validate("openfleet", fleet).ok).toBe(true);
  });
});
