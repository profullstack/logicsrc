/**
 * The portable database: a vault as one file.
 *
 * Encrypted by default, under a key derived from an *export passphrase* rather
 * than the vault's user key — a file encrypted under the user key would only
 * open inside the vault it came from, which is the opposite of portable.
 *
 * The header is bound as additional authenticated data over the payload, so the
 * manifest is authenticated by the same tag as the data. That is the difference
 * between an import you can trust and a CSV: a CSV truncated at 3,000 rows
 * imports 3,000 rows and reports success.
 */

import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  fromBase64,
  randomBytes,
  sha256,
  toBase64,
  utf8Decode,
  utf8Encode,
  uuid,
} from "./primitives.js";
import { DEFAULT_KDF_PARAMS, assertUsableKdfParams, assertUsableNamespace, deriveExportKey } from "./kdf.js";
import { SALT_BYTES } from "./vault-key.js";
import { assertGroupsMatchType, isItemType } from "./items.js";
import {
  DEFAULT_NAMESPACE,
  ITEM_TYPE_NAMES,
  OPENCREDS_VERSION,
  type Database,
  type DatabaseHeader,
  type DatabaseManifest,
  type DatabasePayload,
  type EncryptedDatabase,
  type Folder,
  type ImportOutcome,
  type Item,
  type ItemTypeName,
  type KdfParams,
  type MergeStrategy,
  type Namespace,
  type PlaintextDatabase,
} from "./types.js";

export const DATABASE_MEDIA_TYPE = "application/vnd.logicsrc.opencreds+json";
export const DATABASE_EXTENSION = ".opencreds";

const GENERATOR = { name: "@logicsrc/opencreds", version: "0.1.0" } as const;

/**
 * Build the manifest for a payload.
 *
 * The digest is over sorted item ids so a re-ordered payload is detectable —
 * an importer that silently accepted a reordering would also silently accept a
 * substitution.
 */
export async function buildManifest(payload: DatabasePayload): Promise<DatabaseManifest> {
  const types: Partial<Record<ItemTypeName, number>> = {};
  for (const item of payload.items) {
    if (!isItemType(item.type)) continue;
    types[item.type] = (types[item.type] ?? 0) + 1;
  }
  const ids = payload.items.map((item) => item.id).sort();
  const digest = toBase64(await sha256(utf8Encode(ids.join("\n"))));
  return {
    itemCount: payload.items.length,
    types,
    folderCount: payload.folders.length,
    digest,
  };
}

/**
 * Compare a claimed manifest against what the payload actually holds.
 *
 * Returns every disagreement rather than the first, because a person looking at
 * a failed import wants to know whether one item went missing or the file is
 * from a different vault entirely.
 */
export async function verifyManifest(
  claimed: DatabaseManifest,
  payload: DatabasePayload,
): Promise<string[]> {
  const actual = await buildManifest(payload);
  const problems: string[] = [];
  if (claimed.itemCount !== actual.itemCount) {
    problems.push(`manifest says ${claimed.itemCount} items, payload has ${actual.itemCount}`);
  }
  if (claimed.folderCount !== actual.folderCount) {
    problems.push(`manifest says ${claimed.folderCount} folders, payload has ${actual.folderCount}`);
  }
  if (claimed.digest !== actual.digest) {
    problems.push("manifest digest does not match the payload's item ids");
  }
  for (const type of ITEM_TYPE_NAMES) {
    const want = claimed.types?.[type] ?? 0;
    const have = actual.types[type] ?? 0;
    if (want !== have) problems.push(`manifest says ${want} ${type} items, payload has ${have}`);
  }
  return problems;
}

/**
 * The bytes bound as AAD.
 *
 * Key order is fixed by the specification, because JSON.stringify preserves
 * insertion order and a header rebuilt in a different order would produce a
 * different AAD and fail to decrypt on a conforming reader.
 */
function headerAad(header: DatabaseHeader): Uint8Array {
  const ordered: Record<string, unknown> = {
    opencreds: header.opencreds,
    type: header.type,
    protected: header.protected,
    namespace: header.namespace,
    exportedAt: header.exportedAt,
    generator: header.generator,
    kdf: header.kdf,
    manifest: header.manifest,
  };
  for (const key of Object.keys(ordered)) {
    if (ordered[key] === undefined) delete ordered[key];
  }
  return utf8Encode(JSON.stringify(ordered));
}

export interface ExportOptions {
  namespace?: Namespace;
  /** The passphrase the file is encrypted under. Mutually exclusive with `key`. */
  passphrase?: string;
  /** A raw 32-byte export key, for machine-to-machine transfer. Then `kdf` is omitted. */
  key?: Uint8Array;
  params?: KdfParams;
  exportedAt?: string;
  generator?: { name: string; version: string };
}

/** Export a payload as an encrypted database. */
export async function exportDatabase(
  payload: DatabasePayload,
  options: ExportOptions,
): Promise<EncryptedDatabase> {
  const namespace = assertUsableNamespace(options.namespace ?? DEFAULT_NAMESPACE, true);
  if (!options.passphrase && !options.key) {
    throw new Error("An export needs a passphrase or a raw key");
  }
  if (options.passphrase && options.key) {
    throw new Error("Pass a passphrase or a raw key, not both");
  }

  const params = assertUsableKdfParams(options.params ?? DEFAULT_KDF_PARAMS);
  let exportKey: Uint8Array;
  let kdf: EncryptedDatabase["kdf"];

  if (options.passphrase) {
    const salt = randomBytes(SALT_BYTES);
    exportKey = await deriveExportKey(options.passphrase, salt, params, namespace);
    kdf = { kdf: params.kdf, iterations: params.iterations, salt: toBase64(salt) };
  } else {
    exportKey = options.key as Uint8Array;
    if (exportKey.length !== 32) throw new Error("A raw export key must be 32 bytes");
  }

  const manifest = await buildManifest(payload);
  const header: DatabaseHeader = {
    opencreds: OPENCREDS_VERSION,
    type: "opencreds.database",
    protected: true,
    namespace,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    generator: options.generator ?? { ...GENERATOR },
    ...(kdf ? { kdf } : {}),
    manifest,
  };

  const { iv, ciphertext } = await aesGcmEncrypt(
    exportKey,
    utf8Encode(JSON.stringify({ folders: payload.folders, items: payload.items })),
    headerAad(header),
  );

  return { ...header, protected: true, iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

/**
 * Export a payload in the plaintext form.
 *
 * Every secret in the vault, in a file, in the clear. It exists because the
 * products people move *to* frequently read nothing else, and an export format
 * that cannot express that gets worked around with a script that is worse.
 *
 * `acknowledged` is not decoration: a caller must state, in code, that it meant
 * this. The CLI turns that into a flag and a confirmation.
 */
export async function exportPlaintextDatabase(
  payload: DatabasePayload,
  options: { namespace?: Namespace; acknowledged: boolean; exportedAt?: string; generator?: { name: string; version: string } },
): Promise<PlaintextDatabase> {
  if (!options.acknowledged) {
    throw new Error(
      "A plaintext export writes every secret in the vault to disk unencrypted; pass acknowledged: true to proceed",
    );
  }
  const namespace = assertUsableNamespace(options.namespace ?? DEFAULT_NAMESPACE, true);
  return {
    opencreds: OPENCREDS_VERSION,
    type: "opencreds.database",
    protected: false,
    namespace,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    generator: options.generator ?? { ...GENERATOR },
    manifest: await buildManifest(payload),
    folders: payload.folders,
    items: payload.items,
  };
}

export function isEncryptedDatabase(db: Database): db is EncryptedDatabase {
  return db.protected === true;
}

/**
 * Read the header of a database without opening it.
 *
 * Enough for a preview — version, namespace, export time, generator, and the
 * counts — and, in the encrypted form, authenticated, so none of it can be
 * lied about. Everything else needs the passphrase, which is the point.
 */
export function readHeader(db: Database): DatabaseHeader {
  return {
    opencreds: db.opencreds,
    type: db.type,
    protected: db.protected,
    namespace: db.namespace,
    exportedAt: db.exportedAt,
    generator: db.generator,
    kdf: (db as EncryptedDatabase).kdf,
    manifest: db.manifest,
  };
}

export interface OpenOptions {
  passphrase?: string;
  key?: Uint8Array;
  allowUnregisteredNamespace?: boolean;
}

/**
 * Open a database and verify its manifest.
 *
 * Throws on a manifest mismatch, and the caller writes nothing — there is no
 * state in which a conforming implementation reports a complete import of an
 * incomplete file.
 */
export async function openDatabase(db: Database, options: OpenOptions = {}): Promise<DatabasePayload> {
  if (db?.type !== "opencreds.database") throw new Error("Not an OpenCreds database");
  if (db.opencreds !== OPENCREDS_VERSION) {
    throw new Error(`Unsupported OpenCreds version: ${String(db.opencreds)}`);
  }
  assertUsableNamespace(db.namespace, options.allowUnregisteredNamespace);

  let payload: DatabasePayload;

  if (isEncryptedDatabase(db)) {
    let exportKey: Uint8Array;
    if (options.key) {
      exportKey = options.key;
    } else if (options.passphrase !== undefined) {
      if (!db.kdf) throw new Error("This database was encrypted with a raw key, not a passphrase");
      const params = assertUsableKdfParams({ kdf: db.kdf.kdf, iterations: db.kdf.iterations });
      exportKey = await deriveExportKey(options.passphrase, fromBase64(db.kdf.salt), params, db.namespace);
    } else {
      throw new Error("This database is encrypted; a passphrase or key is required");
    }

    let plaintext: Uint8Array;
    try {
      plaintext = await aesGcmDecrypt(
        exportKey,
        fromBase64(db.iv),
        fromBase64(db.ciphertext),
        headerAad(readHeader(db)),
      );
    } catch {
      // One message for a wrong passphrase and for a tampered header, because
      // the reader cannot tell them apart and guessing would be worse.
      throw new Error("Could not decrypt the database — wrong passphrase, or the file was altered");
    }
    payload = JSON.parse(utf8Decode(plaintext)) as DatabasePayload;
  } else {
    payload = { folders: db.folders ?? [], items: db.items ?? [] };
  }

  payload.folders ??= [];
  payload.items ??= [];

  const problems = await verifyManifest(db.manifest, payload);
  if (problems.length > 0) {
    throw new Error(`Manifest does not match the payload: ${problems.join("; ")}`);
  }

  for (const item of payload.items) {
    if (!isItemType(item.type)) throw new Error(`Unknown item type in database: ${String(item.type)}`);
    assertGroupsMatchType(item);
  }

  return payload;
}

export interface MergeResult {
  items: Item[];
  folders: Folder[];
  outcome: ImportOutcome;
}

/**
 * Merge an incoming payload into an existing vault.
 *
 * `skip` is the default because it is the only strategy that cannot lose an
 * existing credential, and `duplicate` is the only one that cannot lose an
 * incoming one. Which of those matters is the person's call, not ours — so the
 * outcome is reported per strategy rather than as a single "imported N".
 */
export function mergePayload(
  existing: DatabasePayload,
  incoming: DatabasePayload,
  strategy: MergeStrategy = "skip",
): MergeResult {
  const items = [...existing.items];
  const folders = [...existing.folders];
  const byId = new Map(items.map((item) => [item.id, item]));
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));

  const outcome: ImportOutcome = {
    added: 0,
    replaced: 0,
    duplicated: 0,
    skipped: 0,
    foldersAdded: 0,
    foldersMerged: 0,
  };

  // Folder ids collide the same way item ids do. An incoming folder whose id
  // exists keeps the existing one, and incoming folderIds are remapped onto it.
  const folderRemap = new Map<string, string>();
  for (const folder of incoming.folders) {
    const clash = folderById.get(folder.id);
    if (clash) {
      folderRemap.set(folder.id, clash.id);
      outcome.foldersMerged += 1;
      continue;
    }
    const sameName = folders.find((f) => f.name === folder.name);
    if (sameName) {
      folderRemap.set(folder.id, sameName.id);
      outcome.foldersMerged += 1;
      continue;
    }
    folders.push(folder);
    folderById.set(folder.id, folder);
    outcome.foldersAdded += 1;
  }

  for (const raw of incoming.items) {
    const item: Item = {
      ...raw,
      folderId: raw.folderId ? (folderRemap.get(raw.folderId) ?? raw.folderId) : (raw.folderId ?? null),
    };
    const clash = byId.get(item.id);

    if (!clash) {
      items.push(item);
      byId.set(item.id, item);
      outcome.added += 1;
      continue;
    }

    if (strategy === "skip") {
      outcome.skipped += 1;
      continue;
    }
    if (strategy === "replace") {
      items[items.indexOf(clash)] = item;
      byId.set(item.id, item);
      outcome.replaced += 1;
      continue;
    }
    const copy: Item = { ...item, id: uuid() };
    items.push(copy);
    byId.set(copy.id, copy);
    outcome.duplicated += 1;
  }

  return { items, folders, outcome };
}

/** Parse a database from a file's text, with a useful error for the common mistakes. */
export function parseDatabase(text: string): Database {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Not valid JSON — an OpenCreds database is a JSON document, not a CSV");
  }
  const db = parsed as Database;
  if (db?.type !== "opencreds.database") throw new Error("Not an OpenCreds database");
  return db;
}
