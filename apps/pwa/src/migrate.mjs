// Apply SQL migrations in order. Idempotent — tracks applied files in _migrations.
//
// Two copies of every migration exist, one per dialect, with the SAME file
// names: `migrations/` (SQLite, for the local dev/test database) and
// `migrations-pg/` (Postgres, generated with `npx libsql-pg convert-schema`
// and reviewed). The ledger is keyed by file name, so a database copied from
// Turso with `libsql-pg copy` carries its `_migrations` rows across and the
// Postgres side recognises them as applied.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { db, run as appRun, all as appAll, isPostgres, isPostgresUrl } from "./db.mjs";
import { createClient as createPgClient } from "@profullstack/libsql-pg";

// The app connects as a least-privilege role (DML only, append-only audit). DDL
// needs the schema owner, so migrations run on MIGRATE_DATABASE_URL when it is
// set (the owner role), and fall back to the app's own connection otherwise
// (local dev, tests, a single-role setup).
const MIGRATE_URL = process.env.MIGRATE_DATABASE_URL || "";
const migrator = MIGRATE_URL && isPostgresUrl(MIGRATE_URL) ? createPgClient({ url: MIGRATE_URL, dialect: "sqlite" }) : null;
const run = migrator ? (sql, args = []) => migrator.execute({ sql, args }) : appRun;
const all = migrator ? async (sql, args = []) => (await migrator.execute({ sql, args })).rows : appAll;

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.join(HERE, isPostgres ? "migrations-pg" : "migrations");
const DIR = MIGRATIONS_DIR;

export async function migrate() {
  // Bootstrap the tracking table (the first migration also declares it IF NOT EXISTS).
  await run(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`);
  const done = new Set((await all(`SELECT name FROM _migrations`)).map((r) => r.name));

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) { console.log(`· ${file} (already applied)`); continue; }
    const sql = fs.readFileSync(path.join(DIR, file), "utf8");
    // One statement per call (libSQL requires it; the Postgres shim binds per statement) — split on semicolons at line ends.
    const statements = sql.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) await run(stmt);
    await run(`INSERT INTO _migrations (name, applied_at) VALUES (?, ?)`, [file, Date.now()]);
    console.log(`✓ ${file}`);
  }
  console.log("migrations up to date");
  await migrator?.close?.();
}

// Run directly (npm run migrate) — not when imported by the server.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate()
    .then(() => db.close?.())
    .catch((e) => { console.error(e); process.exit(1); });
}
