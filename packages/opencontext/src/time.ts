/**
 * Duration and timestamp helpers.
 *
 * Durations use fixed unit lengths (y = 365d, w = 7d, d = 24h) so that
 * "stale after 30d" means the same number of milliseconds on every run and in
 * every timezone. Calendar-aware arithmetic would make resolution
 * non-deterministic, which the specification forbids.
 */

const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d|w|y)$/;

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_536_000_000
};

/** Parse `30d` to milliseconds. Returns null when the string is not a duration. */
export function parseDuration(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) return null;
  const amount = Number.parseInt(match[1]!, 10);
  const unit = UNIT_MS[match[2]!];
  if (unit === undefined || !Number.isFinite(amount)) return null;
  return amount * unit;
}

export function isValidDuration(value: string | undefined | null): boolean {
  return parseDuration(value) !== null;
}

/** Parse an RFC 3339 timestamp or ISO date. Returns null when unparseable. */
export function parseTimestamp(value: string | undefined | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Coerce a resolution timestamp. A bare date such as `2026-08-09` is read as
 * the end of that day, so `--at 2026-08-09` includes everything that happened
 * during it rather than only what existed at midnight.
 */
export function resolveAsOf(at: string | Date | undefined): Date {
  if (at instanceof Date) return at;
  if (!at) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(at.trim())) {
    return new Date(`${at.trim()}T23:59:59.999Z`);
  }
  const parsed = parseTimestamp(at);
  if (!parsed) {
    throw new Error(`Invalid timestamp "${at}". Expected an RFC 3339 instant or a YYYY-MM-DD date.`);
  }
  return parsed;
}

export function toIso(date: Date): string {
  return date.toISOString();
}

/** Format a millisecond span the way doctor and --explain report ages. */
export function formatAge(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < UNIT_MS.h!) return `${Math.round(abs / UNIT_MS.m!)}m`;
  if (abs < UNIT_MS.d!) return `${Math.round(abs / UNIT_MS.h!)}h`;
  if (abs < 90 * UNIT_MS.d!) return `${Math.round(abs / UNIT_MS.d!)}d`;
  return `${(abs / UNIT_MS.y!).toFixed(1)}y`;
}
