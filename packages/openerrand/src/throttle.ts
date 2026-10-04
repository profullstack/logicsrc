/**
 * The attempt ledger. Sites escalate: a tax board restarts its 30-minute lock
 * on any attempt made inside it, others ban an account or an address for
 * longer each time. A retry loop turns one lockout into an open-ended one, so
 * every run that sends something is recorded before it starts, and a run is
 * refused while a recorded lockout lasts.
 *
 * - Window and day caps are per errand and account: 2 runs in 30 minutes, 4 a
 *   day.
 * - Spacing is per site, whatever the errand or account: 2 minutes between
 *   runs, because the site sees one browser and one phone.
 * - A lockout is per site and account, so an activation errand respects the
 *   lock a registration errand ran into on the same account. Its length is
 *   `metadata.lockout.duration` when the file gives one, else 35 minutes.
 * - `--force` lifts the caps and the spacing. It never lifts a lockout.
 */

import type { Errand } from "./types.js";
import { durationMs } from "./util.js";

export interface Attempt {
  site: string;
  account: string;
  errand: string;
  at: string;
}

export interface Ledger {
  attempts: Attempt[];
  /** `<site>|<account>` to the time before which nothing may be sent. */
  lockedUntil: Record<string, string>;
}

export const LIMITS = {
  windowMs: 30 * 60_000,
  perWindow: 2,
  perDay: 4,
  spacingMs: 2 * 60_000,
  /** A 30-minute lock and 5 more, so a skewed clock cannot restart it. */
  lockoutMs: 35 * 60_000,
} as const;

const DAY = 86_400_000;

export function emptyLedger(): Ledger {
  return { attempts: [], lockedUntil: {} };
}

export interface ThrottleKey {
  site: string;
  account: string;
  errand: string;
}

export function keyFor(errand: Errand, account = "default"): ThrottleKey {
  return { site: errand.site.origins[0]!, account, errand: errand.name };
}

const lockKey = (k: ThrottleKey): string => `${k.site}|${k.account}`;

export type ThrottleCheck = { ok: true } | { ok: false; until: Date; reason: string; lockout: boolean };

export function checkThrottle(ledger: Ledger, key: ThrottleKey, now: Date, force = false): ThrottleCheck {
  const t = now.getTime();
  const locked = ledger.lockedUntil[lockKey(key)];
  if (locked && Date.parse(locked) > t) {
    return { ok: false, lockout: true, until: new Date(locked), reason: `the site locked the ${key.account} account; any attempt before then can restart the lock, and --force does not lift it` };
  }
  if (force) return { ok: true };
  const today = ledger.attempts.map((a) => ({ ...a, ms: Date.parse(a.at) })).filter((a) => t - a.ms < DAY);
  const onSite = today.filter((a) => a.site === key.site);
  const last = Math.max(0, ...onSite.map((a) => a.ms));
  if (last && t - last < LIMITS.spacingMs) {
    return { ok: false, lockout: false, until: new Date(last + LIMITS.spacingMs), reason: "runs on one site are spaced 2 minutes apart" };
  }
  const mine = onSite.filter((a) => a.account === key.account && a.errand === key.errand).sort((a, b) => a.ms - b.ms);
  const recent = mine.filter((a) => t - a.ms < LIMITS.windowMs);
  if (recent.length >= LIMITS.perWindow) {
    return { ok: false, lockout: false, until: new Date(recent[0]!.ms + LIMITS.windowMs), reason: `${LIMITS.perWindow} runs of ${key.errand} in 30 minutes` };
  }
  if (mine.length >= LIMITS.perDay) {
    return { ok: false, lockout: false, until: new Date(mine[0]!.ms + DAY), reason: `${LIMITS.perDay} runs of ${key.errand} today` };
  }
  return { ok: true };
}

export function recordAttempt(ledger: Ledger, key: ThrottleKey, now: Date): Ledger {
  const dayAgo = now.getTime() - DAY;
  return { ...ledger, attempts: [...ledger.attempts.filter((a) => Date.parse(a.at) > dayAgo), { ...key, at: now.toISOString() }] };
}

export function lockoutMs(errand: Errand): number {
  const duration = (errand.metadata as { lockout?: { duration?: unknown } } | undefined)?.lockout?.duration;
  return typeof duration === "string" ? durationMs(duration, LIMITS.lockoutMs) : LIMITS.lockoutMs;
}

export function recordLockout(ledger: Ledger, key: ThrottleKey, now: Date, ms: number = LIMITS.lockoutMs): Ledger {
  const until = new Date(now.getTime() + ms).toISOString();
  const current = ledger.lockedUntil[lockKey(key)];
  // A later lock never shortens an earlier, longer one.
  const next = current && current > until ? current : until;
  return { ...ledger, lockedUntil: { ...ledger.lockedUntil, [lockKey(key)]: next } };
}
