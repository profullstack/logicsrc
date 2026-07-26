import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { canonicalObject, digest, packageDigest } from "./canonical.js";
import { OPENONTOLOGY_VERSION } from "./types.js";
import type {
  BuiltPackage,
  DataSection,
  LoadedPackage,
  Manifest,
  SchemaSection
} from "./types.js";

const SCHEMA_SECTIONS: SchemaSection[] = [
  "namespaces",
  "entityTypes",
  "properties",
  "relationships",
  "constraints",
  "queries",
  "actions"
];

const DATA_SECTIONS: DataSection[] = ["entities", "claims", "sources", "evidence"];

const MANIFEST_NAMES = ["openontology.yaml", "openontology.yml", "openontology.json"];

export class PackageLoadError extends Error {
  readonly code = "OO-L-LOAD";
  constructor(message: string) {
    super(message);
    this.name = "PackageLoadError";
  }
}

export interface LoadInput {
  /** Directory containing openontology.yaml, or the manifest file itself. */
  dir?: string;
  /** Fully in-memory package (used by tests, imports, and hosted adapters). */
  manifest?: Manifest;
  schema?: Partial<LoadedPackage["schema"]>;
  data?: Partial<LoadedPackage["data"]>;
}

/**
 * Load a package from disk or memory. Authoring formats (YAML, JSON, NDJSON,
 * inline manifest arrays) all compile to the same canonical objects here, so
 * everything downstream — validation, digests, queries — sees one shape.
 */
export function loadOntologyPackage(input: string | LoadInput): LoadedPackage {
  if (typeof input === "string") return loadFromDir(input);
  if (input.dir) return loadFromDir(input.dir);
  if (!input.manifest) throw new PackageLoadError("Provide either a directory or a manifest");

  const loaded: LoadedPackage = {
    manifest: canonicalObject(input.manifest),
    schema: emptySchema(),
    data: emptyData(),
    files: []
  };
  for (const section of SCHEMA_SECTIONS) {
    const items = input.schema?.[section];
    if (items) (loaded.schema[section] as unknown[]) = canonicalObject(items as unknown[]);
  }
  for (const section of DATA_SECTIONS) {
    const items = input.data?.[section];
    if (items) (loaded.data[section] as unknown[]) = canonicalObject(items as unknown[]);
  }
  return loaded;
}

function loadFromDir(dirOrFile: string): LoadedPackage {
  const base = resolve(dirOrFile);
  const manifestPath = MANIFEST_NAMES.some((name) => base.endsWith(name))
    ? base
    : findManifest(base);

  const dir = manifestPath.slice(0, manifestPath.lastIndexOf("/")) || ".";
  const manifest = canonicalObject(parseFile(manifestPath) as Manifest);

  if (manifest?.kind !== "OntologyPackage") {
    throw new PackageLoadError(
      `${manifestPath} is not an OpenOntology manifest (kind: ${JSON.stringify(manifest?.kind ?? null)})`
    );
  }

  const loaded: LoadedPackage = {
    manifest,
    dir,
    schema: emptySchema(),
    data: emptyData(),
    files: []
  };

  for (const section of SCHEMA_SECTIONS) {
    const declared = manifest.schema?.[section];
    const { items, path } = resolveSection(dir, declared, `schema.${section}`);
    (loaded.schema[section] as unknown[]) = items;
    if (path) loaded.files.push({ path, digest: digest(items), count: items.length });
  }

  for (const section of DATA_SECTIONS) {
    const declared = manifest.data?.[section];
    const { items, path } = resolveSection(dir, declared, `data.${section}`);
    (loaded.data[section] as unknown[]) = items;
    if (path) loaded.files.push({ path, digest: digest(items), count: items.length });
  }

  if (manifest.context) {
    const contextPath = join(dir, manifest.context);
    if (!existsSync(contextPath)) {
      throw new PackageLoadError(`Manifest declares context ${manifest.context} but the file is missing`);
    }
    loaded.context = parseFile(contextPath) as Record<string, unknown>;
    loaded.files.push({ path: manifest.context, digest: digest(loaded.context), count: 1 });
  }

  loaded.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return loaded;
}

function findManifest(dir: string): string {
  for (const name of MANIFEST_NAMES) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  throw new PackageLoadError(`No openontology.yaml (or .yml/.json) found in ${dir}`);
}

function resolveSection(
  dir: string,
  declared: string | object[] | undefined,
  label: string
): { items: object[]; path?: string } {
  if (declared === undefined) return { items: [] };
  if (Array.isArray(declared)) return { items: canonicalObject(declared) };

  const path = declared;
  const full = isAbsolute(path) ? path : join(dir, path);
  if (!existsSync(full)) {
    throw new PackageLoadError(`Manifest declares ${label}: ${path} but the file is missing`);
  }

  const parsed = parseFile(full);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return { items: canonicalObject(items as object[]), path };
}

function parseFile(path: string): unknown {
  const raw = readFileSync(path, "utf8");
  const lower = path.toLowerCase();

  if (lower.endsWith(".ndjson") || lower.endsWith(".jsonl")) {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//"))
      .map((line, index) => {
        try {
          return JSON.parse(line) as unknown;
        } catch (error) {
          throw new PackageLoadError(
            `${path}:${index + 1} is not valid JSON — ${(error as Error).message}`
          );
        }
      });
  }

  if (lower.endsWith(".json") || lower.endsWith(".jsonld")) {
    try {
      return JSON.parse(raw) as unknown;
    } catch (error) {
      throw new PackageLoadError(`${path} is not valid JSON — ${(error as Error).message}`);
    }
  }

  try {
    return parseYaml(raw) as unknown;
  } catch (error) {
    throw new PackageLoadError(`${path} is not valid YAML — ${(error as Error).message}`);
  }
}

/**
 * Compile a loaded package into the deterministic build artifact: canonical
 * objects, a per-file digest table, and the package digest that signing,
 * diffing, and publishing all key off.
 */
export function buildOntologyPackage(
  loaded: LoadedPackage,
  options: { builtAt?: string } = {}
): BuiltPackage {
  const files =
    loaded.files.length > 0
      ? [...loaded.files]
      : [
          ...SCHEMA_SECTIONS.map((s) => ({
            path: `schema.${s}`,
            digest: digest(loaded.schema[s]),
            count: loaded.schema[s].length
          })),
          ...DATA_SECTIONS.map((s) => ({
            path: `data.${s}`,
            digest: digest(loaded.data[s]),
            count: loaded.data[s].length
          }))
        ].filter((f) => f.count > 0);

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // The digest covers the manifest *without* any previously embedded digest,
  // so building twice is idempotent.
  const { digest: _ignored, signatures, ...manifestForDigest } = loaded.manifest;
  const computed = packageDigest(manifestForDigest, files);

  const built: BuiltPackage = {
    openontology: loaded.manifest.openontology ?? OPENONTOLOGY_VERSION,
    kind: "BuiltOntologyPackage",
    manifest: { ...loaded.manifest, digest: computed },
    digest: computed,
    files,
    schema: loaded.schema,
    data: loaded.data
  };

  if (options.builtAt) built.builtAt = options.builtAt;
  if (loaded.context) built.context = loaded.context;
  if (signatures) built.signatures = signatures;

  return built;
}

/** Recompute a built package's digest — used to detect tampering or drift. */
export function verifyPackageDigest(built: BuiltPackage): { ok: boolean; expected: string } {
  const { digest: _ignored, signatures: _sigs, ...manifestForDigest } = built.manifest;
  const expected = packageDigest(manifestForDigest, built.files);
  return { ok: expected === built.digest, expected };
}

function emptySchema(): LoadedPackage["schema"] {
  return {
    namespaces: [],
    entityTypes: [],
    properties: [],
    relationships: [],
    constraints: [],
    queries: [],
    actions: []
  };
}

function emptyData(): LoadedPackage["data"] {
  return { entities: [], claims: [], sources: [], evidence: [] };
}

export { SCHEMA_SECTIONS, DATA_SECTIONS };
