// Database client + a tiny query helper.
//
// Production runs on Postgres through @profullstack/libsql-pg, which keeps the
// @libsql/client surface (execute / batch / rows / rowsAffected) over a `pg`
// pool and rewrites the SQLite idioms in our statements per query, so no
// caller changed when the app left Turso. Development and the test suite keep
// using libSQL itself (a local file or `:memory:`), which is a devDependency.
import fs from "node:fs";
import path from "node:path";
import { createClient as createPgClient } from "@profullstack/libsql-pg";
import { config } from "./config.mjs";

const POSTGRES = /^postgres(ql)?:\/\//i;

/** True when `url` is a Postgres DSN (what production must use). */
export const isPostgresUrl = (url) => POSTGRES.test(url);

/**
 * Fail fast on a database URL the app cannot run on. A missing or non-Postgres
 * URL in production is a deploy error, not a condition to limp along under:
 * there is no fallback to a file database there.
 */
export function assertDatabaseUrl(url = config.db.url, env = config.env) {
  if (isPostgresUrl(url)) return url;
  if (/^libsql:/i.test(url) || /\.turso\.io/i.test(url)) {
    throw new Error(
      "DATABASE_URL must be a postgres:// URL. A libsql:// (Turso) URL was found" +
        (process.env.TURSO_DATABASE_URL ? " in TURSO_DATABASE_URL" : "") +
        "; the app moved to Postgres. Copy the data with `npx libsql-pg copy` and unset TURSO_*.",
    );
  }
  if (env === "production") {
    throw new Error(`DATABASE_URL must be a postgres:// URL in production, got "${url.split(":")[0]}:"`);
  }
  if (url === ":memory:" || url.startsWith("file:")) return url;
  throw new Error(`Unsupported DATABASE_URL "${url.split(":")[0]}:": use postgres://, file: or :memory:`);
}

async function open() {
  const url = assertDatabaseUrl();
  if (isPostgresUrl(url)) return createPgClient({ url, dialect: "sqlite" });

  // Local libSQL for dev and tests only (devDependency, never loaded in production).
  if (url.startsWith("file:")) {
    const dir = path.dirname(path.resolve(config.root, url.slice("file:".length)));
    fs.mkdirSync(dir, { recursive: true });
  }
  const { createClient } = await import("@libsql/client");
  return createClient({ url, authToken: config.db.authToken });
}

export const db = await open();

/** True when the live client talks to Postgres. */
export const isPostgres = isPostgresUrl(config.db.url);

/** Run a statement; returns the raw result. */
export const run = (sql, args = []) => db.execute({ sql, args });

/** First row (or null). */
export async function get(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows[0] ?? null;
}

/** All rows. */
export async function all(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows;
}

/**
 * Run many statements in ONE write transaction — all of them commit, or none
 * do. Needed anywhere a partial write would leave unrecoverable state, e.g.
 * re-keying a vault, where new grants over old ciphertext locks out every
 * member permanently.
 */
export const batch = (statements) => db.batch(statements, "write");
