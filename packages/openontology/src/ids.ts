/**
 * The OpenOntology identifier profile.
 *
 * PRD open question 1 asked whether ids should be HTTP IRIs, `urn:logicsrc:`
 * identifiers, or package-qualified compact ids. This implementation permits
 * all three and defines ONE canonicalization rule, so every form resolves to a
 * single IRI for export, comparison, and interop:
 *
 *   compact   ethereum:person:alice
 *             -> <namespace>person/alice        (namespace from the manifest)
 *   IRI       https://example.org/person/alice  -> unchanged
 *   URN       urn:logicsrc:ethereum:person:alice -> unchanged
 *
 * Authoring SHOULD use the compact form: it is short, diffable, and stays
 * stable when a package moves to a different namespace.
 */

export type IdForm = "compact" | "iri" | "urn";

const COMPACT_RE = /^[a-z0-9][a-z0-9-]*(:[A-Za-z0-9][A-Za-z0-9._-]*)+$/;

export function idForm(id: string): IdForm | null {
  if (/^https?:\/\//i.test(id)) return "iri";
  if (/^urn:[a-z0-9][a-z0-9-]{0,31}:/i.test(id)) return "urn";
  if (COMPACT_RE.test(id)) return "compact";
  return null;
}

export function isValidId(id: string): boolean {
  return idForm(id) !== null;
}

/** The prefix of a compact id (`ethereum` in `ethereum:person:alice`), else null. */
export function idPrefix(id: string): string | null {
  return idForm(id) === "compact" ? (id.split(":")[0] ?? null) : null;
}

/**
 * Canonicalize any accepted id form to a single resolvable IRI.
 * `namespaces` maps compact prefixes to base IRIs; `defaultNamespace` is the
 * package's own namespace, used when the prefix is unknown or omitted.
 */
export function toIri(
  id: string,
  options: { defaultNamespace: string; namespaces?: Record<string, string> }
): string {
  const form = idForm(id);
  if (form === "iri" || form === "urn") return id;
  if (form !== "compact") {
    throw new Error(`Not a valid OpenOntology id: ${JSON.stringify(id)}`);
  }

  const [prefix, ...rest] = id.split(":");
  const base = options.namespaces?.[prefix as string] ?? options.defaultNamespace;
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}${rest.map(encodeURIComponent).join("/")}`;
}

/** True when a query term is a variable (`?person`) rather than a constant. */
export function isVariable(term: string): boolean {
  return typeof term === "string" && term.startsWith("?") && term.length > 1;
}

/**
 * Deterministic object ids. Sequence-based rather than random so a build, an
 * applied change set, and a test run produce byte-identical output under both
 * Node.js and Bun.
 */
export function createIdFactory(prefix: string, start = 1): () => string {
  let n = start;
  return () => `${prefix}:${String(n++).padStart(6, "0")}`;
}

export function revisionId(kind: "data" | "schema", n: number): string {
  return `${kind}-${String(n).padStart(6, "0")}`;
}
