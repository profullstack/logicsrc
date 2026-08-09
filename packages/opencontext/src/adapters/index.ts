/**
 * The adapter registry.
 *
 * Two rules matter here, and both are normative:
 *
 *   1. An unknown scheme fails loudly. Resolving `crm://pricing/enterprise` to
 *      empty content would hand an agent a bundle that silently omits the
 *      pricing it was asked about — worse than an error, because nothing looks
 *      wrong.
 *   2. Adapters return data. Nothing an adapter fetches is ever executed, and
 *      nothing it returns can change resolver policy.
 */

import type { Adapter, AdapterConfig, AdapterContext, AdapterResult, Manifest, Trust } from "../types.js";
import { fileAdapter } from "./file.js";
import { httpAdapter } from "./http.js";
import { gitAdapter } from "./git.js";
import { sqliteAdapter } from "./sqlite.js";

export { fileAdapter, resolveInside, PathTraversalError, guessContentType } from "./file.js";
export { httpAdapter, OfflineError } from "./http.js";
export { gitAdapter, parseGitUri, gitLog, gitShow, isGitAvailable, type GitCommit } from "./git.js";
export { sqliteAdapter, parseSqliteUri } from "./sqlite.js";

export class UnknownSchemeError extends Error {
  readonly scheme: string;
  readonly uri: string;

  constructor(scheme: string, uri: string, known: string[]) {
    super(
      `No adapter is installed for "${scheme}://" (from ${uri}). ` +
        `Known schemes: ${known.join(", ")}. Register one with registerAdapter(), or remove the reference.`
    );
    this.name = "UnknownSchemeError";
    this.scheme = scheme;
    this.uri = uri;
  }
}

export class AdapterRegistry {
  private readonly adapters = new Map<string, Adapter>();

  constructor(adapters: Adapter[] = defaultAdapters()) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: Adapter): this {
    for (const scheme of adapter.schemes) {
      this.adapters.set(scheme.toLowerCase(), adapter);
    }
    return this;
  }

  get(scheme: string): Adapter | undefined {
    return this.adapters.get(scheme.toLowerCase());
  }

  has(scheme: string): boolean {
    return this.adapters.has(scheme.toLowerCase());
  }

  schemes(): string[] {
    return [...this.adapters.keys()].sort();
  }

  /**
   * Load a URI.
   *
   * A bare path with no scheme is a file path — that is the common case in a
   * local repository and does not deserve ceremony.
   */
  async load(uri: string, options: LoadOptions): Promise<AdapterResult> {
    const scheme = schemeOf(uri);

    if (!scheme) {
      return fileAdapter.load(uri, contextFor("file", options));
    }

    const adapter = this.get(scheme);
    if (!adapter) {
      throw new UnknownSchemeError(scheme, uri, this.schemes());
    }

    const config = options.manifest?.adapters?.[scheme] ?? {};
    if (config.enabled === false) {
      throw new Error(`The "${scheme}://" adapter is disabled in opencontext.yaml (adapters.${scheme}.enabled: false).`);
    }

    const ctx = contextFor(scheme, options);
    const result = await adapter.load(uri, ctx);

    // A configured trust level is a deliberate operator statement and wins over
    // the adapter's own guess — but it can only ever be applied here, never by
    // the content itself.
    const configured = config.trust as Trust | undefined;
    return configured ? { ...result, trust: configured } : result;
  }
}

export interface LoadOptions {
  dir: string;
  manifest?: Manifest;
  offline?: boolean;
}

function contextFor(scheme: string, options: LoadOptions): AdapterContext {
  const config: AdapterConfig = options.manifest?.adapters?.[scheme] ?? {};
  return {
    dir: options.dir,
    offline: options.offline ?? false,
    config,
    timeoutMs: config.timeout_ms
  };
}

/** The scheme of a URI, or undefined for a bare path. Windows drive letters are not schemes. */
export function schemeOf(uri: string): string | undefined {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(uri);
  if (!match) return undefined;
  const scheme = match[1]!.toLowerCase();
  if (scheme.length === 1) return undefined;
  return scheme;
}

/** Adapters every conforming implementation ships: file and http are required, git and sqlite are recommended. */
export function defaultAdapters(): Adapter[] {
  return [fileAdapter, httpAdapter, gitAdapter, sqliteAdapter];
}
