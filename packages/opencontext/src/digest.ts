/**
 * Canonical serialization and digests.
 *
 * A bundle digest is what lets a decision record cite exactly the context that
 * produced it, and what lets CI prove that a resolution has not drifted. That
 * only works if serialization is canonical, so key order, undefined handling,
 * and number formatting are all pinned here rather than left to JSON.stringify
 * defaults.
 */

import { createHash } from "node:crypto";

/**
 * Deterministic JSON: object keys sorted, `undefined` dropped, arrays left in
 * their (already deterministic) order, no insignificant whitespace.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(canonicalize).filter((item) => item !== undefined);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const canonical = canonicalize(source[key]);
      if (canonical !== undefined) result[key] = canonical;
    }
    return result;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`Cannot canonicalize non-finite number: ${String(value)}`);
  }
  return value;
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/** `sha256:<64 hex>` — the form used by source digests and bundle digests. */
export function sha256Uri(input: string | Uint8Array): string {
  return `sha256:${sha256Hex(input)}`;
}

/** Digest of a structure, over its canonical JSON. */
export function digestOf(value: unknown): string {
  return sha256Uri(canonicalJson(value));
}

/**
 * Fields excluded from a bundle's digest.
 *
 * The digest identifies **the resolved context**, not the moment it was
 * computed. So the three clock-and-self fields are excluded:
 *
 *   - `generated_at` — wall-clock, differs between two otherwise identical runs
 *   - `digest` — cannot contain itself
 *   - `bundle_id` — derived from the digest
 *
 * `as_of` is excluded for the same reason, and it is worth being precise about
 * why, because it looks like a resolution input. Resolving at two different
 * instants only matters if it *changes what was selected* — and any such change
 * is already covered, because every object's computed `lifecycle`, along with
 * the full `objects`, `excluded`, and `warnings` lists, is inside the digest.
 * Two resolutions that select the same context at the same lifecycle states are
 * the same context, and should digest identically whether they ran a second or
 * a month apart. That is precisely the property a decision record needs when it
 * cites the context it was made from.
 */
export const BUNDLE_DIGEST_EXCLUDED = ["generated_at", "digest", "bundle_id", "as_of"] as const;

export function digestBundle(bundle: Record<string, unknown>): string {
  const subject: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(bundle)) {
    if ((BUNDLE_DIGEST_EXCLUDED as readonly string[]).includes(key)) continue;
    subject[key] = value;
  }
  return digestOf(subject);
}

/** Bundle ids are derived from the digest so identical input yields an identical id. */
export function bundleIdFromDigest(digest: string): string {
  return `ocb_${digest.replace(/^sha256:/, "").slice(0, 16)}`;
}
