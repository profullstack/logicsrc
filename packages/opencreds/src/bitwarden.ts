/**
 * Bitwarden JSON import.
 *
 * The JSON export is what Bitwarden's own UI hands you by default, and it is the
 * only one of its formats that keeps folders, custom fields, multiple URIs and
 * full card/identity detail — its CSV drops all of that. Until this existed, any
 * file starting with `{` was assumed to be an OpenCreds database, so a Bitwarden
 * export was rejected with "Not an OpenCreds database" and had to be converted
 * by hand first. It is read natively here.
 */
import { createItem } from "./items.js";
import { expandYear, hostOf } from "./importers.js";
import { MAX_HISTORY_ENTRIES } from "./types.js";
import type {
  CustomField,
  FieldKind,
  Folder,
  HistoryEntry,
  Item,
  ItemUri,
  ParsedImport,
  SkippedRow,
  UriMatch,
} from "./types.js";

/** Bitwarden's numeric item types. */
const BW_TYPE = Object.freeze({ LOGIN: 1, NOTE: 2, CARD: 3, IDENTITY: 4 });

/** Bitwarden's numeric custom-field types, in our vocabulary. */
const BW_FIELD_KIND: Readonly<Record<number, FieldKind>> = Object.freeze({
  0: "text",
  1: "hidden",
  2: "boolean",
  3: "linked",
});

/**
 * Bitwarden's numeric URI match rules, in our vocabulary.
 *
 * `null`/absent means domain, which is also Bitwarden's default. Assuming
 * "domain" for all of them would quietly widen a login pinned to an exact URL.
 */
const BW_URI_MATCH: Readonly<Record<number, UriMatch>> = Object.freeze({
  0: "domain",
  1: "host",
  2: "startsWith",
  3: "exact",
  4: "regex",
  5: "never",
});

interface BitwardenFile {
  encrypted?: boolean;
  folders?: Array<{ id?: string; name?: string }>;
  items?: Array<Record<string, unknown>>;
}

/**
 * Does this JSON look like a Bitwarden export?
 *
 * Deliberately narrow: an `items` array plus either a `folders` array or the
 * `encrypted` flag. An OpenCreds database has neither at its top level, so the
 * two formats never collide.
 */
export function looksLikeBitwardenJson(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const file = value as BitwardenFile;
  if (!Array.isArray(file.items)) return false;
  return Array.isArray(file.folders) || typeof file.encrypted === "boolean";
}

/**
 * Same question, asked of raw text.
 *
 * The caller has a file that starts with "{" and has to decide whether the
 * OpenCreds reader or this one owns it, before either has parsed anything.
 */
export function looksLikeBitwardenText(text: string): boolean {
  // Cheap prefilter: every Bitwarden export has a top-level "items" array, so an
  // OpenCreds database is rejected without paying to parse it.
  if (!text.includes('"items"')) return false;
  try {
    return looksLikeBitwardenJson(JSON.parse(text));
  } catch {
    return false;
  }
}

function str(value: unknown): string {
  if (typeof value === "string") return value;
  return value == null ? "" : String(value);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Adopt Bitwarden's own item id.
 *
 * `createItem` deliberately refuses a caller-supplied id and always mints a
 * fresh one, so this is applied afterwards. Bitwarden ids are already UUIDs, and
 * keeping them is what makes a re-import idempotent: the same export run twice
 * reports its items as already present under "skip" rather than duplicating the
 * whole vault. A value that is not a UUID is ignored rather than trusted.
 */
function adoptId(item: Item, id: string): Item {
  if (UUID_RE.test(id)) item.id = id;
  return item;
}

function bitwardenFields(raw: unknown): CustomField[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomField[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const field = entry as { name?: unknown; value?: unknown; type?: unknown };
    const name = str(field.name);
    const value = str(field.value);
    if (!name && !value) continue;
    const kind = BW_FIELD_KIND[Number(field.type)] ?? "text";
    out.push({
      name,
      value,
      type: kind,
      ...(kind === "hidden" ? { hidden: true } : {}),
    });
  }
  return out;
}

function bitwardenUris(raw: unknown): ItemUri[] {
  if (!Array.isArray(raw)) return [];
  const out: ItemUri[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      if (entry) out.push({ uri: entry, match: "domain" });
      continue;
    }
    const obj = (entry ?? {}) as { uri?: unknown; match?: unknown };
    const uri = str(obj.uri);
    if (!uri) continue;
    // null/absent is Bitwarden's own default of domain.
    const match = obj.match == null ? "domain" : BW_URI_MATCH[Number(obj.match)];
    out.push({ uri, ...(match ? { match } : {}) });
  }
  return out;
}

/**
 * Bitwarden's password history, newest first.
 *
 * `lastUsedDate` is when that password stopped being current, which is our
 * `changedAt`. Capped at the spec's limit rather than carried whole.
 */
function bitwardenHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const h = entry as { password?: unknown; lastUsedDate?: unknown };
    const password = str(h.password);
    if (!password) continue;
    out.push({ password, changedAt: str(h.lastUsedDate) });
  }
  out.sort((a, b) => (a.changedAt < b.changedAt ? 1 : a.changedAt > b.changedAt ? -1 : 0));
  return out.slice(0, MAX_HISTORY_ENTRIES);
}

/**
 * Parse a Bitwarden JSON export into vault items.
 *
 * An encrypted export is refused rather than half-read: its `items` are opaque
 * strings, so a best-effort parse would store ciphertext as if it were a
 * password and the vault would look full of junk that never decrypts.
 */
export function parseBitwardenJson(text: string): ParsedImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      source: null,
      items: [],
      folders: [],
      skipped: [{ row: 0, reason: "Not valid JSON" }],
    };
  }

  if (!looksLikeBitwardenJson(parsed)) {
    return {
      source: null,
      items: [],
      folders: [],
      skipped: [{ row: 0, reason: "Not a Bitwarden export" }],
    };
  }

  const file = parsed as BitwardenFile;
  if (file.encrypted === true) {
    return {
      source: "bitwarden",
      items: [],
      folders: [],
      skipped: [
        {
          row: 0,
          reason:
            "Encrypted Bitwarden export — re-export with encryption turned off",
        },
      ],
    };
  }

  // Bitwarden's own folder ids are kept, so each item's folderId resolves
  // directly and two folders sharing a name stay distinct.
  const folders: Folder[] = [];
  const knownFolderIds = new Set<string>();
  for (const folder of file.folders ?? []) {
    const id = str(folder?.id);
    const name = str(folder?.name).trim();
    if (!id || !name) continue;
    folders.push({ id, name });
    knownFolderIds.add(id);
  }

  const items: Item[] = [];
  const skipped: SkippedRow[] = [];

  (file.items ?? []).forEach((raw, index) => {
    // 1-based, to match how the CSV importer reports a row.
    const row = index + 1;
    if (!raw || typeof raw !== "object") {
      skipped.push({ row, reason: "Not an object" });
      return;
    }

    const folderId = str(raw.folderId);
    // Bitwarden ids are already UUIDs, so carrying them makes a re-import
    // idempotent: the same file run twice reports its items as already present
    // under the "skip" strategy rather than duplicating the whole vault.
    const id = str(raw.id);
    // creationDate/revisionDate are the only record of when a password was last
    // rotated. Restamping them to "now" on import destroys that permanently.
    const createdAt = str(raw.creationDate);
    const updatedAt = str(raw.revisionDate);
    const common = {
      ...(id ? { id } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      name: str(raw.name),
      notes: str(raw.notes),
      favorite: raw.favorite === true,
      folderId: folderId && knownFolderIds.has(folderId) ? folderId : null,
      fields: bitwardenFields(raw.fields),
    };

    const type = Number(raw.type);
    try {
      if (type === BW_TYPE.CARD) {
        const card = (raw.card ?? {}) as Record<string, unknown>;
        items.push(
          adoptId(createItem("card", {
            ...common,
            card: {
              cardholderName: str(card.cardholderName),
              brand: str(card.brand),
              number: str(card.number),
              expMonth: str(card.expMonth),
              expYear: expandYear(str(card.expYear)),
              code: str(card.code),
            },
          } as Partial<Item>), id),
        );
        return;
      }

      if (type === BW_TYPE.IDENTITY) {
        const identity = (raw.identity ?? {}) as Record<string, unknown>;
        items.push(
          adoptId(createItem("identity", {
            ...common,
            identity: {
              title: str(identity.title),
              firstName: str(identity.firstName),
              middleName: str(identity.middleName),
              lastName: str(identity.lastName),
              username: str(identity.username),
              company: str(identity.company),
              email: str(identity.email),
              phone: str(identity.phone),
              address1: str(identity.address1),
              address2: str(identity.address2),
              address3: str(identity.address3),
              city: str(identity.city),
              state: str(identity.state),
              postalCode: str(identity.postalCode),
              country: str(identity.country),
              ssn: str(identity.ssn),
              passportNumber: str(identity.passportNumber),
              licenseNumber: str(identity.licenseNumber),
            },
          } as Partial<Item>), id),
        );
        return;
      }

      if (type === BW_TYPE.NOTE) {
        items.push(adoptId(createItem("note", common as Partial<Item>), id));
        return;
      }

      if (type !== BW_TYPE.LOGIN) {
        skipped.push({ row, reason: `Unknown Bitwarden item type ${str(raw.type)}` });
        return;
      }

      const login = (raw.login ?? {}) as Record<string, unknown>;
      const uris = bitwardenUris(login.uris);
      const history = bitwardenHistory(raw.passwordHistory);
      items.push(
        adoptId(createItem("login", {
          ...common,
          name: common.name || hostOf(uris[0]?.uri ?? ""),
          ...(history.length > 0 ? { history } : {}),
          login: {
            username: str(login.username),
            password: str(login.password),
            totp: str(login.totp),
            uris,
          },
        } as Partial<Item>), id),
      );
    } catch (err) {
      skipped.push({ row, reason: (err as Error).message });
    }
  });

  // Hand back only folders something actually landed in, so importing one item
  // out of a big export does not create sixteen empty folders beside it.
  const used = new Set(
    items.map((item) => item.folderId).filter(Boolean) as string[],
  );
  return {
    source: "bitwarden",
    items,
    folders: folders.filter((folder) => used.has(folder.id)),
    skipped,
  };
}
