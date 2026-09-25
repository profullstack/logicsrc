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
import { db, run, all, isPostgres } from "./db.mjs";

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
}

// Run directly (npm run migrate) — not when imported by the server.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate()
    .then(() => db.close?.())
    .catch((e) => { console.error(e); process.exit(1); });
}
