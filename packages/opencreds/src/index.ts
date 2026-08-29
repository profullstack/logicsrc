/**
 * @logicsrc/opencreds — the OpenCreds reference implementation.
 *
 * OpenCreds is a LogicSRC OpenSpec for credential records and portable vaults:
 * what a credential item is, how a vault is encrypted, and what a vault looks
 * like as a file. It exists because leaving a password manager currently means
 * writing every secret you own to disk in the clear, and losing whatever the
 * spreadsheet had no column for.
 *
 * Nothing in this package sends anything anywhere. There is no account, no
 * server, and no network call — which is what makes "the server cannot read the
 * vault" a property of the code rather than a promise in the marketing copy.
 *
 * Typical use:
 *
 *   const { meta, userKey, recoveryKey } = await createVault(password);
 *   // show recoveryKey to the person, exactly once
 *
 *   const item = createItem("login", { name: "GitHub", login: { username, password } });
 *   const envelope = await encryptItem(userKey, item);   // ciphertext only
 *
 *   const db = await exportDatabase({ folders, items }, { passphrase });
 *   //  ... hand db to another product ...
 *   const payload = await openDatabase(db, { passphrase });  // manifest verified
 *
 * Specification: https://logicsrc.com/opencreds
 */

export {
  IV_BYTES,
  KEY_BYTES,
  MIN_SALT_BYTES,
  randomBytes,
  utf8Encode,
  utf8Decode,
  toBase64,
  fromBase64,
  toHex,
  fromHex,
  timingSafeEqual,
  uuid,
  pbkdf2,
  hkdf,
  sha256,
  aesGcmEncrypt,
  aesGcmDecrypt,
} from "./primitives.js";

export {
  KDF,
  DEFAULT_KDF_PARAMS,
  MIN_PBKDF2_ITERATIONS,
  wrapLabel,
  authLabel,
  recoveryLabel,
  itemLabel,
  databaseLabel,
  assertUsableNamespace,
  assertUsableKdfParams,
  deriveMasterKey,
  deriveWrapKey,
  deriveAuthHash,
  deriveRecoveryWrapKey,
  deriveExportKey,
  deriveAll,
} from "./kdf.js";

export {
  SALT_BYTES,
  RECOVERY_KEY_BYTES,
  formatRecoveryKey,
  parseRecoveryKey,
  createVault,
  createTeamVault,
  assertProfile,
  unlockVault,
  unlockWithRecoveryKey,
  rewrapUserKey,
  resetRecoveryKey,
  type CreatedVault,
} from "./vault-key.js";

export {
  isItemType,
  createItem,
  assertGroupsMatchType,
  recordPasswordChange,
  updateItem,
  encryptItem,
  decryptItem,
  decryptItems,
  maskItem,
  readField,
  SECRET_FIELDS,
  type DecryptResult,
} from "./items.js";

export {
  DATABASE_MEDIA_TYPE,
  DATABASE_EXTENSION,
  buildManifest,
  verifyManifest,
  exportDatabase,
  exportPlaintextDatabase,
  isEncryptedDatabase,
  readHeader,
  openDatabase,
  mergePayload,
  parseDatabase,
  type ExportOptions,
  type OpenOptions,
  type MergeResult,
} from "./database.js";

export {
  IMPORT_SOURCES,
  DETECT_ORDER,
  CSV_LOSSY_FIELDS,
  parseCsv,
  rowsToObjects,
  detectSource,
  parseCsvImport,
  toBitwardenCsv,
  type ImportSource,
} from "./importers.js";

export {
  validateItem,
  validateDatabase,
  validateDocument,
  hasErrors,
  formatDiagnostics,
  looksLikeDatabase,
  looksLikeItem,
  type Diagnostic,
} from "./validate.js";

export { createVaultStore, opencredsHome, type VaultStore } from "./store.js";

export { auditEvent, fingerprint, type AuditInput } from "./audit.js";

export {
  runConformance,
  emitFixtures,
  fixturePayload,
  formatReport,
  type ConformanceLevel,
  type ConformanceReport,
  type ConformanceResult,
  type ConformanceStatus,
} from "./conformance.js";

export {
  OPENCREDS_VERSION,
  ITEM_TYPE,
  ITEM_TYPE_NAME,
  ITEM_TYPE_NAMES,
  ITEM_SCHEMA_VERSION,
  MAX_HISTORY_ENTRIES,
  DEFAULT_NAMESPACE,
  REGISTERED_NAMESPACES,
  NAMESPACE_PATTERN,
} from "./types.js";

export type {
  AccountGroup,
  AttachmentRef,
  AuditAction,
  AuditEvent,
  CardGroup,
  CustomField,
  Database,
  DatabaseHeader,
  DatabaseManifest,
  DatabasePayload,
  EncryptedDatabase,
  Envelope,
  FieldKind,
  Folder,
  HistoryEntry,
  IdentityGroup,
  ImportOutcome,
  Item,
  ItemTypeName,
  ItemUri,
  KdfName,
  KdfParams,
  KeyGroup,
  KeyKind,
  LoginGroup,
  MergeStrategy,
  Namespace,
  ParsedImport,
  PlaintextDatabase,
  Profile,
  SkippedRow,
  UriMatch,
  VaultMeta,
} from "./types.js";
