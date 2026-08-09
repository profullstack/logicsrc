/**
 * Writes.
 *
 * Core resolution is read-only. Everything here is the deliberately narrow
 * exception, and it is governed by three rules the specification is explicit
 * about:
 *
 *   1. **Writes are never implicit.** An agent that can read context does not
 *      thereby gain the ability to change it; `permissions.write` must name it.
 *   2. **Validate before persisting.** Authorization and schema are checked
 *      first, so a malformed or unauthorized write never reaches disk.
 *   3. **Observed context does not become truth automatically.** Promoting
 *      anything to `canonical` or `approved` requires an explicit, separate act
 *      by a principal entitled to do it — an agent cannot launder its own
 *      observation into policy.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { stringify as toYaml } from "yaml";
import { validate as validateSchema } from "@logicsrc/validators";
import type { Authority, ContextObject, ContextStore, EffectiveScope, LoadedObject } from "./types.js";
import { canWrite } from "./permissions.js";
import { resolveInside } from "./adapters/file.js";
import { isValidId } from "./ids.js";

export class WriteDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteDeniedError";
  }
}

/** Authority levels a write may not assign without an explicit promotion. */
const PROTECTED_AUTHORITIES: Authority[] = ["canonical", "approved"];

export interface WriteOptions {
  /** The consumer performing the write. Omit only for local human operation. */
  scope?: EffectiveScope;
  /** Where to write, relative to the manifest. Defaults to the target collection's directory. */
  file?: string;
  /**
   * Permit assigning canonical or approved authority. Off by default: promotion
   * is a governance act, not a side effect of writing.
   */
  allowPromotion?: boolean;
  dryRun?: boolean;
}

export interface WriteResult {
  id: string;
  file: string;
  action: "added" | "superseded";
  /** The object as it will be persisted. */
  object: ContextObject;
  written: boolean;
}

export function addObject(store: ContextStore, object: ContextObject, options: WriteOptions = {}): WriteResult {
  assertWritable(object, options);

  if (store.byId.has(object.id)) {
    throw new WriteDeniedError(
      `${object.id} already exists. Use supersede to replace it — durable context is superseded, not overwritten.`
    );
  }

  const file = options.file ?? defaultFileFor(store, object);
  const path = resolveInside(store.dir, file);
  const document = renderObject(object);

  if (!options.dryRun) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, document, "utf8");
  }

  return { id: object.id, file, action: "added", object, written: !options.dryRun };
}

export interface SupersedeOptions extends WriteOptions {
  /** Fields to change on the new version. */
  changes?: Partial<ContextObject>;
}

/**
 * Create the next version of an object, superseding the current one.
 *
 * The old object stays on disk. That is the whole point: supersession preserves
 * the ability to answer "what did we believe in March", which deletion destroys.
 */
export function supersedeObject(store: ContextStore, id: string, options: SupersedeOptions = {}): WriteResult {
  const versions = store.byId.get(id);
  const current = versions?.at(-1);
  if (!current) {
    throw new WriteDeniedError(`No object with id "${id}" to supersede.`);
  }

  if (options.scope && !canWrite(current.object, options.scope)) {
    throw new WriteDeniedError(
      `${options.scope.consumer.id} may not write ${id}. Add it to permissions.write on that object.`
    );
  }

  const currentVersion = current.object.version ?? 1;
  const next: ContextObject = {
    ...current.object,
    ...options.changes,
    id,
    version: currentVersion + 1,
    updated: options.changes?.updated ?? new Date().toISOString(),
    supersedes: [`${id}@${currentVersion}`]
  };

  // The loader attaches file:// sources; they belong to the old file, not the new one.
  delete next.superseded_by;
  next.sources = options.changes?.sources ?? current.raw.sources;

  assertWritable(next, { ...options, previousAuthority: current.object.authority } as WriteOptions & {
    previousAuthority?: Authority;
  });

  const file = options.file ?? nextVersionFile(current, currentVersion + 1);
  const path = resolveInside(store.dir, file);

  if (!options.dryRun) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, renderObject(next), "utf8");
  }

  return { id, file, action: "superseded", object: next, written: !options.dryRun };
}

function assertWritable(
  object: ContextObject,
  options: WriteOptions & { previousAuthority?: Authority }
): void {
  if (!object.id || !isValidId(object.id)) {
    throw new WriteDeniedError(`"${object.id}" is not a valid object id. Use lowercase dotted segments.`);
  }
  if (!object.type) {
    throw new WriteDeniedError(`${object.id} has no type. id and type are the only required fields — supply both.`);
  }

  const kind = object.type === "decision" ? "opencontext-decision" : "opencontext-object";
  const result = validateSchema(kind, object);
  if (!result.ok) {
    const detail = result.errors
      .map((error) => `${error.instancePath || "object"} ${error.message ?? "is invalid"}`)
      .join("; ");
    throw new WriteDeniedError(`${object.id} does not satisfy the ${kind} schema: ${detail}`);
  }

  // Promotion guard. Keeping an authority it already had is fine; acquiring one
  // is not, unless the caller asked for it explicitly.
  const authority = object.authority;
  if (
    authority &&
    PROTECTED_AUTHORITIES.includes(authority) &&
    options.previousAuthority !== authority &&
    !options.allowPromotion
  ) {
    throw new WriteDeniedError(
      `Refusing to write ${object.id} with authority "${authority}". Promotion to canonical or approved is an ` +
        `explicit governance act — pass --promote (CLI) or allowPromotion: true (SDK) if that is what you mean.`
    );
  }
}

/** Front matter plus body for prose; a YAML document for structured content. */
export function renderObject(object: ContextObject): string {
  const { content, ...meta } = object;

  if (typeof content === "string") {
    const frontMatter = toYaml(stripUndefined(meta), { lineWidth: 100 }).trimEnd();
    return `---\n${frontMatter}\n---\n\n${content.trimEnd()}\n`;
  }

  return toYaml(stripUndefined(object), { lineWidth: 100 });
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Where a new object lands.
 *
 * The collection whose id prefix matches wins, so `policy.refunds` written into
 * a repository with a `policies` collection lands beside the other policies.
 */
function defaultFileFor(store: ContextStore, object: ContextObject): string {
  const [head] = object.id.split(".");

  for (const [key, specOrGlob] of Object.entries(store.manifest.collections ?? {})) {
    if (key !== head && !object.id.startsWith(`${key}.`)) continue;
    const source = typeof specOrGlob === "string" ? specOrGlob : specOrGlob.source;
    const base = source.replace(/^\.\//, "").replace(/\/?\*+.*$/, "");
    const rest = object.id.startsWith(`${key}.`) ? object.id.slice(key.length + 1) : object.id;
    return `${base}/${rest.split(".").join("/")}.md`;
  }

  return `context/${object.id.split(".").join("/")}.md`;
}

function nextVersionFile(current: LoadedObject, version: number): string {
  const file = current.file ?? `context/${current.object.id.split(".").join("/")}.md`;
  const match = /^(.*?)(?:\.v\d+)?(\.[a-z]+)$/i.exec(file);
  if (!match) return `${file}.v${version}`;
  return `${match[1]}.v${version}${match[2]}`;
}

/** Ensure a resolved path is inside the context root. Re-exported for adapter authors. */
export function assertInsideRoot(root: string, target: string): string {
  return resolve(resolveInside(root, target));
}
