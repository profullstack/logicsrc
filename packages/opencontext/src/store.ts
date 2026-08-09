/**
 * Loading a manifest into a context store.
 *
 * This is the `discover -> load -> normalize` head of the resolution pipeline.
 * It is deliberately forgiving about *shape* — a plain Markdown file with no
 * front matter is a valid context object — and deliberately strict about
 * *provenance*: whatever an object ends up carrying, the store remembers what
 * the author actually wrote in `raw`, so diagnostics never accuse someone of
 * omitting a field that the loader itself supplied.
 */

import { readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type {
  CollectionSpec,
  ContextObject,
  ContextStore,
  Diagnostic,
  LoadedObject,
  Manifest,
  Source,
  Trust
} from "./types.js";
import { AdapterRegistry, PathTraversalError, UnknownSchemeError, schemeOf } from "./adapters/index.js";
import { resolveInside } from "./adapters/file.js";
import { ContextParseError, parseContextDocument } from "./parse.js";
import { deriveId } from "./ids.js";
import { expandGlob } from "./glob.js";
import { sha256Uri } from "./digest.js";
import { loadManifest, type LoadedManifest } from "./manifest.js";

export interface LoadStoreOptions {
  /** Skip adapters that reach the network. Local resolution never needs one. */
  offline?: boolean;
  /** Resolve `content_uri` through adapters. Off makes `list` fast when content is not needed. */
  loadContent?: boolean;
  registry?: AdapterRegistry;
}

export async function loadStore(
  pathOrDir: string = process.cwd(),
  options: LoadStoreOptions = {}
): Promise<ContextStore> {
  return loadStoreFrom(loadManifest(pathOrDir), options);
}

export async function loadStoreFrom(
  loaded: LoadedManifest,
  options: LoadStoreOptions = {}
): Promise<ContextStore> {
  const { manifest, dir, path: manifestPath } = loaded;
  const registry = options.registry ?? new AdapterRegistry();
  const loadDiagnostics: Diagnostic[] = [];
  const objects: LoadedObject[] = [];

  for (const [key, target] of Object.entries(manifest.context ?? {})) {
    const loadedEntry = loadSingle(dir, key, target, manifest, loadDiagnostics);
    if (loadedEntry) objects.push(loadedEntry);
  }

  for (const [key, specOrGlob] of Object.entries(manifest.collections ?? {})) {
    objects.push(...loadCollection(dir, key, specOrGlob, manifest, loadDiagnostics));
  }

  if (options.loadContent !== false) {
    await hydrateContent(objects, { dir, manifest, registry, offline: options.offline ?? false }, loadDiagnostics);
  }

  return {
    manifest,
    dir,
    manifestPath,
    objects,
    byId: indexById(objects),
    loadDiagnostics
  };
}

/** id -> every version of that id, ascending. Same-id objects are history, not duplicates. */
export function indexById(objects: LoadedObject[]): Map<string, LoadedObject[]> {
  const index = new Map<string, LoadedObject[]>();
  for (const entry of objects) {
    const list = index.get(entry.object.id);
    if (list) list.push(entry);
    else index.set(entry.object.id, [entry]);
  }
  for (const list of index.values()) {
    list.sort((a, b) => (a.object.version ?? 1) - (b.object.version ?? 1));
  }
  return index;
}

function loadSingle(
  dir: string,
  key: string,
  target: string,
  manifest: Manifest,
  diagnostics: Diagnostic[]
): LoadedObject | null {
  const scheme = schemeOf(target);

  // A `context:` entry naming a remote URI becomes a stub whose content is
  // hydrated by an adapter, rather than a file read.
  if (scheme && scheme !== "file") {
    const object = normalize({ id: key, type: key, content_uri: target } as ContextObject, { key, manifest });
    return { object, raw: { id: key, type: key, content_uri: target } as ContextObject };
  }

  const file = safeRelative(dir, target, key, diagnostics);
  if (!file) return null;
  return readObjectFile(dir, file, { key, manifest, diagnostics, declaredId: key });
}

function loadCollection(
  dir: string,
  key: string,
  specOrGlob: string | CollectionSpec,
  manifest: Manifest,
  diagnostics: Diagnostic[]
): LoadedObject[] {
  const spec: CollectionSpec = typeof specOrGlob === "string" ? { source: specOrGlob } : specOrGlob;
  const scheme = schemeOf(spec.source);

  if (scheme && scheme !== "file") {
    diagnostics.push({
      code: "unknown-scheme",
      severity: "error",
      message: `Collection "${key}" points at ${spec.source}. v1 collections expand local globs; use a single context entry with content_uri for remote sources.`,
      field: `collections.${key}`,
      remediation: `Move it under context: with a content_uri, or mirror the source into files.`
    });
    return [];
  }

  const { files, base } = expandGlob(dir, spec.source);

  if (files.length === 0) {
    diagnostics.push({
      code: "broken-reference",
      severity: "warning",
      message: `Collection "${key}" (${spec.source}) matched no files.`,
      field: `collections.${key}`,
      remediation: `Check the path, or remove the collection if it is not in use yet.`
    });
    return [];
  }

  const results: LoadedObject[] = [];
  for (const file of files) {
    const relativeToBase = base && file.startsWith(`${base}/`) ? file.slice(base.length + 1) : file;
    const entry = readObjectFile(dir, file, {
      key,
      manifest,
      spec,
      diagnostics,
      derivedId: deriveId(key, relativeToBase)
    });
    if (entry) results.push(entry);
  }
  return results;
}

interface ReadOptions {
  key: string;
  manifest: Manifest;
  spec?: CollectionSpec;
  diagnostics: Diagnostic[];
  /** Used for `context:` entries, where the manifest key names the object. */
  declaredId?: string;
  /** Used for collection members that do not declare an id. */
  derivedId?: string;
}

function readObjectFile(dir: string, file: string, options: ReadOptions): LoadedObject | null {
  const absolute = resolve(dir, file);

  let text: string;
  let mtime: Date;
  try {
    text = readFileSync(absolute, "utf8");
    mtime = statSync(absolute).mtime;
  } catch (error) {
    options.diagnostics.push({
      code: "source-unavailable",
      severity: "error",
      message: `Cannot read ${file}: ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`,
      file,
      field: `${options.spec ? "collections" : "context"}.${options.key}`,
      remediation: "Fix the path in opencontext.yaml, or add the missing file."
    });
    return null;
  }

  let parsed;
  try {
    parsed = parseContextDocument(text, file);
  } catch (error) {
    const parseError = error as ContextParseError;
    options.diagnostics.push({
      code: "schema-invalid",
      severity: "error",
      message: parseError.message,
      file,
      line: parseError.line,
      remediation: "Fix the document so it parses, then re-run validate."
    });
    return null;
  }

  const raw = parsed.object;
  const declared = typeof raw.id === "string" && raw.id.length > 0;
  const id = declared ? raw.id : (options.declaredId ?? options.derivedId ?? options.key);

  const object = normalize({ ...raw, id }, options);

  // Every file-backed object carries a source, so a bundle is attributable even
  // when the author declared none. This is *added* provenance, never a
  // substitute for it: `missing-provenance` is judged against `raw`.
  object.sources = [
    ...(raw.sources ?? []),
    {
      uri: `file://${file}`,
      type: "document",
      retrieved_at: mtime.toISOString(),
      digest: sha256Uri(text),
      trust: "trusted"
    } satisfies Source
  ];

  return {
    object,
    raw,
    file,
    line: parsed.bodyLine,
    collection: options.spec ? options.key : undefined,
    derivedId: !declared
  };
}

/**
 * Apply collection and manifest defaults.
 *
 * Precedence is object, then collection, then manifest, then the specification
 * default. Authority defaults to `reference` — useful but not binding — because
 * defaulting unlabelled context to `canonical` would let an unreviewed note
 * outrank a reviewed policy simply by existing.
 */
export function normalize(object: ContextObject, options: { key: string; manifest: Manifest; spec?: CollectionSpec }): ContextObject {
  const { spec, manifest } = options;
  const defaults = manifest.defaults ?? {};

  const result: ContextObject = { ...object };

  // Assign only when a value actually exists. `result.x ??= undefined` would
  // create the key with an undefined value, which is not the same as omitting
  // it: it fails `additionalProperties` on schemas that do not define the field
  // and it changes the canonical JSON a digest is computed over.
  const fill = <K extends keyof ContextObject>(key: K, value: ContextObject[K] | undefined): void => {
    if (result[key] === undefined && value !== undefined) result[key] = value;
  };

  fill("type", spec?.type ?? defaultTypeFor(options.key, Boolean(spec)));
  fill("layer", spec?.layer ?? defaults.layer);
  fill("authority", spec?.authority ?? defaults.authority ?? "reference");
  fill("classification", spec?.classification ?? defaults.classification ?? "internal");
  fill("durability", spec?.durability ?? defaults.durability);
  fill("trust", spec?.trust ?? defaults.trust ?? "trusted");
  fill("owner", spec?.owner ?? defaults.owner);
  fill("ttl", spec?.ttl ?? defaults.ttl);

  return result;
}

/**
 * Default `type` for a document that does not declare one.
 *
 * Collections are conventionally plural (`policies/`), objects conventionally
 * singular (`type: policy`), so the collection key is de-pluralized. Declaring
 * `type` explicitly is always better; this only keeps zero-metadata Markdown
 * usable.
 */
export function defaultTypeFor(key: string, isCollection: boolean): string {
  if (!isCollection) return key;
  if (key.endsWith("ies")) return `${key.slice(0, -3)}y`;
  if (key.endsWith("ss")) return key;
  if (key.endsWith("s")) return key.slice(0, -1);
  return key;
}

function safeRelative(dir: string, target: string, key: string, diagnostics: Diagnostic[]): string | null {
  try {
    const absolute = resolveInside(dir, target);
    return relative(resolve(dir), absolute).split("\\").join("/");
  } catch (error) {
    diagnostics.push({
      code: "path-traversal",
      severity: "error",
      message: (error as Error).message,
      field: `context.${key}`,
      remediation: "Move the file inside the context root, or reference it through an adapter."
    });
    return null;
  }
}

interface HydrateContext {
  dir: string;
  manifest: Manifest;
  registry: AdapterRegistry;
  offline: boolean;
}

/** Resolve `content_uri` through adapters, recording failures instead of throwing. */
async function hydrateContent(
  objects: LoadedObject[],
  ctx: HydrateContext,
  diagnostics: Diagnostic[]
): Promise<void> {
  const pending = objects.filter((entry) => typeof entry.object.content_uri === "string");

  for (const entry of pending) {
    const uri = entry.object.content_uri!;
    const scheme = schemeOf(uri);
    const adapter = scheme ? ctx.registry.get(scheme) : undefined;

    if (scheme && !adapter) {
      diagnostics.push({
        code: "unknown-scheme",
        severity: "error",
        message: new UnknownSchemeError(scheme, uri, ctx.registry.schemes()).message,
        id: entry.object.id,
        file: entry.file,
        field: "content_uri"
      });
      continue;
    }

    if (ctx.offline && adapter?.remote) {
      diagnostics.push({
        code: "source-unavailable",
        severity: "warning",
        message: `Skipped ${uri} for ${entry.object.id}: --offline.`,
        id: entry.object.id,
        file: entry.file,
        field: "content_uri",
        remediation: "Run without --offline to include it."
      });
      continue;
    }

    try {
      const result = await ctx.registry.load(uri, { dir: ctx.dir, manifest: ctx.manifest, offline: ctx.offline });
      entry.object.content = maybeParse(result.content, result.contentType);
      entry.object.content_type ??= result.contentType;

      // The object's declared trust wins only when it *lowers* trust. Content
      // fetched from outside cannot be promoted to trusted by the object that
      // references it, or an untrusted source could launder itself by being
      // pointed at from a canonical file.
      entry.object.trust = lowerTrust(entry.raw.trust, result.trust ?? "untrusted");

      entry.object.sources = [
        ...(entry.object.sources ?? []),
        {
          uri,
          type: "document",
          retrieved_at: result.retrievedAt ?? new Date().toISOString(),
          digest: result.digest,
          trust: result.trust
        }
      ];
    } catch (error) {
      diagnostics.push({
        code: error instanceof PathTraversalError ? "path-traversal" : "source-unavailable",
        severity: "error",
        message: `${entry.object.id}: ${(error as Error).message}`,
        id: entry.object.id,
        file: entry.file,
        field: "content_uri"
      });
    }
  }
}

const TRUST_RANK: Record<Trust, number> = { untrusted: 0, verified: 1, trusted: 2 };

/** The more cautious of two trust levels. */
export function lowerTrust(declared: Trust | undefined, actual: Trust): Trust {
  if (!declared) return actual;
  return TRUST_RANK[declared] <= TRUST_RANK[actual] ? declared : actual;
}

function maybeParse(content: string, contentType: string | undefined): unknown {
  if (contentType !== "application/json") return content;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}
