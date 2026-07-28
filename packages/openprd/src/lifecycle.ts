import type { PrdStatus } from "./types.js";

/**
 * The lifecycle from docs/openprd.md:
 *
 *   Draft  →  Review  →  Accepted  →  Final
 *                     ↘  Rejected
 *                     ↘  Withdrawn
 *                     ↘  Superseded by NNNN
 *
 * Rejected, Withdrawn, and Superseded are terminal — the standard keeps them
 * on disk because the *why* is part of the record, not because they resume.
 * A Final PRD can still be superseded by a follow-up.
 */
export const TRANSITIONS: Record<PrdStatus, PrdStatus[]> = {
  Draft: ["Review", "Withdrawn"],
  Review: ["Accepted", "Rejected", "Withdrawn", "Draft"],
  Accepted: ["Final", "Superseded", "Withdrawn"],
  Final: ["Superseded"],
  Rejected: [],
  Withdrawn: [],
  Superseded: []
};

export function nextStatuses(from: PrdStatus): PrdStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: PrdStatus, to: PrdStatus): boolean {
  return nextStatuses(from).includes(to);
}

export interface TransitionCheck {
  ok: boolean;
  reason?: string;
  /** Front-matter keys the transition requires alongside `status`. */
  requires: string[];
}

export function checkTransition(
  from: PrdStatus,
  to: PrdStatus,
  options: { supersededBy?: string | null } = {}
): TransitionCheck {
  if (from === to) {
    return { ok: false, reason: `PRD is already ${to}`, requires: [] };
  }
  if (!canTransition(from, to)) {
    const allowed = nextStatuses(from);
    return {
      ok: false,
      reason: allowed.length
        ? `${from} may only move to ${allowed.join(", ")}`
        : `${from} is terminal; open a follow-up PRD instead`,
      requires: []
    };
  }
  if (to === "Superseded" && !options.supersededBy) {
    return {
      ok: false,
      reason: "Superseded requires the id of the PRD that replaces this one",
      requires: ["superseded-by"]
    };
  }
  return { ok: true, requires: to === "Superseded" ? ["superseded-by"] : [] };
}

/** Statuses whose PRDs are still open work rather than historical record. */
export function isActive(status: PrdStatus): boolean {
  return status === "Draft" || status === "Review" || status === "Accepted";
}
