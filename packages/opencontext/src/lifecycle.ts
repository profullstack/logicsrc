/**
 * Freshness and lifecycle.
 *
 * Lifecycle state is always *computed* against a timestamp and never stored on
 * an object. That is what makes `--at` work: asking for the context as it stood
 * last quarter re-evaluates every window rather than reading a cached flag, so a
 * decision can be audited against the context that actually existed when it was
 * made.
 */

import type { ContextObject, LifecycleState, Manifest } from "./types.js";
import { parseDuration, parseTimestamp } from "./time.js";

export interface LifecycleOptions {
  asOf: Date;
  manifest: Manifest;
  /** Ids already established as superseded, which outranks every other state. */
  superseded?: ReadonlySet<string>;
}

export function computeLifecycle(object: ContextObject, options: LifecycleOptions): LifecycleState {
  const { asOf, manifest } = options;

  if (options.superseded?.has(object.id)) return "superseded";

  const validFrom = parseTimestamp(object.valid_from);
  if (validFrom && validFrom.getTime() > asOf.getTime()) return "future";

  // `expires: null` is an explicit statement that the object never expires, and
  // is different from omitting the field (where the repository ttl applies).
  if (object.expires !== null) {
    const expires = parseTimestamp(object.expires);
    if (expires && expires.getTime() <= asOf.getTime()) return "expired";
  }

  const ttlMs = parseDuration(object.ttl ?? manifest.freshness?.default_ttl);
  if (ttlMs !== null) {
    const updated = parseTimestamp(object.updated ?? object.created);
    if (updated && updated.getTime() + ttlMs <= asOf.getTime()) return "stale";
  }

  return "current";
}

/** States excluded from a default resolution. Stale context still resolves — loudly. */
export function isResolvable(state: LifecycleState, options: { includeHistorical?: boolean; excludeExpired?: boolean }): boolean {
  if (options.includeHistorical) return true;
  if (state === "superseded") return false;
  if (state === "future") return false;
  if (state === "expired") return options.excludeExpired === false;
  return true;
}

/** Whether a scheduled review has come due at `asOf`. */
export function isReviewOverdue(object: ContextObject, asOf: Date, manifest: Manifest): boolean {
  const explicit = parseTimestamp(object.review?.next_review);
  if (explicit) return explicit.getTime() <= asOf.getTime();

  const interval = parseDuration(object.review?.interval ?? manifest.review?.interval);
  if (interval === null) return false;

  const last = parseTimestamp(object.review?.last_review ?? object.updated ?? object.created);
  if (!last) return false;
  return last.getTime() + interval <= asOf.getTime();
}

/** How much of the object's freshness window has elapsed, for reporting. */
export function ageOf(object: ContextObject, asOf: Date): number | null {
  const updated = parseTimestamp(object.updated ?? object.created);
  if (!updated) return null;
  return asOf.getTime() - updated.getTime();
}

/**
 * Whether the object satisfies its own approval requirement.
 *
 * An object that demands two approvals and carries one is not approved. This is
 * metadata the specification defines and a runtime enforces; OpenContext does
 * not host the workflow that collects the signatures.
 */
export function isApproved(object: ContextObject): boolean {
  if (object.status === "rejected" || object.status === "retired") return false;

  const approval = object.approval;
  if (!approval?.required) {
    // Without an explicit requirement, only draft and pending are held back.
    return object.status !== "draft" && object.status !== "pending";
  }

  const minimum = approval.minimum ?? 1;
  const approvals = approval.approved_by ?? [];
  if (approvals.length < minimum) return false;

  if (approval.roles && approval.roles.length > 0) {
    const eligible = approvals.filter((entry) => !entry.role || approval.roles!.includes(entry.role));
    return eligible.length >= minimum;
  }

  return true;
}
