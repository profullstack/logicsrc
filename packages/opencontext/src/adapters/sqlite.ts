/**
 * `sqlite://` adapter — context that already lives in a table.
 *
 * OpenContext is a control plane, not a database: when the truth about pricing
 * lives in an application table, the context object points at it rather than
 * copying it. The URI names the file, the table, and which row and column hold
 * the content:
 *
 *     sqlite://./data/context.db?table=policies&id=refunds&column=body
 *     sqlite://./data/context.db?table=policies&id=refunds&column=body&key=slug
 *
 * Identifiers are validated against the database's own schema before they reach
 * a statement, and the row key is always bound as a parameter — a context file
 * is authored input, and authored input never becomes SQL.
 */

import { createClient, type Client } from "@libsql/client";
import type { Adapter, AdapterContext, AdapterResult } from "../types.js";
import { sha256Uri } from "../digest.js";
import { resolveInside } from "./file.js";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface SqliteTarget {
  file: string;
  table: string;
  column: string;
  key: string;
  id: string;
}

export function parseSqliteUri(uri: string): SqliteTarget {
  const withoutScheme = uri.replace(/^sqlite:\/\//, "");
  const [pathPart, queryPart] = splitOnce(withoutScheme, "?");
  if (!queryPart) {
    throw new Error(
      `Malformed sqlite URI "${uri}". Expected sqlite://<file>?table=<table>&id=<row>&column=<column>.`
    );
  }

  const params = new URLSearchParams(queryPart);
  const table = params.get("table");
  const id = params.get("id");
  const column = params.get("column") ?? "content";
  const key = params.get("key") ?? "id";

  if (!table || !id) {
    throw new Error(`Malformed sqlite URI "${uri}": both table and id are required.`);
  }
  for (const [label, value] of [
    ["table", table],
    ["column", column],
    ["key", key]
  ] as const) {
    if (!IDENTIFIER.test(value)) {
      throw new Error(`Refusing to use "${value}" as a SQL ${label} name in ${uri}.`);
    }
  }

  return { file: decodeURIComponent(pathPart), table, column, key, id };
}

function splitOnce(value: string, separator: string): [string, string | undefined] {
  const index = value.indexOf(separator);
  if (index === -1) return [value, undefined];
  return [value.slice(0, index), value.slice(index + 1)];
}

export const sqliteAdapter: Adapter = {
  name: "sqlite",
  schemes: ["sqlite"],
  remote: false,
  async load(uri: string, ctx: AdapterContext): Promise<AdapterResult> {
    const target = parseSqliteUri(uri);
    const file = resolveInside(ctx.dir, target.file);

    let client: Client | undefined;
    try {
      client = createClient({ url: `file:${file}` });

      // Verify the table and column exist before naming them in a statement.
      // Identifiers cannot be bound as parameters, so the only safe source for
      // them is the database's own catalogue.
      const columns = await client.execute({
        sql: "SELECT name FROM pragma_table_info(?)",
        args: [target.table]
      });
      const names = columns.rows.map((row) => String(row.name));
      if (names.length === 0) {
        throw new Error(`Table "${target.table}" does not exist in ${target.file}.`);
      }
      for (const [label, value] of [
        ["column", target.column],
        ["key", target.key]
      ] as const) {
        if (!names.includes(value)) {
          throw new Error(
            `Column "${value}" (${label}) does not exist on ${target.table}. Available: ${names.join(", ")}.`
          );
        }
      }

      const result = await client.execute({
        sql: `SELECT "${target.column}" AS content FROM "${target.table}" WHERE "${target.key}" = ? LIMIT 1`,
        args: [target.id]
      });

      const row = result.rows[0];
      if (!row) {
        throw new Error(`No row where ${target.key} = "${target.id}" in ${target.table} (${target.file}).`);
      }

      const value = row.content;
      const content = value === null || value === undefined ? "" : String(value);

      return {
        content,
        contentType: looksLikeJson(content) ? "application/json" : "text/markdown",
        digest: sha256Uri(content),
        retrievedAt: new Date().toISOString(),
        // A local database the operator controls is inside the trust boundary,
        // but its rows are frequently written by applications and end users, so
        // the honest default is `verified` rather than `trusted`.
        trust: (ctx.config.trust as AdapterResult["trust"]) ?? "verified"
      };
    } finally {
      client?.close();
    }
  }
};

function looksLikeJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}
