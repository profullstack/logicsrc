/**
 * Importing from other password managers.
 *
 * Every supported source exports CSV, so the work is one correct CSV reader
 * plus a column mapping per product. The reader is hand-written rather than
 * pulled from a dependency because this runs inside a browser extension's
 * service worker as well as a CLI — and because the failure mode of a sloppy
 * parser here is silently importing half of somebody's passwords.
 *
 * Nothing in this file touches the network or the crypto. It turns text into
 * plain item objects; the caller encrypts them.
 */

import { createItem } from "./items.js";
import { uuid } from "./primitives.js";
import type { Folder, Item, ParsedImport, SkippedRow } from "./types.js";

/**
 * Parse CSV into rows of cells.
 *
 * Handles quoted fields, escaped quotes (`""`), embedded newlines and commas,
 * and both CRLF and LF line endings — all of which appear in real exports,
 * because notes fields contain everything. A naive `split(',')` mangles any
 * export containing a note with a comma in it, which is most of them.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  // Strip a UTF-8 BOM — Chrome and Excel both emit one, and it would otherwise
  // become part of the first header name and break every column lookup.
  const input = String(text || "").replace(/^﻿/, "");

  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\r") {
      i++;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }

    field += char;
    i++;
  }

  // Whatever is buffered when the input ends is the last field, unless the file
  // ended with a newline and there is nothing pending.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Turn rows into objects keyed by header name, lowercased and trimmed so that
 * column-name casing differences between export versions stop mattering.
 */
export function rowsToObjects(rows: string[][]): Array<Record<string, string>> {
  if (rows.length < 2) return [];
  const headers = rows[0]!.map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] ?? "";
    });
    return obj;
  });
}

/** First non-empty value among the given column names. */
function firstOf(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function truthy(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Best-effort hostname, used to name an item whose export had no title. */
function hostOf(uri: string): string {
  if (!uri) return "";
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return uri;
  }
}

/** Two-digit years are expanded to 20xx; a card that expired in 1926 is a typo. */
function expandYear(value: string): string {
  const clean = value.trim();
  if (/^\d{2}$/.test(clean)) return `20${clean}`;
  return clean;
}

/** A folder assigner that reuses an id per name across a whole import. */
function folderAssigner(): { idFor(name: string): string | null; folders: Folder[] } {
  const byName = new Map<string, Folder>();
  return {
    idFor(name: string): string | null {
      const clean = name.trim();
      if (!clean) return null;
      let folder = byName.get(clean);
      if (!folder) {
        folder = { id: uuid(), name: clean };
        byName.set(clean, folder);
      }
      return folder.id;
    },
    get folders() {
      return [...byName.values()];
    },
  };
}

type Mapper = (row: Record<string, string>, folders: ReturnType<typeof folderAssigner>) => Item;

export interface ImportSource {
  label: string;
  detect: (headers: string[]) => boolean;
  map: Mapper;
}

/** Bitwarden: name, login_uri, login_username, login_password, login_totp, notes, type */
function mapBitwardenRow(row: Record<string, string>, folders: ReturnType<typeof folderAssigner>): Item {
  const type = firstOf(row, "type").toLowerCase();
  const common = {
    name: firstOf(row, "name"),
    notes: firstOf(row, "notes"),
    favorite: truthy(firstOf(row, "favorite")),
    folderId: folders.idFor(firstOf(row, "folder")),
  };

  if (type === "card") {
    return createItem("card", {
      ...common,
      card: {
        cardholderName: firstOf(row, "card_cardholdername"),
        brand: firstOf(row, "card_brand"),
        number: firstOf(row, "card_number"),
        expMonth: firstOf(row, "card_expmonth"),
        expYear: expandYear(firstOf(row, "card_expyear")),
        code: firstOf(row, "card_code"),
      },
    } as Partial<Item>);
  }
  if (type === "identity") {
    return createItem("identity", {
      ...common,
      identity: {
        title: firstOf(row, "identity_title"),
        firstName: firstOf(row, "identity_firstname"),
        middleName: firstOf(row, "identity_middlename"),
        lastName: firstOf(row, "identity_lastname"),
        username: firstOf(row, "identity_username"),
        company: firstOf(row, "identity_company"),
        email: firstOf(row, "identity_email"),
        phone: firstOf(row, "identity_phone"),
        address1: firstOf(row, "identity_address1"),
        address2: firstOf(row, "identity_address2"),
        address3: firstOf(row, "identity_address3"),
        city: firstOf(row, "identity_city"),
        state: firstOf(row, "identity_state"),
        postalCode: firstOf(row, "identity_postalcode"),
        country: firstOf(row, "identity_country"),
        ssn: firstOf(row, "identity_ssn"),
        passportNumber: firstOf(row, "identity_passportnumber"),
        licenseNumber: firstOf(row, "identity_licensenumber"),
      },
    } as Partial<Item>);
  }
  if (type === "note" || type === "securenote") {
    return createItem("note", common as Partial<Item>);
  }

  const uri = firstOf(row, "login_uri", "uri");
  return createItem("login", {
    ...common,
    name: common.name || hostOf(uri),
    login: {
      username: firstOf(row, "login_username", "username"),
      password: firstOf(row, "login_password", "password"),
      totp: firstOf(row, "login_totp", "totp"),
      uris: uri ? [{ uri, match: "domain" as const }] : [],
    },
  } as Partial<Item>);
}

/** 1Password: title, url, username, password, otpauth, notes, type */
function mapOnePasswordRow(row: Record<string, string>, folders: ReturnType<typeof folderAssigner>): Item {
  const uri = firstOf(row, "url", "website");
  return createItem("login", {
    name: firstOf(row, "title", "name") || hostOf(uri),
    notes: firstOf(row, "notes", "note"),
    folderId: folders.idFor(firstOf(row, "vault", "tags")),
    login: {
      username: firstOf(row, "username"),
      password: firstOf(row, "password"),
      totp: firstOf(row, "otpauth", "totp"),
      uris: uri ? [{ uri, match: "domain" as const }] : [],
    },
  } as Partial<Item>);
}

/** Chrome: name, url, username, password, note */
function mapChromeRow(row: Record<string, string>): Item {
  const uri = firstOf(row, "url");
  return createItem("login", {
    name: firstOf(row, "name") || hostOf(uri),
    notes: firstOf(row, "note", "notes"),
    login: {
      username: firstOf(row, "username"),
      password: firstOf(row, "password"),
      totp: "",
      uris: uri ? [{ uri, match: "domain" as const }] : [],
    },
  } as Partial<Item>);
}

/**
 * LastPass: url, username, password, totp, extra, name, grouping, fav
 *
 * LastPass writes the literal `http://sn` in `url` for a secure note, which is
 * the only reliable way to tell one from a login in its export.
 */
function mapLastPassRow(row: Record<string, string>, folders: ReturnType<typeof folderAssigner>): Item {
  const uri = firstOf(row, "url");
  const common = {
    name: firstOf(row, "name") || hostOf(uri),
    notes: firstOf(row, "extra", "notes"),
    favorite: truthy(firstOf(row, "fav")),
    folderId: folders.idFor(firstOf(row, "grouping")),
  };
  if (uri === "http://sn" || uri === "http://sn/") {
    return createItem("note", common as Partial<Item>);
  }
  return createItem("login", {
    ...common,
    login: {
      username: firstOf(row, "username"),
      password: firstOf(row, "password"),
      totp: firstOf(row, "totp"),
      uris: uri ? [{ uri, match: "domain" as const }] : [],
    },
  } as Partial<Item>);
}

/** KeePass CSV: "Account","Login Name","Password","Web Site","Comments","Group" */
function mapKeePassRow(row: Record<string, string>, folders: ReturnType<typeof folderAssigner>): Item {
  const uri = firstOf(row, "web site", "url", "website");
  return createItem("login", {
    name: firstOf(row, "account", "title") || hostOf(uri),
    notes: firstOf(row, "comments", "notes"),
    folderId: folders.idFor(firstOf(row, "group")),
    login: {
      username: firstOf(row, "login name", "user name", "username"),
      password: firstOf(row, "password"),
      totp: firstOf(row, "totp", "otp"),
      uris: uri ? [{ uri, match: "domain" as const }] : [],
    },
  } as Partial<Item>);
}

/**
 * Supported sources. Each `detect` looks at the header row, so a person can
 * drop in a file without first telling us where it came from.
 */
export const IMPORT_SOURCES: Readonly<Record<string, ImportSource>> = Object.freeze({
  bitwarden: {
    label: "Bitwarden",
    detect: (headers) => headers.includes("login_uri") || headers.includes("login_password"),
    map: mapBitwardenRow,
  },
  lastpass: {
    label: "LastPass",
    detect: (headers) => headers.includes("grouping") && headers.includes("url"),
    map: mapLastPassRow,
  },
  keepass: {
    label: "KeePass",
    detect: (headers) =>
      (headers.includes("account") && headers.includes("login name")) ||
      (headers.includes("group") && headers.includes("password") && headers.includes("web site")),
    map: mapKeePassRow,
  },
  onepassword: {
    label: "1Password",
    detect: (headers) => headers.includes("url") && headers.includes("username") && headers.includes("type"),
    map: mapOnePasswordRow,
  },
  chrome: {
    label: "Chrome",
    detect: (headers) => headers.includes("url") && headers.includes("username") && headers.includes("password"),
    map: mapChromeRow,
  },
});

/**
 * Identify which product produced an export.
 *
 * Order matters: Chrome's columns are a subset of 1Password's, and LastPass's
 * overlap both, so the more specific detector has to be asked first.
 */
export const DETECT_ORDER: readonly string[] = ["bitwarden", "lastpass", "keepass", "onepassword", "chrome"];

export function detectSource(headers: string[]): string | null {
  for (const key of DETECT_ORDER) {
    if (IMPORT_SOURCES[key]!.detect(headers)) return key;
  }
  return null;
}

/**
 * Parse a CSV export into vault items.
 *
 * A row that cannot be mapped is reported rather than dropped — an import that
 * silently loses credentials is worse than one that says what it could not
 * read, because the person still has the source file and only knows to go back
 * for it if they are told.
 */
export function parseCsvImport(text: string, options: { source?: string } = {}): ParsedImport {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { source: null, items: [], folders: [], skipped: [{ row: 0, reason: "No rows found" }] };
  }

  const headers = rows[0]!.map((h) => h.trim().toLowerCase());
  const detected = options.source || detectSource(headers);

  if (!detected || !IMPORT_SOURCES[detected]) {
    return {
      source: null,
      items: [],
      folders: [],
      skipped: [{ row: 0, reason: "Unrecognised export format" }],
    };
  }

  const { map } = IMPORT_SOURCES[detected]!;
  const objects = rowsToObjects(rows);
  const folders = folderAssigner();
  const items: Item[] = [];
  const skipped: SkippedRow[] = [];

  objects.forEach((row, index) => {
    try {
      const item = map(row, folders);
      // A login with neither a username nor a password carries nothing worth
      // importing, and usually comes from a trailing blank line. That is a
      // different fact from "could not map", and should read differently.
      const isEmptyLogin =
        item.type === "login" && !item.login?.username && !item.login?.password && !item.name;
      if (isEmptyLogin) {
        skipped.push({ row: index + 2, reason: "Empty row" });
        return;
      }
      items.push(item);
    } catch (err) {
      skipped.push({ row: index + 2, reason: (err as Error).message });
    }
  });

  return { source: detected, items, folders: folders.folders, skipped };
}

/** Fields no product's CSV has a column for. Named in the output rather than discovered later. */
export const CSV_LOSSY_FIELDS: readonly string[] = Object.freeze([
  "password history",
  "custom fields",
  "attachments",
  "URI match rules",
  "key items",
  "account items",
]);

const BITWARDEN_COLUMNS = [
  "folder",
  "favorite",
  "type",
  "name",
  "notes",
  "fields",
  "reprompt",
  "login_uri",
  "login_username",
  "login_password",
  "login_totp",
] as const;

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Write a Bitwarden-shaped CSV, because that is the format most other products
 * import best. This is a plaintext export and carries every warning that
 * implies; what it drops is returned rather than left to be discovered.
 */
export function toBitwardenCsv(
  items: Item[],
  folders: Folder[],
): { csv: string; dropped: Record<string, number> } {
  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const dropped: Record<string, number> = {};
  const bump = (what: string, n = 1): void => {
    if (n > 0) dropped[what] = (dropped[what] ?? 0) + n;
  };

  const lines = [BITWARDEN_COLUMNS.join(",")];

  for (const item of items) {
    bump("password history", item.history?.length ?? 0);
    bump("custom fields", item.fields?.length ?? 0);
    bump("attachments", item.attachments?.length ?? 0);

    if (item.type === "key" || item.type === "account") {
      bump(`${item.type} items`, 1);
      continue;
    }
    if (item.type === "card" || item.type === "identity") {
      // Bitwarden's CSV does carry these columns, but a round trip through the
      // login-shaped subset would silently blank them. Report instead.
      bump(`${item.type} items`, 1);
      continue;
    }

    const uri = item.login?.uris?.[0]?.uri ?? "";
    if ((item.login?.uris?.length ?? 0) > 1) bump("extra URIs", item.login!.uris.length - 1);
    if (item.login?.uris?.some((u) => u.match && u.match !== "domain")) bump("URI match rules", 1);

    lines.push(
      [
        csvCell(item.folderId ? (folderName.get(item.folderId) ?? "") : ""),
        item.favorite ? "1" : "",
        item.type === "note" ? "note" : "login",
        csvCell(item.name),
        csvCell(item.notes ?? ""),
        "",
        "",
        csvCell(uri),
        csvCell(item.login?.username ?? ""),
        csvCell(item.login?.password ?? ""),
        csvCell(item.login?.totp ?? ""),
      ].join(","),
    );
  }

  return { csv: `${lines.join("\n")}\n`, dropped };
}
