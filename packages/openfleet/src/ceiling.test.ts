import { describe, expect, it } from "vitest";
import {
  checkCeiling,
  describeRefusal,
  effectiveCeiling,
  fleetCeiling,
  formatSpend,
  isImplicitFleet,
  isNarrower,
  mergeCeiling,
  parseBudget,
  parseUntil,
  rootApprovals,
  sumSpend,
  swarmChain,
} from "./ceiling.js";
import type { LedgerLine } from "./types.js";

const line = (partial: Partial<LedgerLine> & { event: string }): LedgerLine => ({ at: "2026-09-13T05:00:00Z", fleet: "f", host: "dev", by: "sysop", ...partial });

describe("narrower", () => {
  it("approvals: native under bypass, never bypass under native or under nothing", () => {
    expect(isNarrower("approvals", "native", "bypass")).toBe(true);
    expect(isNarrower("approvals", "bypass", "bypass")).toBe(true);
    expect(isNarrower("approvals", "native", "native")).toBe(true);
    expect(isNarrower("approvals", "native", undefined)).toBe(true);
    expect(isNarrower("approvals", "bypass", "native")).toBe(false);
    expect(isNarrower("approvals", "bypass", undefined)).toBe(false);
  });

  it("depth and fan_out: smaller or equal; depth absent means 1, fan_out absent means uncapped", () => {
    expect(isNarrower("depth", 1, 2)).toBe(true);
    expect(isNarrower("depth", 2, 2)).toBe(true);
    expect(isNarrower("depth", 3, 2)).toBe(false);
    expect(isNarrower("depth", 1, undefined)).toBe(true);
    expect(isNarrower("depth", 2, undefined)).toBe(false);
    expect(isNarrower("fan_out", 4, 8)).toBe(true);
    expect(isNarrower("fan_out", 9, 8)).toBe(false);
    expect(isNarrower("fan_out", 99, undefined)).toBe(true);
  });

  it("budget: smaller or equal in the same unit, never across units, uncapped when absent", () => {
    expect(isNarrower("budget", "10 USD", "20 USD")).toBe(true);
    expect(isNarrower("budget", "20 USD", "20 USD")).toBe(true);
    expect(isNarrower("budget", "30 USD", "20 USD")).toBe(false);
    expect(isNarrower("budget", "10 USD", "500000 tokens")).toBe(false);
    expect(isNarrower("budget", "10 USD", undefined)).toBe(true);
    expect(isNarrower("budget", "lots", "20 USD")).toBe(false);
  });

  it("hosts: a subset; until: earlier or equal", () => {
    expect(isNarrower("hosts", ["dev"], ["dev", "netcup"])).toBe(true);
    expect(isNarrower("hosts", ["dev", "netcup"], ["dev"])).toBe(false);
    expect(isNarrower("hosts", ["dev"], undefined)).toBe(true);
    expect(isNarrower("until", "2026-09-13T06:00:00Z", "2026-09-13T06:11:01Z")).toBe(true);
    expect(isNarrower("until", "2026-09-13T06:11:01Z", "2026-09-13T06:11:01Z")).toBe(true);
    expect(isNarrower("until", "2026-09-13T07:00:00Z", "2026-09-13T06:11:01Z")).toBe(false);
    expect(isNarrower("until", "2026-09-13T07:00:00Z", undefined)).toBe(true);
  });
});

describe("merge", () => {
  const base = { approvals: "bypass" as const, depth: 2, fan_out: 8, hosts: ["dev", "netcup"], budget: "20 USD", until: "2026-09-13T08:00:00Z" };

  it("takes every narrowed key and inherits the rest", () => {
    expect(mergeCeiling(base, { fan_out: 4, until: "2026-09-13T06:11:01Z" })).toEqual({ ...base, fan_out: 4, until: "2026-09-13T06:11:01Z" });
    expect(mergeCeiling(base, undefined)).toEqual(base);
  });

  it("never widens: a key a spawner tried to widen keeps the base value", () => {
    expect(mergeCeiling({ approvals: "native", depth: 1 }, { approvals: "bypass", depth: 3, fan_out: 2 })).toEqual({ approvals: "native", depth: 1, fan_out: 2 });
    expect(mergeCeiling(base, { hosts: ["dev", "netcup", "other"], budget: "500 USD" })).toEqual(base);
  });

  it("copies unknown keys through", () => {
    expect(mergeCeiling({ depth: 1 }, { scopes: ["fleet:read"] })).toEqual({ depth: 1, scopes: ["fleet:read"] });
  });
});

describe("the fleet's ceiling and the path down", () => {
  const implicit = { depth: 1, hosts: ["dev"] };

  it("is the implicit one with no lines, fleet.open once opened, and the latest fleet.cap for the fleet after that", () => {
    expect(fleetCeiling([], "f", implicit)).toEqual(implicit);
    expect(isImplicitFleet([], "f")).toBe(true);
    const opened = [line({ event: "fleet.open", fleet: "f", ceiling: { approvals: "bypass", depth: 2 } })];
    expect(fleetCeiling(opened, "f", implicit)).toEqual({ approvals: "bypass", depth: 2 });
    expect(isImplicitFleet(opened, "f")).toBe(false);
    const capped = [
      ...opened,
      line({ event: "fleet.cap", target: "f", ceiling: { approvals: "native", depth: 1 } }),
      line({ event: "fleet.cap", target: "some-swarm", ceiling: { depth: 0 } }),
      line({ event: "fleet.cap", target: "f", ceiling: { approvals: "bypass", depth: 3 } }),
    ];
    expect(fleetCeiling(capped, "f", implicit)).toEqual({ approvals: "bypass", depth: 3 });
  });

  it("follows parent_swarm to the top and merges spawn narrowings first, then swarm caps last", () => {
    const lines = [
      line({ event: "swarm.spawn", by: "root", swarm: "outer", ceiling: { fan_out: 4, until: "2026-09-13T07:00:00Z" } }),
      line({ event: "swarm.spawn", by: "outer-1", swarm: "inner", parent_swarm: "outer", ceiling: { fan_out: 2, depth: 9 } }),
      line({ event: "fleet.cap", target: "outer", ceiling: { until: "2026-09-13T06:00:00Z" } }),
    ];
    expect(swarmChain(lines, "inner")).toEqual(["outer", "inner"]);
    expect(swarmChain(lines, undefined)).toEqual([]);
    const base = { approvals: "bypass" as const, depth: 2, hosts: ["dev"] };
    expect(effectiveCeiling(base, lines, swarmChain(lines, "inner"))).toEqual({ approvals: "bypass", depth: 2, hosts: ["dev"], fan_out: 2, until: "2026-09-13T06:00:00Z" });
  });

  it("a root supplies its approvals to its subtree in the implicit fleet, native when orphan", () => {
    expect(rootApprovals({ approvals: "bypass" })).toBe("bypass");
    expect(rootApprovals({ approvals: "bypass", orphan: true })).toBe("native");
    expect(rootApprovals({})).toBe("native");
    expect(rootApprovals(null)).toBe("native");
  });
});

describe("checkCeiling", () => {
  const allowed = { approvals: "bypass" as const, depth: 1, fan_out: 4, hosts: ["dev"], until: "2026-09-13T06:11:01Z" };

  it("passes what is within", () => {
    expect(checkCeiling({ approvals: "bypass", depth: 1, fan_out: 2, hosts: ["dev"], until: "2026-09-13T05:41:12Z" }, allowed)).toBeNull();
    expect(checkCeiling({}, allowed)).toBeNull();
  });

  it("names the first key exceeded, in the order approvals, depth, fan_out, hosts, until", () => {
    expect(checkCeiling({ approvals: "bypass" }, { approvals: "native" })).toEqual({ key: "approvals", wanted: "bypass", allowed: "native" });
    expect(checkCeiling({ approvals: "bypass" }, {})).toEqual({ key: "approvals", wanted: "bypass", allowed: "native" });
    expect(checkCeiling({ depth: 2 }, allowed)).toEqual({ key: "depth", wanted: 2, allowed: 1 });
    expect(checkCeiling({ depth: 2 }, {})).toEqual({ key: "depth", wanted: 2, allowed: 1 });
    expect(checkCeiling({ fan_out: 5 }, allowed)).toEqual({ key: "fan_out", wanted: 5, allowed: 4 });
    expect(checkCeiling({ hosts: ["netcup"] }, allowed)).toEqual({ key: "hosts", wanted: ["netcup"], allowed: ["dev"] });
    expect(checkCeiling({ until: "2026-09-13T06:30:00Z" }, allowed)).toEqual({ key: "until", wanted: "2026-09-13T06:30:00Z", allowed: "2026-09-13T06:11:01Z" });
    expect(checkCeiling({ approvals: "bypass", depth: 5 }, { approvals: "native", depth: 1 })?.key).toBe("approvals");
  });

  it("describes a refusal for a human", () => {
    expect(describeRefusal({ key: "hosts", wanted: ["netcup"], allowed: ["dev"] })).toBe("ceiling refuses hosts: wanted netcup, allowed dev");
    expect(describeRefusal({ key: "fan_out", wanted: 5, allowed: null })).toBe("ceiling refuses fan_out: wanted 5, allowed none");
  });
});

describe("budgets, deadlines and spend", () => {
  it("parses <amount> <unit>", () => {
    expect(parseBudget("20 USD")).toEqual({ amount: 20, unit: "USD" });
    expect(parseBudget("1500000 tokens")).toEqual({ amount: 1500000, unit: "tokens" });
    expect(parseBudget("0.5 eip155:1/slip44:60")).toEqual({ amount: 0.5, unit: "eip155:1/slip44:60" });
    expect(parseBudget("20")).toBeNull();
    expect(parseBudget(undefined)).toBeNull();
  });

  it("reads --until as a duration from now or an ISO time", () => {
    const now = new Date("2026-09-13T05:41:01Z");
    expect(parseUntil("2h", now)).toBe("2026-09-13T07:41:01Z");
    expect(parseUntil("30m", now)).toBe("2026-09-13T06:11:01Z");
    expect(parseUntil("2026-09-13T06:11:01Z", now)).toBe("2026-09-13T06:11:01Z");
    expect(parseUntil("soon", now)).toBeNull();
  });

  it("sums spend per unit and shows it against the budget's unit", () => {
    const sums = sumSpend(["10 USD", "5 USD", "1000 tokens", undefined, "junk"]);
    expect(sums).toEqual({ USD: 15, tokens: 1000 });
    expect(formatSpend(sums, "20 USD")).toBe("15/20 USD");
    expect(formatSpend(sums)).toBe("15 USD, 1000 tokens");
    expect(formatSpend({})).toBe("");
  });
});
