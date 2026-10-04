/**
 * Everything the runner keeps on disk, under one directory only the principal
 * can read: `$LOGICSRC_ERRAND_HOME`, else `$XDG_DATA_HOME/logicsrc/errand`,
 * else `~/.local/share/logicsrc/errand`.
 *
 * | Path | What |
 * | --- | --- |
 * | `throttle.json` | The attempt ledger and lockouts. |
 * | `approvals.json` | The SHA-256 of each errand file last run, by errand name. |
 * | `runs/<at>-<name>.json` | One run record per run. No input values, ever. |
 * | `pages/<name>.jsonl` | The page log: fields (never values) and result-page text. |
 * | `profiles/<host>/` | One Chrome profile per site, kept between runs. |
 * | `codes/<name>.code` | Where a one-time code may be written by whoever holds the phone. |
 * | `credentials/<name>.env` | Credentials, when the errand names no vault (0600). |
 *
 * Files are 0600 and directories 0700.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { emptyLedger, type Ledger } from "./throttle.js";

export type Env = Record<string, string | undefined>;

export function errandHome(env: Env = process.env): string {
  if (env.LOGICSRC_ERRAND_HOME) return env.LOGICSRC_ERRAND_HOME;
  const data = env.XDG_DATA_HOME || join(env.HOME || homedir(), ".local", "share");
  return join(data, "logicsrc", "errand");
}

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return path;
}

/** Write via a temp file and rename, so a crash never leaves half a ledger. */
export function writePrivate(path: string, text: string): void {
  ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, path);
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export class Store {
  readonly home: string;

  constructor(home: string) {
    this.home = home;
  }

  static fromEnv(env: Env = process.env): Store {
    return new Store(errandHome(env));
  }

  path(...parts: string[]): string {
    return join(this.home, ...parts);
  }

  loadLedger(): Ledger {
    const ledger = readJson<Ledger>(this.path("throttle.json"), emptyLedger());
    return { attempts: ledger.attempts ?? [], lockedUntil: ledger.lockedUntil ?? {} };
  }

  saveLedger(ledger: Ledger): void {
    writePrivate(this.path("throttle.json"), `${JSON.stringify(ledger, null, 2)}\n`);
  }

  approvals(): Record<string, { sha256: string; file: string; at: string }> {
    return readJson(this.path("approvals.json"), {});
  }

  approve(name: string, sha256: string, file: string, at: Date): void {
    const all = this.approvals();
    all[name] = { sha256, file, at: at.toISOString() };
    writePrivate(this.path("approvals.json"), `${JSON.stringify(all, null, 2)}\n`);
  }

  pageLog(name: string): string {
    return this.path("pages", `${name}.jsonl`);
  }

  appendPageLog(name: string, line: unknown): void {
    const file = this.pageLog(name);
    ensureDir(dirname(file));
    appendFileSync(file, `${JSON.stringify(line)}\n`, { mode: 0o600 });
  }

  profile(origin: string): string {
    const host = origin.replace(/^https?:\/\//, "").replace(/[^a-z0-9.-]/gi, "_");
    return ensureDir(this.path("profiles", host));
  }

  codeFile(name: string): string {
    ensureDir(this.path("codes"));
    return this.path("codes", `${name}.code`);
  }

  credentialsFile(name: string): string {
    return this.path("credentials", `${name}.env`);
  }

  downloadsDir(runId: string): string {
    return ensureDir(this.path("downloads", runId));
  }

  saveRun(record: RunRecord): string {
    const file = this.path("runs", `${record.at.replace(/[:.]/g, "-")}-${record.name}.json`);
    writePrivate(file, `${JSON.stringify(record, null, 2)}\n`);
    return file;
  }

  runs(): RunRecord[] {
    const dir = this.path("runs");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => readJson<RunRecord | null>(join(dir, f), null))
      .filter((r): r is RunRecord => r !== null);
  }
}

/** A hand-off card as kept in the run record: built-ins and public inputs only. */
export interface Card {
  id: string;
  title: string;
  open?: string;
  steps: string[];
  command?: string;
  expires_on?: string;
  done?: boolean;
}

/** The record an agent can read after a run. It never holds an input value. */
export interface RunRecord {
  errand: string;
  name: string;
  title: string;
  sha256: string;
  outcome: string;
  kind: "success" | "rejected" | "waiting" | "stopped" | "dry-run";
  reason?: string;
  at: string;
  page?: string;
  candidate?: { year?: number; form: string; field: string; source: string };
  /** The other candidates for a person to choose from after a rejection (no values). */
  others?: Array<{ index: number; year?: number; form: string; field: string; source: string }>;
  handoff?: string;
  card?: Card;
  waiting?: { step: string; what: string; expires_on?: string; resume?: string };
  vault?: string;
  downloads?: string[];
  log: string;
}
