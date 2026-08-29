/**
 * The item: creating one, editing one, and putting it in an envelope.
 *
 * Logins, cards, identities, notes, keys and accounts are not six features —
 * they are one record with a `type` and a named field group. Everything the
 * user typed lives inside a single encrypted blob, which is what makes password
 * history free: it is an array in that blob, encrypted by construction rather
 * than needing its own protected table.
 */

import { aesGcmDecrypt, aesGcmEncrypt, fromBase64, toBase64, utf8Decode, utf8Encode, uuid } from "./primitives.js";
import { itemLabel } from "./kdf.js";
import {
  DEFAULT_NAMESPACE,
  ITEM_SCHEMA_VERSION,
  ITEM_TYPE,
  MAX_HISTORY_ENTRIES,
  type AccountGroup,
  type CardGroup,
  type Envelope,
  type IdentityGroup,
  type Item,
  type ItemTypeName,
  type KeyGroup,
  type LoginGroup,
  type Namespace,
} from "./types.js";

/** Empty field groups, so every item has a predictable shape. */
const EMPTY_FIELDS = Object.freeze({
  login: (): LoginGroup => ({ username: "", password: "", totp: "", uris: [] }),
  card: (): CardGroup => ({ cardholderName: "", brand: "", number: "", expMonth: "", expYear: "", code: "" }),
  identity: (): IdentityGroup => ({
    title: "",
    firstName: "",
    middleName: "",
    lastName: "",
    username: "",
    company: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    address3: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    ssn: "",
    passportNumber: "",
    licenseNumber: "",
  }),
  note: (): Record<string, never> => ({}),
  key: (): KeyGroup => ({
    keyType: "",
    algorithm: "",
    publicKey: "",
    privateKey: "",
    passphrase: "",
    fingerprint: "",
    value: "",
    path: "",
    mode: "",
    expiresAt: "",
  }),
  account: (): AccountGroup => ({
    provider: "",
    accountId: "",
    handle: "",
    email: "",
    accessToken: "",
    refreshToken: "",
    tokenType: "",
    scopes: [],
    expiresAt: "",
    environment: "",
  }),
});

/** The group names, so a wrong-group check does not have to hard-code them twice. */
const GROUP_NAMES: readonly ItemTypeName[] = Object.keys(EMPTY_FIELDS) as ItemTypeName[];

export function isItemType(value: unknown): value is ItemTypeName {
  return typeof value === "string" && value in ITEM_TYPE;
}

/**
 * Create an item.
 *
 * The id is generated here, on the client, because it is bound into the
 * ciphertext as additional authenticated data. Storage records this id rather
 * than assigning one.
 */
export function createItem(type: ItemTypeName, fields: Partial<Item> = {}): Item {
  if (!isItemType(type)) throw new Error(`Unknown item type: ${type}`);
  const now = new Date().toISOString();
  const group = EMPTY_FIELDS[type]();
  const incoming = (fields as Record<string, unknown>)[type];

  const item: Item = {
    v: ITEM_SCHEMA_VERSION,
    id: uuid(),
    type,
    name: "",
    favorite: false,
    folderId: null,
    notes: "",
    history: [],
    createdAt: now,
    updatedAt: now,
    ...stripGroups(fields),
  };

  if (type !== "note") {
    (item as Record<string, unknown>)[type] = {
      ...group,
      ...(typeof incoming === "object" && incoming !== null ? incoming : {}),
    };
  }

  return item;
}

/**
 * Copy the top-level fields of a partial item, minus every per-type group and
 * the fields this function owns. Unknown keys pass through: an item written by
 * a later version must survive a round trip here.
 */
function stripGroups(fields: Partial<Item>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (GROUP_NAMES.includes(key as ItemTypeName)) continue;
    if (key === "v" || key === "id") continue;
    out[key] = value;
  }
  return out;
}

/** "an account", "a login". These strings are read by people. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/**
 * Reject an item carrying a group that is not its own type's.
 *
 * A `card` group on a `login` item is either a broken importer or an attempt to
 * smuggle a field past a type-based permission check; neither should be stored.
 */
export function assertGroupsMatchType(item: Item): void {
  for (const name of GROUP_NAMES) {
    if (name === "note") continue;
    if (name !== item.type && (item as Record<string, unknown>)[name] !== undefined) {
      throw new Error(`A ${item.type} item must not carry ${article(name)} ${name} field group`);
    }
  }
}

/**
 * Record a password change in the item's own history.
 *
 * Called before overwriting the password, so the value being replaced is what
 * gets kept. Returns a new item; does not mutate.
 */
export function recordPasswordChange(item: Item, newPassword: string): Item {
  if (item.type !== "login") throw new Error("Only logins have password history");
  const previous = item.login?.password ?? "";
  const history =
    previous && previous !== newPassword
      ? [{ password: previous, changedAt: new Date().toISOString() }, ...(item.history ?? [])]
      : [...(item.history ?? [])];

  return {
    ...item,
    login: { ...(item.login ?? EMPTY_FIELDS.login()), password: newPassword },
    history: history.slice(0, MAX_HISTORY_ENTRIES),
    updatedAt: new Date().toISOString(),
  };
}

/** Apply a partial update, merging the field group rather than replacing it. */
export function updateItem(item: Item, patch: Partial<Item>): Item {
  const group = (patch as Record<string, unknown>)[item.type];
  const next: Item = {
    ...item,
    ...stripGroups(patch),
    updatedAt: new Date().toISOString(),
  };
  if (group && typeof group === "object" && item.type !== "note") {
    (next as Record<string, unknown>)[item.type] = {
      ...((item as Record<string, unknown>)[item.type] as object),
      ...group,
    };
  }
  if (next.history && next.history.length > MAX_HISTORY_ENTRIES) {
    next.history = next.history.slice(0, MAX_HISTORY_ENTRIES);
  }
  assertGroupsMatchType(next);
  return next;
}

/**
 * The additional authenticated data bound to an item's ciphertext.
 *
 * Binding the id means a ciphertext cannot be moved from one row to another
 * without decryption failing — without it, anyone with database write access
 * could swap the ciphertext of a low-value login into a high-value one and
 * watch what the user does next.
 */
function itemAad(namespace: Namespace, id: string, version: number): Uint8Array {
  return utf8Encode(itemLabel(namespace, version, id));
}

export async function encryptItem(
  userKey: Uint8Array,
  item: Item,
  namespace: Namespace = DEFAULT_NAMESPACE,
): Promise<Envelope> {
  if (!item?.id) throw new Error("An item must have an id before it can be encrypted");
  if (!isItemType(item.type)) throw new Error(`Unknown item type: ${item.type}`);
  assertGroupsMatchType(item);

  const version = item.v ?? ITEM_SCHEMA_VERSION;
  const plaintext = utf8Encode(JSON.stringify({ ...item, v: version }));
  const { iv, ciphertext } = await aesGcmEncrypt(userKey, plaintext, itemAad(namespace, item.id, version));

  return {
    id: item.id,
    type: ITEM_TYPE[item.type],
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
  };
}

/**
 * Decrypt a stored envelope.
 *
 * Throws when the key is wrong, the ciphertext was altered, or the row's id
 * does not match the one bound at encryption time.
 */
export async function decryptItem(
  userKey: Uint8Array,
  row: Envelope,
  namespace: Namespace = DEFAULT_NAMESPACE,
): Promise<Item> {
  const version = row.v ?? ITEM_SCHEMA_VERSION;
  let plaintext: Uint8Array;
  try {
    plaintext = await aesGcmDecrypt(
      userKey,
      fromBase64(row.iv),
      fromBase64(row.ciphertext),
      itemAad(namespace, row.id, version),
    );
  } catch {
    throw new Error(`Could not decrypt item ${row.id}`);
  }

  const item = JSON.parse(utf8Decode(plaintext)) as Item;
  if (item.id !== row.id) {
    // Belt and braces: the AAD already makes this unreachable.
    throw new Error(`Item id mismatch for ${row.id}`);
  }
  return item;
}

export interface DecryptResult {
  items: Item[];
  failed: Array<{ id: string; error: string }>;
}

/**
 * Decrypt a page of rows, keeping going when one fails.
 *
 * A single corrupt row must not hide the rest of someone's vault, so failures
 * are collected and returned rather than thrown.
 */
export async function decryptItems(
  userKey: Uint8Array,
  rows: Envelope[],
  namespace: Namespace = DEFAULT_NAMESPACE,
): Promise<DecryptResult> {
  const items: Item[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  for (const row of rows) {
    try {
      items.push(await decryptItem(userKey, row, namespace));
    } catch (err) {
      failed.push({ id: row.id, error: (err as Error).message });
    }
  }
  return { items, failed };
}

/** The field paths that hold a secret, per type. Used for masking and reveal. */
export const SECRET_FIELDS: Readonly<Record<ItemTypeName, readonly string[]>> = Object.freeze({
  login: ["login.password", "login.totp"],
  card: ["card.number", "card.code"],
  identity: ["identity.ssn", "identity.passportNumber", "identity.licenseNumber"],
  note: [],
  key: ["key.privateKey", "key.passphrase", "key.value"],
  account: ["account.accessToken", "account.refreshToken"],
});

/**
 * A copy of an item with every secret replaced by a mask.
 *
 * Used by every display path, including `--json`: a pipeline is not an
 * authorization, and an item that prints its password when redirected to a file
 * is an item that leaks into shell history and CI logs.
 */
export function maskItem(item: Item, mask = "••••••••"): Item {
  const copy = structuredClone(item) as Item;
  for (const path of SECRET_FIELDS[item.type] ?? []) {
    const [group, field] = path.split(".") as [string, string];
    const holder = (copy as Record<string, unknown>)[group] as Record<string, unknown> | undefined;
    if (holder && typeof holder[field] === "string" && holder[field] !== "") holder[field] = mask;
  }
  if (Array.isArray(copy.fields)) {
    copy.fields = copy.fields.map((f) => (f.type === "hidden" && f.value ? { ...f, value: mask } : f));
  }
  if (Array.isArray(copy.history) && copy.history.length > 0) {
    copy.history = copy.history.map((h) => ({ ...h, password: mask }));
  }
  if (Array.isArray(copy.attachments)) {
    copy.attachments = copy.attachments.map(({ key, ...rest }) => (key ? { ...rest, key: mask } : rest));
  }
  return copy;
}

/** Read one field by dotted path, for a deliberate single-value reveal. */
export function readField(item: Item, path: string): string | undefined {
  const parts = path.split(".");
  let cursor: unknown = item;
  for (const part of parts) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === "string" ? cursor : cursor === undefined ? undefined : JSON.stringify(cursor);
}
