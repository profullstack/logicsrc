/** Small pure helpers every part of the runner shares. */

export class ErrandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrandError";
  }
}

const cache = new Map<string, RegExp>();

/** Patterns in an errand file are ECMAScript regular expressions, matched case-insensitively. */
export function re(pattern: string): RegExp {
  let compiled = cache.get(pattern);
  if (!compiled) {
    compiled = new RegExp(pattern, "i");
    cache.set(pattern, compiled);
  }
  return compiled;
}

export function test(pattern: string | undefined, text: string): boolean {
  return pattern === undefined ? true : re(pattern).test(text);
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ISO 8601 durations as the file uses them (`PT15M`, `PT90S`, `P21D`, `P1W`).
 * Months and years are counted as 30 and 365 days: no errand waits on a
 * calendar month to the day.
 */
export function durationMs(duration: string | undefined, fallback: number): number {
  if (!duration) return fallback;
  const m = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(duration);
  if (!m) return fallback;
  const [, y, mo, w, d, h, mi, s] = m.map((part) => (part === undefined ? 0 : Number(part)));
  const day = 86_400_000;
  return (y! * 365 + mo! * 30 + w! * 7 + d!) * day + h! * 3_600_000 + mi! * 60_000 + s! * 1000;
}

const TEMPLATE = /\{\{\s*([a-z][a-z0-9_.]*)\s*\}\}/g;

/** Every `{{name}}` in a template. */
export function templateNames(text: string): string[] {
  return [...text.matchAll(TEMPLATE)].map((m) => m[1]!);
}

/** Replace each `{{name}}` with `lookup(name)`; a name with no value throws, so nothing is sent half-filled. */
export function render(text: string, lookup: (name: string) => string | undefined): string {
  return text.replace(TEMPLATE, (_, name: string) => {
    const value = lookup(name);
    if (value === undefined) throw new ErrandError(`{{${name}}} has no value`);
    return value;
  });
}

/** The transforms the spec names: digits, whole, upper, lower, trim, first:N, last:N. */
export function transform(value: string, name: string | undefined): string {
  if (!name) return value;
  if (name === "digits") return (value.match(/\d+/g) ?? []).join("");
  if (name === "whole") {
    // Whole units, a leading minus for a loss, no separators: "(1,234.56)" and "-1,234.56" are both -1234.
    const negative = /^\s*\(.*\)\s*$/.test(value) || /^\s*-/.test(value);
    const digits = value.replace(/[^0-9.]/g, "");
    const whole = digits === "" ? "" : String(Math.trunc(Number(digits)));
    return whole === "" ? "" : negative && whole !== "0" ? `-${whole}` : whole;
  }
  if (name === "upper") return value.toUpperCase();
  if (name === "lower") return value.toLowerCase();
  if (name === "trim") return value.trim();
  const first = /^first:(\d+)$/.exec(name);
  if (first) return value.slice(0, Number(first[1]));
  const last = /^last:(\d+)$/.exec(name);
  if (last) return value.slice(-Number(last[1]));
  throw new ErrandError(`unknown transform ${name}`);
}

/** Secrets are shown as four dots, whatever their length, so the length leaks nothing either. */
export const MASK = "••••";

/** The https origin of a URL, or "" when it has none. */
export function originOf(url: string): string {
  try {
    const u = new URL(url);
    return u.origin === "null" ? "" : u.origin;
  } catch {
    return "";
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A short opaque id for a card or a run: lowercase letters and digits. */
export function shortId(random: (max: number) => number, length = 6): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  while (out.length < length) out += alphabet[random(alphabet.length)];
  return out;
}
