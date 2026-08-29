/**
 * OpenCreds 0.1 — the record, the vault, and the portable database.
 *
 * The specification these types implement is `docs/opencreds/spec.md`. Where a
 * comment here explains *why* a shape is what it is, the normative statement is
 * in the spec; this file is the executable half.
 */

/** The version stamped into every item and every database. */
export const OPENCREDS_VERSION = "0.1" as const;

/**
 * Item type names, and the integer codes an implementation may store in
 * plaintext beside the ciphertext so a server can filter and paginate without
 * decrypting.
 *
 * Codes 1-4 are fixed by a deployed vault (MarkSyncr) and MUST NOT be
 * renumbered; 5 and 6 are introduced by OpenCreds. Compatibility is cheaper
 * than elegance.
 */
export const ITEM_TYPE = Object.freeze({
  login: 1,
  card: 2,
  identity: 3,
  note: 4,
  key: 5,
  account: 6,
});

export type ItemTypeName = keyof typeof ITEM_TYPE;

/** Reverse lookup, for turning a stored row back into a name. */
export const ITEM_TYPE_NAME: Readonly<Record<number, ItemTypeName>> = Object.freeze(
  Object.fromEntries(Object.entries(ITEM_TYPE).map(([name, id]) => [id, name])) as Record<number, ItemTypeName>,
);

export const ITEM_TYPE_NAMES: readonly ItemTypeName[] = Object.freeze(
  Object.keys(ITEM_TYPE) as ItemTypeName[],
);

/** Item schema version. A record you cannot identify is a record you cannot migrate. */
export const ITEM_SCHEMA_VERSION = 1;

/**
 * Password history cap. The item blob is rewritten in full on every save, so an
 * uncapped array grows the ciphertext without bound — and the growth is
 * invisible until a sync starts timing out.
 */
export const MAX_HISTORY_ENTRIES = 20;

/** How a stored URI is matched when a client decides where to offer a credential. */
export type UriMatch = "domain" | "host" | "startsWith" | "exact" | "regex" | "never";

export interface ItemUri {
  uri: string;
  match?: UriMatch;
}

export interface LoginGroup {
  username: string;
  password: string;
  /** An `otpauth://` URI where available — a bare seed loses algorithm, digits and period. */
  totp: string;
  uris: ItemUri[];
}

export interface CardGroup {
  cardholderName: string;
  brand: string;
  number: string;
  expMonth: string;
  expYear: string;
  code: string;
}

export interface IdentityGroup {
  title: string;
  firstName: string;
  middleName: string;
  lastName: string;
  username: string;
  company: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  address3: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /** National identity number. Named `ssn` for import compatibility; not US-specific. */
  ssn: string;
  passportNumber: string;
  licenseNumber: string;
}

export type KeyKind = "ssh" | "pgp" | "api" | "symmetric" | "certificate" | "env";

export interface KeyGroup {
  keyType: KeyKind | "";
  algorithm: string;
  publicKey: string;
  privateKey: string;
  passphrase: string;
  /** `SHA256:…` — a public, non-secret identifier. */
  fingerprint: string;
  /** The secret for key types that are one opaque string (api, env, symmetric). */
  value: string;
  /** Where the key belongs on disk. A key at the wrong path is a key nothing finds. */
  path: string;
  /** POSIX mode, octal. A private key restored 0644 is a key ssh refuses to use. */
  mode: string;
  expiresAt: string;
}

export interface AccountGroup {
  provider: string;
  accountId: string;
  handle: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scopes: string[];
  expiresAt: string;
  /** production, sandbox, … A test key and a live key look identical and are not. */
  environment: string;
}

export type FieldKind = "text" | "hidden" | "boolean" | "linked";

export interface CustomField {
  name: string;
  value: string;
  type: FieldKind;
  hidden?: boolean;
}

export interface AttachmentRef {
  id: string;
  name: string;
  size?: number;
  contentType?: string;
  digest?: string;
  /** Base64 AES key, held inside the item ciphertext so the blob store never sees it. */
  key?: string;
}

export interface HistoryEntry {
  password: string;
  changedAt: string;
}

/**
 * One credential record.
 *
 * The index signature is what makes §3.1's "preserve unknown fields" rule
 * implementable: an item written by a later version passes through this one
 * without losing what it did not understand.
 */
export interface Item {
  v: number;
  id: string;
  type: ItemTypeName;
  name: string;
  favorite?: boolean;
  folderId?: string | null;
  notes?: string;
  fields?: CustomField[];
  attachments?: AttachmentRef[];
  history?: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
  login?: LoginGroup;
  card?: CardGroup;
  identity?: IdentityGroup;
  key?: KeyGroup;
  account?: AccountGroup;
  [unknown: string]: unknown;
}

export interface Folder {
  id: string;
  name: string;
}

/** An encrypted item as it is stored. Only id and type are plaintext. */
export interface Envelope {
  id: string;
  type: number;
  ciphertext: string;
  iv: string;
  v?: number;
  revision?: number;
  deletedAt?: string | null;
  purgeAfter?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * The domain-separation label prefix for a vault.
 *
 * Carried as data because labels are compiled into the AAD of every ciphertext
 * a vault has ever written. Editing one does not migrate a vault; it makes it
 * undecryptable.
 */
export type Namespace = string;

export const DEFAULT_NAMESPACE = "opencreds";
export const REGISTERED_NAMESPACES: readonly string[] = Object.freeze(["opencreds", "marksyncr"]);
export const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

/** How the user key is managed. The item envelope is identical under both. */
export type Profile = "user" | "team";

export type KdfName = "pbkdf2-sha256" | "argon2id";

export interface KdfParams {
  kdf: KdfName;
  iterations: number;
  memoryKib?: number;
  parallelism?: number;
}

export interface VaultMeta {
  opencreds: typeof OPENCREDS_VERSION;
  namespace: Namespace;
  profile: Profile;
  kdf: KdfName;
  kdfIterations: number;
  kdfMemoryKib?: number;
  kdfParallelism?: number;
  kdfSalt: string;
  protectedUserKey: string;
  protectedUserKeyIv: string;
  recoveryKeyBlob?: string;
  recoveryKeyIv?: string;
  authHash?: string;
  wrappedKeys?: Array<{ memberId: string; publicKey: string; wrappedKey: string; grantedAt?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface DatabaseManifest {
  itemCount: number;
  types: Partial<Record<ItemTypeName, number>>;
  folderCount: number;
  /** Base64 SHA-256 over sorted item ids joined by "\n". */
  digest: string;
}

export interface DatabaseHeader {
  opencreds: typeof OPENCREDS_VERSION;
  type: "opencreds.database";
  protected: boolean;
  namespace: Namespace;
  exportedAt: string;
  generator?: { name: string; version: string };
  kdf?: { kdf: KdfName; iterations: number; salt: string };
  manifest: DatabaseManifest;
}

export interface EncryptedDatabase extends DatabaseHeader {
  protected: true;
  iv: string;
  ciphertext: string;
}

export interface PlaintextDatabase extends DatabaseHeader {
  protected: false;
  folders: Folder[];
  items: Item[];
}

export type Database = EncryptedDatabase | PlaintextDatabase;

/** The payload a database encrypts, and what a plaintext one carries inline. */
export interface DatabasePayload {
  folders: Folder[];
  items: Item[];
}

/** How an import resolves an id that already exists. */
export type MergeStrategy = "skip" | "replace" | "duplicate";

export interface ImportOutcome {
  added: number;
  replaced: number;
  duplicated: number;
  skipped: number;
  foldersAdded: number;
  foldersMerged: number;
}

export interface SkippedRow {
  row: number;
  reason: string;
}

export interface ParsedImport {
  source: string | null;
  items: Item[];
  folders: Folder[];
  skipped: SkippedRow[];
}

export type AuditAction =
  | "vault.create"
  | "vault.unlock"
  | "vault.unlock_failed"
  | "vault.rekey"
  | "vault.recovery_reset"
  | "item.create"
  | "item.update"
  | "item.delete"
  | "item.restore"
  | "item.purge"
  | "database.export"
  | "database.export_plaintext"
  | "database.import";

export interface AuditEvent {
  type: "opencreds.audit_event";
  id: string;
  action: AuditAction;
  itemId?: string;
  itemType?: ItemTypeName;
  namespace?: Namespace;
  profile?: Profile;
  principal?: { kind?: "user" | "agent" | "service"; id?: string; label?: string };
  fingerprint?: string;
  itemCount?: number;
  dryRun?: boolean;
  outcome?: "succeeded" | "failed" | "refused";
  reason?: string;
  createdAt: string;
}
