/**
 * Object ids, references, and the pattern language used by scopes and
 * permissions.
 *
 * Everything here is exact-match-first: a wildcard only ever matches whole
 * dotted segments, so `products.*` can never reach `products-internal`. That
 * matters because these functions decide what an agent is allowed to read.
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)*$/;
const REF_PATTERN = /^([a-z0-9][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)*)(?:@(\d+))?$/;
const SCOPE_PATTERN = /^([a-z0-9][a-z0-9_-]*|\*)(\.([a-z0-9][a-z0-9_-]*|\*))*$/;

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function isValidScopePattern(pattern: string): boolean {
  return SCOPE_PATTERN.test(pattern);
}

export interface ObjectRef {
  id: string;
  version?: number;
}

/** Parse `policy.refunds` or `policy.refunds@2`. Returns null when malformed. */
export function parseRef(ref: string): ObjectRef | null {
  const match = REF_PATTERN.exec(ref.trim());
  if (!match) return null;
  const version = match[2] === undefined ? undefined : Number.parseInt(match[2], 10);
  return version === undefined ? { id: match[1]! } : { id: match[1]!, version };
}

export function formatRef(ref: ObjectRef): string {
  return ref.version === undefined ? ref.id : `${ref.id}@${ref.version}`;
}

/**
 * Match an id against one scope pattern.
 *
 * Wildcards are always whole segments, never substrings, so a pattern can never
 * reach a sibling id that merely starts with the same characters —
 * `products.*` covers `products.enterprise` and never `products-internal`.
 *
 *   `*`                      everything
 *   `policies.support.*`     a trailing wildcard: the prefix itself, plus any
 *                            depth beneath it (`policies.support`,
 *                            `policies.support.refund`, and deeper)
 *   `customers.*.churn-risk` an interior wildcard: exactly one segment, so it
 *                            matches `customers.acme.churn-risk` but not
 *                            `customers.acme.eu.churn-risk`
 *
 * The asymmetry is deliberate. A trailing wildcard is how people express "this
 * subtree", and an interior one is how they express "this field, whichever
 * record it belongs to" — collapsing them into one rule would make the second
 * silently grant the first.
 */
export function matchPattern(pattern: string, id: string): boolean {
  if (pattern === "*") return true;

  const idSegments = id.split(".");

  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2).split(".");
    if (idSegments.length < prefix.length) return false;
    return prefix.every((segment, index) => segmentMatches(segment, idSegments[index]!));
  }

  const patternSegments = pattern.split(".");
  if (patternSegments.length !== idSegments.length) return false;
  return patternSegments.every((segment, index) => segmentMatches(segment, idSegments[index]!));
}

function segmentMatches(patternSegment: string, idSegment: string): boolean {
  return patternSegment === "*" || patternSegment === idSegment;
}

export function matchesAny(patterns: readonly string[] | undefined, id: string): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => matchPattern(pattern, id));
}

/** The pattern that matched, for reporting *why* something was excluded. */
export function firstMatch(patterns: readonly string[] | undefined, id: string): string | undefined {
  return patterns?.find((pattern) => matchPattern(pattern, id));
}

/**
 * Match a principal list (an object's `permissions.read`, `write`, or `deny`)
 * against the consumer's identity and roles. Supports `*` and a trailing `.*`.
 */
export function matchesPrincipal(list: readonly string[] | undefined, principals: readonly string[]): boolean {
  if (!list || list.length === 0) return false;
  return list.some((entry) => {
    if (entry === "*") return true;
    if (entry.endsWith(".*")) {
      const prefix = entry.slice(0, -2);
      return principals.some((p) => p === prefix || p.startsWith(`${prefix}.`));
    }
    return principals.includes(entry);
  });
}

/**
 * Derive an id from a file path inside a collection, used when a document does
 * not declare its own.
 *
 * `policies` + `support/refund.md` becomes `policies.support.refund`. Segments
 * are lowercased and non-id characters collapse to dashes so a real-world
 * filename such as `Refund Policy (v2).md` still produces a usable id.
 */
export function deriveId(collectionKey: string, relativePath: string): string {
  const withoutExt = relativePath.replace(/\.(md|markdown|ya?ml|json)$/i, "");
  const segments = withoutExt
    .split(/[/\\]/)
    .filter((segment) => segment.length > 0 && segment !== ".")
    .map(slugSegment)
    .filter((segment) => segment.length > 0);

  // `policies/index.md` is the collection root, not `policies.index`.
  if (segments.length > 0 && (segments.at(-1) === "index" || segments.at(-1) === "readme")) {
    segments.pop();
  }

  return [collectionKey, ...segments].join(".");
}

function slugSegment(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Sort ids the way bundles and reports order them: stable and locale-independent. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
