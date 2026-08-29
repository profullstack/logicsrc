/**
 * Structural validation with JSON pointers.
 *
 * Deliberately not Ajv. This package runs in a browser extension's service
 * worker, where a schema compiler is both weight and a CSP problem, and the CLI
 * contract asks for one diagnostic per failure pointing at the exact location —
 * which is easier to produce well by hand than to extract from a validator's
 * error objects. `@logicsrc/validators` holds the published JSON Schemas for
 * anyone who wants schema-based validation instead.
 */

import { ITEM_TYPE, ITEM_TYPE_NAMES, MAX_HISTORY_ENTRIES, OPENCREDS_VERSION } from "./types.js";
import { NAMESPACE_PATTERN, REGISTERED_NAMESPACES } from "./types.js";
import type { Database, Item } from "./types.js";

export interface Diagnostic {
  /** JSON pointer into the document. */
  pointer: string;
  message: string;
  severity: "error" | "warning";
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const URI_MATCHES = ["domain", "host", "startsWith", "exact", "regex", "never"];
const FIELD_KINDS = ["text", "hidden", "boolean", "linked"];
const KEY_KINDS = ["ssh", "pgp", "api", "symmetric", "certificate", "env"];
const GROUPS = ["login", "card", "identity", "key", "account"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate one item. `at` is the pointer prefix, e.g. "/items/17". */
export function validateItem(value: unknown, at = ""): Diagnostic[] {
  const out: Diagnostic[] = [];
  const err = (pointer: string, message: string): void => {
    out.push({ pointer: `${at}${pointer}`, message, severity: "error" });
  };

  if (!isObject(value)) {
    return [{ pointer: at || "/", message: "an item must be an object", severity: "error" }];
  }

  if (!Number.isInteger(value.v) || (value.v as number) < 1) {
    err("/v", "missing or invalid item schema version");
  }
  if (typeof value.id !== "string" || !UUID.test(value.id)) {
    err("/id", "id must be a UUID; it is bound into the ciphertext and cannot be reassigned");
  }
  if (typeof value.type !== "string" || !(value.type in ITEM_TYPE)) {
    err("/type", `${JSON.stringify(value.type)} is not one of ${ITEM_TYPE_NAMES.join(", ")}`);
  }
  if (typeof value.name !== "string") err("/name", "name must be a string (it may be empty)");
  for (const field of ["createdAt", "updatedAt"] as const) {
    if (typeof value[field] !== "string" || !TIMESTAMP.test(value[field] as string)) {
      err(`/${field}`, "must be an RFC 3339 timestamp");
    }
  }

  const type = value.type as string;

  // A group belonging to another type is either a broken importer or an attempt
  // to smuggle a field past a type-based permission check.
  for (const group of GROUPS) {
    if (group !== type && value[group] !== undefined) {
      err(`/${group}`, `a ${type} item must not carry a ${group} field group`);
    }
  }

  if (type === "login" && value.login !== undefined) {
    const login = value.login;
    if (!isObject(login)) {
      err("/login", "must be an object");
    } else if (login.uris !== undefined) {
      if (!Array.isArray(login.uris)) {
        err("/login/uris", "must be an array");
      } else {
        login.uris.forEach((uri, i) => {
          if (!isObject(uri)) {
            err(`/login/uris/${i}`, "must be an object");
            return;
          }
          if (typeof uri.uri !== "string") err(`/login/uris/${i}/uri`, "must be a string");
          if (uri.match !== undefined && !URI_MATCHES.includes(uri.match as string)) {
            err(`/login/uris/${i}/match`, `${JSON.stringify(uri.match)} is not a valid match rule`);
          }
        });
      }
    }
  }

  if (type === "key" && isObject(value.key)) {
    const key = value.key;
    if (key.keyType !== undefined && key.keyType !== "" && !KEY_KINDS.includes(key.keyType as string)) {
      err("/key/keyType", `${JSON.stringify(key.keyType)} is not one of ${KEY_KINDS.join(", ")}`);
    }
    if (typeof key.mode === "string" && key.mode !== "" && !/^0?[0-7]{3}$/.test(key.mode)) {
      err("/key/mode", "must be an octal POSIX mode such as \"0600\"");
    }
  }

  if (type === "account" && isObject(value.account) && value.account.scopes !== undefined) {
    if (!Array.isArray(value.account.scopes)) err("/account/scopes", "must be an array of strings");
  }

  if (value.history !== undefined) {
    if (!Array.isArray(value.history)) {
      err("/history", "must be an array");
    } else {
      if (type !== "login" && value.history.length > 0) {
        err("/history", "password history is defined only for login items");
      }
      if (value.history.length > MAX_HISTORY_ENTRIES) {
        err("/history", `history is capped at ${MAX_HISTORY_ENTRIES} entries, found ${value.history.length}`);
      }
      value.history.forEach((entry, i) => {
        if (!isObject(entry) || typeof entry.password !== "string") {
          err(`/history/${i}/password`, "must be a string");
        }
        if (!isObject(entry) || typeof entry.changedAt !== "string" || !TIMESTAMP.test(entry.changedAt)) {
          err(`/history/${i}/changedAt`, "must be an RFC 3339 timestamp");
        }
      });
    }
  }

  if (value.fields !== undefined) {
    if (!Array.isArray(value.fields)) {
      err("/fields", "must be an array");
    } else {
      value.fields.forEach((field, i) => {
        if (!isObject(field)) {
          err(`/fields/${i}`, "must be an object");
          return;
        }
        if (typeof field.name !== "string") err(`/fields/${i}/name`, "must be a string");
        if (typeof field.value !== "string") err(`/fields/${i}/value`, "must be a string");
        if (!FIELD_KINDS.includes(field.type as string)) {
          err(`/fields/${i}/type`, `${JSON.stringify(field.type)} is not one of ${FIELD_KINDS.join(", ")}`);
        }
      });
    }
  }

  if (value.folderId !== undefined && value.folderId !== null && typeof value.folderId !== "string") {
    err("/folderId", "must be a folder id or null");
  }

  return out;
}

/** Validate a database document. Does not decrypt; see openDatabase for that. */
export function validateDatabase(value: unknown): Diagnostic[] {
  const out: Diagnostic[] = [];
  const err = (pointer: string, message: string): void => {
    out.push({ pointer, message, severity: "error" });
  };
  const warn = (pointer: string, message: string): void => {
    out.push({ pointer, message, severity: "warning" });
  };

  if (!isObject(value)) {
    return [{ pointer: "/", message: "a database must be a JSON object", severity: "error" }];
  }
  if (value.type !== "opencreds.database") {
    err("/type", 'must be "opencreds.database"');
  }
  if (value.opencreds !== OPENCREDS_VERSION) {
    err("/opencreds", `unsupported version ${JSON.stringify(value.opencreds)}; this build reads ${OPENCREDS_VERSION}`);
  }
  if (typeof value.namespace !== "string" || !NAMESPACE_PATTERN.test(value.namespace)) {
    err("/namespace", "must match ^[a-z][a-z0-9-]{1,31}$");
  } else if (!REGISTERED_NAMESPACES.includes(value.namespace)) {
    warn("/namespace", `"${value.namespace}" is not a registered namespace; opening it needs an explicit opt-in`);
  }
  if (typeof value.exportedAt !== "string" || !TIMESTAMP.test(value.exportedAt)) {
    err("/exportedAt", "must be an RFC 3339 timestamp");
  }
  if (typeof value.protected !== "boolean") {
    err("/protected", "must be a boolean");
  }

  const manifest = value.manifest;
  if (!isObject(manifest)) {
    err("/manifest", "missing; an OpenCreds database states what it contains and that statement is checked");
  } else {
    if (!Number.isInteger(manifest.itemCount)) err("/manifest/itemCount", "must be an integer");
    if (!Number.isInteger(manifest.folderCount)) err("/manifest/folderCount", "must be an integer");
    if (typeof manifest.digest !== "string") err("/manifest/digest", "must be a base64 SHA-256");
    if (manifest.types !== undefined && !isObject(manifest.types)) {
      err("/manifest/types", "must be an object of type name to count");
    }
  }

  if (value.protected === true) {
    if (typeof value.iv !== "string") err("/iv", "an encrypted database must carry an iv");
    if (typeof value.ciphertext !== "string") err("/ciphertext", "an encrypted database must carry a ciphertext");
    if (value.items !== undefined) err("/items", "an encrypted database must not also state its items in the clear");
    if (value.kdf !== undefined) {
      if (!isObject(value.kdf)) {
        err("/kdf", "must be an object");
      } else {
        if (!Number.isInteger(value.kdf.iterations) || (value.kdf.iterations as number) < 100_000) {
          err("/kdf/iterations", "must be at least 100000");
        }
        if (typeof value.kdf.salt !== "string") err("/kdf/salt", "must be a base64 salt");
      }
    }
  } else if (value.protected === false) {
    if (!Array.isArray(value.items)) {
      err("/items", "a plaintext database must carry its items");
    } else {
      (value.items as unknown[]).forEach((item, i) => {
        out.push(...validateItem(item, `/items/${i}`));
      });
    }
    if (value.iv !== undefined || value.ciphertext !== undefined) {
      err("/ciphertext", "a plaintext database must not carry ciphertext");
    }
    warn("/protected", "this file holds every secret in the vault in the clear");
  }

  if (value.folders !== undefined) {
    if (!Array.isArray(value.folders)) {
      err("/folders", "must be an array");
    } else {
      (value.folders as unknown[]).forEach((folder, i) => {
        if (!isObject(folder)) {
          err(`/folders/${i}`, "must be an object");
          return;
        }
        if (typeof folder.id !== "string" || !UUID.test(folder.id)) err(`/folders/${i}/id`, "must be a UUID");
        if (typeof folder.name !== "string") err(`/folders/${i}/name`, "must be a string");
      });
    }
  }

  return out;
}

/**
 * Validate any OpenCreds document, guessing which kind it is.
 *
 * A person running `opencreds validate` on a file has a file, not a schema
 * name; asking them which kind it is would be asking them the question they
 * came here to answer.
 */
export function validateDocument(value: unknown): { kind: string; diagnostics: Diagnostic[] } {
  if (isObject(value) && value.type === "opencreds.database") {
    return { kind: "database", diagnostics: validateDatabase(value) };
  }
  if (isObject(value) && Array.isArray(value.items)) {
    const diagnostics: Diagnostic[] = [];
    (value.items as unknown[]).forEach((item, i) => diagnostics.push(...validateItem(item, `/items/${i}`)));
    return { kind: "items", diagnostics };
  }
  if (Array.isArray(value)) {
    const diagnostics: Diagnostic[] = [];
    value.forEach((item, i) => diagnostics.push(...validateItem(item, `/${i}`)));
    return { kind: "items", diagnostics };
  }
  return { kind: "item", diagnostics: validateItem(value) };
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

/** Render diagnostics the way the CLI contract specifies: pointer, then message. */
export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return "";
  const width = Math.max(...diagnostics.map((d) => d.pointer.length));
  return diagnostics
    .map((d) => `${d.pointer.padEnd(width)}  ${d.severity === "warning" ? "warning: " : ""}${d.message}`)
    .join("\n");
}

/** A rough type guard for a parsed database, before the deeper checks run. */
export function looksLikeDatabase(value: unknown): value is Database {
  return isObject(value) && value.type === "opencreds.database";
}

export function looksLikeItem(value: unknown): value is Item {
  return isObject(value) && typeof value.type === "string" && value.type in ITEM_TYPE;
}
