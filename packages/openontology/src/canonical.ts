import { createHash } from "node:crypto";

/**
 * Deterministic canonical JSON.
 *
 * Authoring formats (YAML, NDJSON, inline manifest arrays) are compiled into
 * this form before anything is hashed, signed, diffed, or published, so two
 * implementations that agree on the model agree on the bytes.
 *
 * Rules: object keys sorted by code unit, `undefined` members dropped,
 * array order preserved, no insignificant whitespace, JSON string escaping.
 */
export function canonicalize(value: unknown): string {
  return stringify(value);
}

function stringify(value: unknown): string {
  if (value === null) return "null";

  const type = typeof value;
  if (type === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error(`Cannot canonicalize non-finite number: ${String(value)}`);
    }
    // -0 and 0 must not produce different bytes.
    return JSON.stringify(value === 0 ? 0 : value);
  }
  if (type === "boolean" || type === "string") return JSON.stringify(value);
  if (type === "bigint") throw new Error("Cannot canonicalize bigint");
  if (type === "undefined" || type === "function" || type === "symbol") {
    throw new Error(`Cannot canonicalize ${type} at the top level`);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stringify(item === undefined ? null : item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stringify(v)}`).join(",")}}`;
}

/** Strip `undefined` members so a value round-trips through canonical JSON unchanged. */
export function canonicalObject<T>(value: T): T {
  return JSON.parse(canonicalize(value)) as T;
}

/** `sha256:<hex>` over the canonical JSON of a value, or over a raw string. */
export function digest(value: unknown): string {
  const input = typeof value === "string" ? value : canonicalize(value);
  return `sha256:${createHash("sha256").update(input, "utf8").digest("hex")}`;
}

/**
 * Package digest: covers the canonical manifest plus the sorted per-file
 * digest table, so any change to any declared file changes the package digest.
 */
export function packageDigest(
  manifest: unknown,
  files: Array<{ path: string; digest: string }>
): string {
  const table = [...files]
    .map((f) => ({ path: f.path, digest: f.digest }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return digest({ manifest, files: table });
}
