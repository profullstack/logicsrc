/**
 * OpenContext — the reference implementation.
 *
 * ```ts
 * import { OpenContext } from "@logicsrc/opencontext";
 *
 * const oc = await OpenContext.load("./opencontext.yaml");
 * const result = await oc.resolve({ agent: "support-agent", task: "Handle ACME refund" });
 * console.log(result.bundle);
 * ```
 *
 * The resolver core is importable without the CLI — every function the class
 * wraps is also exported directly, so an agent runtime can embed resolution
 * without taking a dependency on argument parsing or terminal output.
 */

import type {
  Adapter,
  ContextBundle,
  ContextObject,
  ContextStore,
  Diagnostic,
  DiagnosticReport,
  EffectiveScope,
  LoadedObject,
  Manifest,
  ResolveOptions
} from "./types.js";
import { AdapterRegistry } from "./adapters/index.js";
import { loadStore, type LoadStoreOptions } from "./store.js";
import { loadManifest } from "./manifest.js";
import { resolve as resolveContext, type ResolveResult } from "./resolve.js";
import { validateStore, type ValidateOptions } from "./validate.js";
import { doctor as runDoctor, type DoctorOptions } from "./doctor.js";
import { search as runSearch, type SearchHit, type SearchOptions } from "./search.js";
import { history as objectHistory, diffObjects, type ObjectDiff, type ObjectHistory } from "./history.js";
import { buildGraph, type ContextGraph, type GraphOptions } from "./graph.js";
import { authorize, resolveScope, unrestrictedScope, type ScopeRequest } from "./permissions.js";
import { addObject, supersedeObject, type SupersedeOptions, type WriteOptions, type WriteResult } from "./write.js";
import { isSuperseded, resolveSupersession } from "./authority.js";
import { computeLifecycle } from "./lifecycle.js";
import { resolveAsOf } from "./time.js";
import { parseRef } from "./ids.js";

export interface OpenContextOptions extends LoadStoreOptions {
  adapters?: Adapter[];
}

export interface ListOptions {
  scope?: EffectiveScope;
  type?: string;
  layer?: string;
  authority?: string;
  tag?: string;
  owner?: string;
  includeSuperseded?: boolean;
  at?: string | Date;
}

export interface ListEntry {
  id: string;
  type: string;
  title?: string;
  layer?: string;
  authority?: string;
  owner?: string;
  version?: number;
  lifecycle: string;
  classification?: string;
  file?: string;
}

export class OpenContext {
  readonly store: ContextStore;
  readonly registry: AdapterRegistry;

  private constructor(store: ContextStore, registry: AdapterRegistry) {
    this.store = store;
    this.registry = registry;
  }

  /** Load a manifest and every object it declares. Discovers upward when given a directory. */
  static async load(pathOrDir: string = process.cwd(), options: OpenContextOptions = {}): Promise<OpenContext> {
    const registry = options.registry ?? new AdapterRegistry();
    for (const adapter of options.adapters ?? []) registry.register(adapter);
    const store = await loadStore(pathOrDir, { ...options, registry });
    return new OpenContext(store, registry);
  }

  get manifest(): Manifest {
    return this.store.manifest;
  }

  get dir(): string {
    return this.store.dir;
  }

  /** Register an adapter for additional URI schemes, then reload to pick up its content. */
  registerAdapter(adapter: Adapter): this {
    this.registry.register(adapter);
    return this;
  }

  /** Re-read everything from disk. */
  async reload(options: LoadStoreOptions = {}): Promise<OpenContext> {
    const store = await loadStore(this.store.manifestPath, { ...options, registry: this.registry });
    return new OpenContext(store, this.registry);
  }

  validate(options: ValidateOptions = {}): Diagnostic[] {
    return validateStore(this.store, options);
  }

  doctor(options: DoctorOptions = {}): DiagnosticReport {
    return runDoctor(this.store, options);
  }

  resolve(options: ResolveOptions = {}): ResolveResult {
    return resolveContext(this.store, options);
  }

  /** Just the bundle, for callers that do not need the exclusion detail. */
  bundle(options: ResolveOptions = {}): ContextBundle {
    return resolveContext(this.store, options).bundle;
  }

  search(query: string, options: SearchOptions = {}): SearchHit[] {
    return runSearch(this.store, query, options);
  }

  /**
   * Fetch one object by id, or `id@version`.
   *
   * Returns null when the object does not exist *or* when the scope may not
   * read it — an unauthorized read and a missing object are deliberately
   * indistinguishable to the caller, so probing for ids reveals nothing.
   */
  get(ref: string, options: { scope?: EffectiveScope } = {}): ContextObject | null {
    const parsed = parseRef(ref);
    if (!parsed) return null;

    const versions = this.store.byId.get(parsed.id);
    if (!versions || versions.length === 0) return null;

    const entry =
      parsed.version === undefined
        ? versions.at(-1)!
        : versions.find((candidate) => (candidate.object.version ?? 1) === parsed.version);
    if (!entry) return null;

    if (options.scope) {
      const bundle = this.resolve({
        agent: options.scope.consumer.type === "agent" ? options.scope.consumer.id : undefined,
        role: options.scope.consumer.roles,
        requested: [parsed.id]
      }).bundle;
      const found = bundle.objects.find((object) => object.id === parsed.id);
      return (found as ContextObject | undefined) ?? null;
    }

    return entry.object;
  }

  list(options: ListOptions = {}): ListEntry[] {
    const asOf = resolveAsOf(options.at);
    const supersession = resolveSupersession(this.store.objects, this.store.byId);
    const scope = options.scope;

    const entries: ListEntry[] = [];

    for (const entry of this.store.objects) {
      const object = entry.object;

      // Listing is a read: an object the scope may not see must not appear even
      // as a row of metadata.
      if (scope && !authorize(object, scope).allowed) continue;
      if (options.type && object.type !== options.type) continue;
      if (options.layer && object.layer !== options.layer) continue;
      if (options.authority && object.authority !== options.authority) continue;
      if (options.owner && object.owner !== options.owner) continue;
      if (options.tag && !object.tags?.includes(options.tag)) continue;

      const superseded = isSuperseded(object, supersession.superseded);
      if (superseded && !options.includeSuperseded) continue;

      entries.push({
        id: object.id,
        type: object.type,
        title: object.title,
        layer: object.layer,
        authority: object.authority,
        owner: object.owner,
        version: object.version,
        classification: object.classification,
        lifecycle: computeLifecycle(object, {
          asOf,
          manifest: this.store.manifest,
          superseded: superseded ? new Set([object.id]) : new Set()
        }),
        file: entry.file
      });
    }

    return entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  history(id: string, options: { at?: string | Date } = {}): Promise<ObjectHistory> {
    return objectHistory(this.store, id, options);
  }

  /** Compare two versions of one object, or two arbitrary object sets. */
  diff(from: string, to: string): ObjectDiff[] {
    const before = this.objectsFor(from);
    const after = this.objectsFor(to);
    return diffObjects(before, after);
  }

  graph(options: GraphOptions = {}): ContextGraph {
    return buildGraph(this.store, options);
  }

  scope(request: ScopeRequest): EffectiveScope {
    return request.agent || request.role ? resolveScope(this.store.manifest, request) : unrestrictedScope();
  }

  add(object: ContextObject, options: WriteOptions = {}): WriteResult {
    return addObject(this.store, object, options);
  }

  supersede(id: string, options: SupersedeOptions = {}): WriteResult {
    return supersedeObject(this.store, id, options);
  }

  /** Objects addressed by an id, `id@version`, or `*`. */
  private objectsFor(ref: string): ContextObject[] {
    if (ref === "*") return this.store.objects.map((entry) => entry.object);

    const parsed = parseRef(ref);
    if (!parsed) return [];

    const versions = this.store.byId.get(parsed.id) ?? [];
    if (parsed.version === undefined) {
      const latest = versions.at(-1);
      return latest ? [latest.object] : [];
    }
    const match = versions.find((entry) => (entry.object.version ?? 1) === parsed.version);
    return match ? [match.object] : [];
  }
}

export { loadManifest, discoverManifest, SPEC_VERSION, MANIFEST_FILENAMES } from "./manifest.js";
export { loadStore, loadStoreFrom, normalize, defaultTypeFor } from "./store.js";
export { resolve, type ResolveResult } from "./resolve.js";
export { validateStore, sortDiagnostics, hasFailure, type ValidateOptions } from "./validate.js";
export { doctor, renderHealth, computeScore, DEFAULT_WEIGHTS, type DoctorOptions } from "./doctor.js";
export { search, type SearchHit, type SearchOptions } from "./search.js";
export { buildGraph, renderDot, renderGraphText, subgraph, type ContextGraph, type GraphOptions } from "./graph.js";
export { history, diffObjects, renderDiff, type ObjectDiff, type ObjectHistory } from "./history.js";
export { renderBundle, renderMarkdown, renderExplanation, type BundleFormat } from "./bundle.js";
export {
  authorize,
  resolveScope,
  unrestrictedScope,
  canWrite,
  hasPermission,
  redactionsFor,
  classificationRank,
  UnknownConsumerError,
  type ScopeRequest
} from "./permissions.js";
export { applyRedactions, parsePath, detectSecrets } from "./redact.js";
export { computeLifecycle, isResolvable, isApproved, isReviewOverdue } from "./lifecycle.js";
export {
  resolveSupersession,
  detectConflicts,
  compareCandidates,
  authorityRank,
  isSuperseded,
  keyOf
} from "./authority.js";
export { scoreRelevance, tokenize, compareForBundle } from "./relevance.js";
export { canonicalJson, digestOf, digestBundle, sha256Hex, sha256Uri, bundleIdFromDigest } from "./digest.js";
export { parseContextDocument, ContextParseError, type ParsedDocument } from "./parse.js";
export { parseDuration, parseTimestamp, resolveAsOf, formatAge } from "./time.js";
export { parseRef, formatRef, matchPattern, matchesAny, matchesPrincipal, deriveId, isValidId } from "./ids.js";
export { expandGlob, globToRegExp, CONTEXT_EXTENSIONS } from "./glob.js";
export { initProject, scaffoldFiles, slugify, type InitOptions, type InitResult } from "./scaffold.js";
export { addObject, supersedeObject, renderObject, WriteDeniedError, type WriteResult } from "./write.js";
export {
  buildEvent,
  recordEvent,
  eventForBundle,
  isAuditEnabled,
  type AuditEvent,
  type AuditEventName
} from "./audit.js";
export {
  AdapterRegistry,
  UnknownSchemeError,
  defaultAdapters,
  fileAdapter,
  httpAdapter,
  gitAdapter,
  sqliteAdapter,
  schemeOf,
  resolveInside,
  PathTraversalError,
  OfflineError
} from "./adapters/index.js";
export * from "./types.js";
export type { LoadedObject };
