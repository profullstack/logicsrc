/**
 * How a ceiling is read, merged and checked (docs/openfleet.md, "How a ceiling
 * is read" and rules 3 to 5).
 *
 * A fleet's ceiling is whole. A swarm's holds only the keys it narrowed. A
 * member's effective ceiling is the fleet's, merged key by key down the swarm
 * path, with the latest `fleet.cap` for any swarm on that path applied last.
 * Narrower never widens: a key a spawner tried to widen is ignored here and
 * refused by the engine that checks it.
 */

import { findEvents, spawnOf } from "./store.js";
import type { Approvals, Ceiling, CeilingKey, LedgerLine, Refusal } from "./types.js";
import { CEILING_KEYS } from "./types.js";

export interface Budget {
  amount: number;
  unit: string;
}

/** `20 USD`, `1500000 tokens`, or a CAIP-19 asset id after the amount. */
export function parseBudget(value: unknown): Budget | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s+(\S.*)$/);
  if (!match) return null;
  return { amount: Number(match[1]), unit: match[2].trim() };
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asHosts(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((host) => typeof host === "string") ? (value as string[]) : null;
}

function asTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Is `wanted` within `allowed` for one key? Equal counts as within. An absent
 * `allowed` means the spec's default for that key: `approvals` native, `depth`
 * 1, and no cap for budget, fan_out, hosts and until.
 */
export function isNarrower(key: CeilingKey, wanted: unknown, allowed: unknown): boolean {
  if (wanted === undefined) return true;
  switch (key) {
    case "approvals":
      return wanted === "native" || allowed === "bypass";
    case "depth": {
      const want = asNumber(wanted);
      const cap = allowed === undefined ? 1 : asNumber(allowed);
      if (want === null) return false;
      if (cap === null) return false;
      return want <= cap;
    }
    case "fan_out": {
      if (allowed === undefined) return true;
      const want = asNumber(wanted);
      const cap = asNumber(allowed);
      return want !== null && cap !== null && want <= cap;
    }
    case "budget": {
      if (allowed === undefined) return true;
      const want = parseBudget(wanted);
      const cap = parseBudget(allowed);
      // Budgets in different units are not comparable, so not narrower.
      return want !== null && cap !== null && want.unit === cap.unit && want.amount <= cap.amount;
    }
    case "hosts": {
      if (allowed === undefined) return true;
      const want = asHosts(wanted);
      const cap = asHosts(allowed);
      return want !== null && cap !== null && want.every((host) => cap.includes(host));
    }
    case "until": {
      if (allowed === undefined) return true;
      const want = asTime(wanted);
      const cap = asTime(allowed);
      return want !== null && cap !== null && want <= cap;
    }
    default:
      return true;
  }
}

/**
 * Merge a narrowing into a base ceiling, key by key. A key the narrowing
 * would widen keeps the base value: a merged ceiling never widens, whatever a
 * ledger line claims. Unknown keys in the narrowing are copied through.
 */
export function mergeCeiling(base: Ceiling, narrowing: Ceiling | undefined): Ceiling {
  const out: Ceiling = { ...base };
  if (!narrowing || typeof narrowing !== "object") return out;
  for (const [key, value] of Object.entries(narrowing)) {
    if (value === undefined) continue;
    if ((CEILING_KEYS as readonly string[]).includes(key)) {
      if (isNarrower(key as CeilingKey, value, base[key])) out[key] = value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * A fleet's whole ceiling: the latest `fleet.cap` whose target is the fleet,
 * else `fleet.open`, else the implicit fleet's. A line that names no `hosts`
 * means the host it was written on (the ceiling table), so the two reference
 * readers admit the same members whichever tool opened the fleet.
 */
export function fleetCeiling(lines: LedgerLine[], fleet: string, implicit: Ceiling): Ceiling {
  const caps = findEvents(lines, "fleet.cap", { target: fleet });
  const opens = findEvents(lines, "fleet.open", { fleet });
  const line = caps.length ? caps[caps.length - 1] : opens.length ? opens[opens.length - 1] : null;
  if (!line) return { ...implicit };
  const ceiling: Ceiling = { ...(line.ceiling ?? {}) };
  if (ceiling.hosts === undefined && typeof line.host === "string" && line.host !== "") ceiling.hosts = [line.host];
  return ceiling;
}

/** True when the ledger holds no `fleet.open` for this fleet: it is the implicit one. */
export function isImplicitFleet(lines: LedgerLine[], fleet: string): boolean {
  return !lines.some((line) => line.event === "fleet.open" && line.fleet === fleet);
}

/** The swarms from the top down to `swarm`, following `parent_swarm` in each `swarm.spawn`. */
export function swarmChain(lines: LedgerLine[], swarm: string | undefined): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = swarm;
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.unshift(current);
    const spawn = spawnOf(lines, current);
    current = spawn?.parent_swarm;
  }
  return chain;
}

/**
 * The effective ceiling at the bottom of a swarm path: `base` merged with each
 * `swarm.spawn` narrowing on the way down, then the latest `fleet.cap` for
 * each swarm on the path, applied last so the sysop's word wins over what a
 * spawner wrote.
 */
export function effectiveCeiling(base: Ceiling, lines: LedgerLine[], chain: string[]): Ceiling {
  let ceiling: Ceiling = { ...base };
  for (const swarm of chain) {
    const spawn = spawnOf(lines, swarm);
    if (spawn?.ceiling) ceiling = mergeCeiling(ceiling, spawn.ceiling);
  }
  for (const swarm of chain) {
    const caps = findEvents(lines, "fleet.cap", { target: swarm });
    if (caps.length) ceiling = mergeCeiling(ceiling, caps[caps.length - 1].ceiling);
  }
  return ceiling;
}

/** The approvals a root supplies to its subtree in the implicit fleet: its own, or native when orphan. */
export function rootApprovals(root: { approvals?: Approvals; orphan?: boolean } | null | undefined): Approvals {
  if (!root) return "native";
  if (root.orphan) return "native";
  return root.approvals === "bypass" ? "bypass" : "native";
}

/** What a start or a spawn wants, checked key by key against what is allowed. */
export interface Wanted {
  approvals?: Approvals;
  depth?: number;
  fan_out?: number;
  hosts?: string[];
  /** For a start: the time it starts. For a spawn: the deadline it asks for. */
  until?: string;
}

const CHECK_ORDER: CeilingKey[] = ["approvals", "depth", "fan_out", "hosts", "until"];

/**
 * The first key `wanted` exceeds in `allowed`, or null when everything is
 * within the ceiling. Budget is not checked here: it is a sum of spend, not a
 * property of a start (rule 6).
 */
export function checkCeiling(wanted: Wanted, allowed: Ceiling): Refusal | null {
  for (const key of CHECK_ORDER) {
    const want = (wanted as Record<string, unknown>)[key];
    if (want === undefined) continue;
    if (!isNarrower(key, want, allowed[key])) {
      const shown = allowed[key] ?? (key === "approvals" ? "native" : key === "depth" ? 1 : null);
      return { key, wanted: want, allowed: shown };
    }
  }
  return null;
}

export function describeRefusal(refusal: Refusal): string {
  const show = (value: unknown) => (Array.isArray(value) ? value.join(",") : value === null ? "none" : String(value));
  return `ceiling refuses ${refusal.key}: wanted ${show(refusal.wanted)}, allowed ${show(refusal.allowed)}`;
}

const DURATION = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i;

/**
 * `--until 2h` is a duration from now; `--until 2026-09-13T06:11:01Z` is a
 * time. Either way the ceiling stores ISO 8601 UTC.
 */
export function parseUntil(value: string, now: Date = new Date()): string | null {
  const trimmed = value.trim();
  const duration = trimmed.match(DURATION);
  if (duration) {
    const n = Number(duration[1]);
    const unit = duration[2].toLowerCase();
    const factor = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
    return new Date(now.getTime() + n * factor).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Sum `member.spend` totals per unit. Totals in units that do not parse are skipped. */
export function sumSpend(totals: Array<string | undefined>): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const total of totals) {
    const parsed = parseBudget(total);
    if (!parsed) continue;
    sums[parsed.unit] = (sums[parsed.unit] ?? 0) + parsed.amount;
  }
  return sums;
}

/** `<spent> / <budget>` in the budget's unit, or the sums alone when there is no budget. */
export function formatSpend(spend: Record<string, number>, budget?: string): string {
  const cap = parseBudget(budget);
  if (cap) return `${spend[cap.unit] ?? 0}/${cap.amount} ${cap.unit}`;
  const parts = Object.entries(spend).map(([unit, amount]) => `${amount} ${unit}`);
  return parts.join(", ");
}
