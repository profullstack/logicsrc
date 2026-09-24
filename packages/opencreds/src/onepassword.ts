/**
 * 1Password's native export (.1pux).
 *
 * The CSV importer has covered 1Password for a while, but .1pux is what
 * 1Password 8's own Export button produces, and it is the only one of its
 * formats that keeps vaults, TOTP secrets, custom sections, password history
 * and the whole of a card or identity. The CSV is a handful of columns.
 *
 * The file is a ZIP holding `export.data`, a single JSON document. Read with the
 * minimal reader in ./zip.ts so this package keeps its one dependency.
 *
 * Not verified against a real 1Password export — the schema below is 1Password's
 * documented 1PUX format and the tests drive it from fixtures. Run with
 * --dry-run first.
 */
import { createHash } from "node:crypto";

import { createItem } from "./items.js";
import { hostOf } from "./importers.js";
import { readZipEntry, looksLikeZip } from "./zip.js";
import { MAX_HISTORY_ENTRIES } from "./types.js";
import type {
  CustomField,
  Folder,
  HistoryEntry,
  Item,
  ItemUri,
  ParsedImport,
  SkippedRow,
} from "./types.js";

/** The entry every .1pux carries. */
const EXPORT_ENTRY = "export.data";

/**
 * 1Password's category uuids. Only the ones we model as a typed item are named;
 * anything else becomes a note carrying its fields, so nothing is dropped.
 */
const CATEGORY = Object.freeze({
  LOGIN: "001",
  CARD: "002",
  NOTE: "003",
  IDENTITY: "004",
  PASSWORD: "005",
});

/** Readable names for the categories that degrade to a note. */
const CATEGORY_LABEL: Readonly<Record<string, string>> = Object.freeze({
  "006": "Document",
  "100": "Software License",
  "101": "Bank Account",
  "102": "Database",
  "103": "Driver License",
  "104": "Outdoor License",
  "105": "Membership",
  "106": "Passport",
  "107": "Rewards Program",
  "108": "Social Security Number",
  "109": "Wireless Router",
  "110": "Server",
  "111": "Email Account",
  "112": "API Credential",
  "113": "Medical Record",
});

function str(value: unknown): string {
  if (typeof value === "string") return value;
  return value == null ? "" : String(value);
}

/**
 * A stable id derived from 1Password's own.
 *
 * 1Password item ids are 26-character base32, not RFC UUIDs, so they cannot be
 * adopted directly. Hashing them into a v5-shaped UUID keeps the useful property
 * — the same export imported twice produces the same ids, so the second run
 * reports its items as already present instead of duplicating the vault.
 */
export function stableUuid(namespace: string, id: string): string {
  const hash = createHash("sha256").update(`${namespace}:${id}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  // Stamp version 5 and the RFC 4122 variant so the result is a well-formed UUID.
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** 1Password stores seconds; everything here speaks ISO. */
function isoFrom(seconds: unknown): string {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(n * 1000).toISOString();
}

/**
 * Flatten a section field's value.
 *
 * `value` is an object with exactly one key naming its type — `{string: "x"}`,
 * `{concealed: "x"}`, `{totp: "otpauth://…"}` and so on. The key is the type, so
 * it is returned alongside the text.
 */
function fieldValue(value: unknown): { kind: string; text: string } {
  if (value == null || typeof value !== "object") return { kind: "string", text: str(value) };
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return { kind: "string", text: "" };
  const [kind, raw] = entries[0]!;

  if (raw && typeof raw === "object") {
    // address is {street, city, state, zip, country}; email is {email_address,…}
    const obj = raw as Record<string, unknown>;
    if (kind === "email") return { kind, text: str(obj.email_address) };
    if (kind === "address") {
      const parts = [obj.street, obj.city, obj.state, obj.zip, obj.country]
        .map(str)
        .filter(Boolean);
      return { kind, text: parts.join(", ") };
    }
    return { kind, text: JSON.stringify(raw) };
  }

  if (kind === "monthYear") {
    // 202801 means January 2028.
    const s = str(raw);
    return { kind, text: s.length === 6 ? `${s.slice(0, 4)}-${s.slice(4)}` : s };
  }
  if (kind === "date") return { kind, text: isoFrom(raw) || str(raw) };
  return { kind, text: str(raw) };
}

interface FlatField {
  id: string;
  title: string;
  kind: string;
  text: string;
}

/** Every section field, flattened, keeping its id so typed items can pick. */
function flattenSections(details: Record<string, unknown>): FlatField[] {
  const sections = details.sections;
  if (!Array.isArray(sections)) return [];
  const out: FlatField[] = [];
  for (const section of sections) {
    const fields = (section as { fields?: unknown })?.fields;
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      const f = field as { id?: unknown; title?: unknown; value?: unknown };
      const { kind, text } = fieldValue(f.value);
      out.push({ id: str(f.id), title: str(f.title), kind, text });
    }
  }
  return out;
}

/** Section fields that no typed group claimed, kept as custom fields. */
function leftoverFields(flat: FlatField[], claimed: Set<string>): CustomField[] {
  const out: CustomField[] = [];
  for (const f of flat) {
    if (claimed.has(f.id)) continue;
    if (!f.text) continue;
    const name = f.title || f.id;
    if (!name) continue;
    out.push({
      name,
      value: f.text,
      type: f.kind === "concealed" ? "hidden" : "text",
      ...(f.kind === "concealed" ? { hidden: true } : {}),
    });
  }
  return out;
}

function pick(flat: FlatField[], ...ids: string[]): string {
  for (const id of ids) {
    const found = flat.find((f) => f.id === id && f.text);
    if (found) return found.text;
  }
  return "";
}

function loginField(details: Record<string, unknown>, designation: string): string {
  const fields = details.loginFields;
  if (!Array.isArray(fields)) return "";
  for (const field of fields) {
    const f = field as { designation?: unknown; value?: unknown };
    if (str(f.designation) === designation) return str(f.value);
  }
  return "";
}

function overviewUris(overview: Record<string, unknown>): ItemUri[] {
  const out: ItemUri[] = [];
  const seen = new Set<string>();
  const push = (uri: string) => {
    if (!uri || seen.has(uri)) return;
    seen.add(uri);
    out.push({ uri, match: "domain" });
  };
  push(str(overview.url));
  const urls = overview.urls;
  if (Array.isArray(urls)) {
    for (const entry of urls) push(str((entry as { url?: unknown })?.url));
  }
  return out;
}

function historyFrom(details: Record<string, unknown>): HistoryEntry[] {
  const raw = details.passwordHistory;
  if (!Array.isArray(raw)) return [];
  const out: HistoryEntry[] = [];
  for (const entry of raw) {
    const h = entry as { value?: unknown; time?: unknown };
    const password = str(h.value);
    if (!password) continue;
    out.push({ password, changedAt: isoFrom(h.time) });
  }
  out.sort((a, b) => (a.changedAt < b.changedAt ? 1 : a.changedAt > b.changedAt ? -1 : 0));
  return out.slice(0, MAX_HISTORY_ENTRIES);
}

/** The TOTP secret, wherever in the sections it ended up. */
function totpFrom(flat: FlatField[]): string {
  return flat.find((f) => f.kind === "totp" && f.text)?.text ?? "";
}

/**
 * Parse a .1pux archive into vault items.
 *
 * Trashed items are left behind: they are deleted as far as the person is
 * concerned, and restoring them into a fresh vault as live entries would be a
 * surprise. They are reported as skipped rather than silently dropped.
 */
export function parseOnePasswordExport(buf: Buffer): ParsedImport {
  let raw: Buffer | null;
  try {
    raw = readZipEntry(buf, EXPORT_ENTRY);
  } catch (err) {
    return {
      source: null,
      items: [],
      folders: [],
      skipped: [{ row: 0, reason: (err as Error).message }],
    };
  }
  if (!raw) {
    return {
      source: null,
      items: [],
      folders: [],
      skipped: [{ row: 0, reason: `No ${EXPORT_ENTRY} in the archive — not a .1pux` }],
    };
  }

  let doc: unknown;
  try {
    doc = JSON.parse(raw.toString("utf8"));
  } catch {
    return {
      source: null,
      items: [],
      folders: [],
      skipped: [{ row: 0, reason: `${EXPORT_ENTRY} is not valid JSON` }],
    };
  }

  const accounts = (doc as { accounts?: unknown })?.accounts;
  if (!Array.isArray(accounts)) {
    return {
      source: null,
      items: [],
      folders: [],
      skipped: [{ row: 0, reason: "Not a 1Password export: no accounts" }],
    };
  }

  const items: Item[] = [];
  const skipped: SkippedRow[] = [];
  const folders: Folder[] = [];
  const folderIds = new Map<string, string>();
  let row = 0;

  // A 1Password vault is the nearest thing it has to a folder.
  const folderFor = (uuid: string, name: string): string | null => {
    const clean = name.trim();
    if (!uuid || !clean) return null;
    let id = folderIds.get(uuid);
    if (!id) {
      id = stableUuid("1password:vault", uuid);
      folderIds.set(uuid, id);
      folders.push({ id, name: clean });
    }
    return id;
  };

  for (const account of accounts) {
    const vaults = (account as { vaults?: unknown })?.vaults;
    if (!Array.isArray(vaults)) continue;

    for (const vault of vaults) {
      const attrs = ((vault as { attrs?: unknown })?.attrs ?? {}) as Record<string, unknown>;
      const folderId = folderFor(str(attrs.uuid), str(attrs.name));
      const vaultItems = (vault as { items?: unknown })?.items;
      if (!Array.isArray(vaultItems)) continue;

      for (const wrapper of vaultItems) {
        row += 1;
        const item = ((wrapper as { item?: unknown })?.item ?? wrapper) as Record<string, unknown>;
        if (!item || typeof item !== "object") {
          skipped.push({ row, reason: "Not an object" });
          continue;
        }
        if (item.trashed === true) {
          skipped.push({ row, reason: "In the 1Password trash" });
          continue;
        }

        const details = (item.details ?? {}) as Record<string, unknown>;
        const overview = (item.overview ?? {}) as Record<string, unknown>;
        const flat = flattenSections(details);
        const category = str(item.categoryUuid);
        const uuid = str(item.uuid);

        const common: Record<string, unknown> = {
          ...(uuid ? { id: stableUuid("1password:item", uuid) } : {}),
          name: str(overview.title),
          notes: str(details.notesPlain),
          favorite: Number(item.favIndex) > 0,
          folderId,
        };
        const createdAt = isoFrom(item.createdAt);
        const updatedAt = isoFrom(item.updatedAt);
        if (createdAt) common.createdAt = createdAt;
        if (updatedAt) common.updatedAt = updatedAt;

        try {
          if (category === CATEGORY.CARD) {
            const claimed = new Set(["cardholder", "type", "ccnum", "cvv", "expiry"]);
            items.push(
              withId(
                createItem("card", {
                  ...common,
                  fields: leftoverFields(flat, claimed),
                  card: {
                    cardholderName: pick(flat, "cardholder"),
                    brand: pick(flat, "type"),
                    number: pick(flat, "ccnum"),
                    expMonth: monthOf(pick(flat, "expiry")),
                    expYear: yearOf(pick(flat, "expiry")),
                    code: pick(flat, "cvv"),
                  },
                } as Partial<Item>),
                common.id as string | undefined,
              ),
            );
            continue;
          }

          if (category === CATEGORY.IDENTITY) {
            const claimed = new Set([
              "firstname", "initial", "lastname", "company", "jobtitle",
              "email", "defphone", "address", "username", "website",
            ]);
            const address = flat.find((f) => f.id === "address");
            items.push(
              withId(
                createItem("identity", {
                  ...common,
                  fields: leftoverFields(flat, claimed),
                  identity: {
                    firstName: pick(flat, "firstname"),
                    middleName: pick(flat, "initial"),
                    lastName: pick(flat, "lastname"),
                    company: pick(flat, "company"),
                    email: pick(flat, "email"),
                    phone: pick(flat, "defphone", "cellphone", "homephone"),
                    username: pick(flat, "username"),
                    address1: address?.text ?? "",
                  },
                } as Partial<Item>),
                common.id as string | undefined,
              ),
            );
            continue;
          }

          if (category === CATEGORY.NOTE) {
            items.push(
              withId(
                createItem("note", {
                  ...common,
                  fields: leftoverFields(flat, new Set()),
                } as Partial<Item>),
                common.id as string | undefined,
              ),
            );
            continue;
          }

          if (category === CATEGORY.LOGIN || category === CATEGORY.PASSWORD) {
            const uris = overviewUris(overview);
            const password =
              category === CATEGORY.PASSWORD
                ? str(details.password) || loginField(details, "password")
                : loginField(details, "password");
            const history = historyFrom(details);
            items.push(
              withId(
                createItem("login", {
                  ...common,
                  name: str(overview.title) || hostOf(uris[0]?.uri ?? ""),
                  fields: leftoverFields(flat, new Set()),
                  ...(history.length > 0 ? { history } : {}),
                  login: {
                    username: loginField(details, "username"),
                    password,
                    totp: totpFrom(flat),
                    uris,
                  },
                } as Partial<Item>),
                common.id as string | undefined,
              ),
            );
            continue;
          }

          // Every other category — passports, licences, servers — becomes a note
          // carrying its fields, so an import never quietly loses one.
          const label = CATEGORY_LABEL[category] ?? `category ${category}`;
          items.push(
            withId(
              createItem("note", {
                ...common,
                notes: [str(details.notesPlain), `(1Password ${label})`]
                  .filter(Boolean)
                  .join("\n\n"),
                fields: leftoverFields(flat, new Set()),
              } as Partial<Item>),
              common.id as string | undefined,
            ),
          );
        } catch (err) {
          skipped.push({ row, reason: (err as Error).message });
        }
      }
    }
  }

  const used = new Set(items.map((i) => i.folderId).filter(Boolean) as string[]);
  return {
    source: "onepassword",
    items,
    folders: folders.filter((f) => used.has(f.id)),
    skipped,
  };
}

/** createItem refuses a caller-supplied id, so it is applied afterwards. */
function withId(item: Item, id?: string): Item {
  if (id) item.id = id;
  return item;
}

/** "2028-01" or "01/2028" → the month alone. */
function monthOf(expiry: string): string {
  const m = expiry.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return String(Number(m[2]));
  const s = expiry.match(/^(\d{1,2})\D(\d{2,4})$/);
  return s ? String(Number(s[1])) : "";
}

/** "2028-01" or "01/2028" → the year alone, four digits. */
function yearOf(expiry: string): string {
  const m = expiry.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return m[1]!;
  const s = expiry.match(/^(\d{1,2})\D(\d{2,4})$/);
  if (!s) return "";
  const y = s[2]!;
  return y.length === 2 ? `20${y}` : y;
}

/** Is this buffer a .1pux? */
export function looksLikeOnePasswordExport(buf: Buffer): boolean {
  if (!looksLikeZip(buf)) return false;
  try {
    return readZipEntry(buf, EXPORT_ENTRY) !== null;
  } catch {
    return false;
  }
}
