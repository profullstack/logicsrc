/**
 * Where the record and the ledger live, and how they are read and written.
 *
 * Everything takes an explicit `home` so tests point at a temp directory and
 * two writers on one box (this package and moshcode) resolve the same paths
 * from the same variable. Files are 0600 and directories 0700: a record names
 * a working directory and a task, and a ledger says what every agent under one
 * account did, so neither is anyone else's business.
 */

import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { basename, dirname, join } from "node:path";
import type { Ceiling, EndState, FleetRecord, LedgerInput, LedgerLine } from "./types.js";

export type Env = Record<string, string | undefined>;

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

/** `$OPENFLEET_HOME`, default `~/.openfleet`. */
export function home(env: Env = process.env): string {
  const fromEnv = env.OPENFLEET_HOME;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv;
  return join(env.HOME && env.HOME.trim() !== "" ? env.HOME : homedir(), ".openfleet");
}

/** This machine's hostname, the `host` every line carries. */
export function thisHost(): string {
  return hostname();
}

/** The account running this process, for the implicit fleet id. */
export function thisUser(): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER ?? process.env.LOGNAME ?? "user";
  }
}

export interface ImplicitFleet {
  id: string;
  sysop: string;
  ceiling: Ceiling;
  host: string;
}

/**
 * The fleet a member belongs to when none was opened: `<user>@<host>`, sysop
 * the same, ceiling depth 1 and this host, and no fleet-level `approvals`
 * (each hand-started root supplies its own).
 */
export function implicitFleet(opts: { user?: string; host?: string } = {}): ImplicitFleet {
  const user = opts.user ?? thisUser();
  const host = opts.host ?? thisHost();
  const id = `${user}@${host}`;
  return { id, sysop: id, ceiling: { depth: 1, hosts: [host] }, host };
}

export function fleetDir(homeDir: string, fleet: string): string {
  return join(homeDir, "fleets", fleet);
}

export function membersDir(homeDir: string, fleet: string): string {
  return join(fleetDir(homeDir, fleet), "members");
}

/** `$OPENFLEET_HOME/fleets/<fleet>/members/<member>.json`. */
export function recordPath(homeDir: string, fleet: string, member: string): string {
  return join(membersDir(homeDir, fleet), `${member}.json`);
}

/** The ledger this host writes. */
export function ledgerPath(homeDir: string, fleet: string): string {
  return join(fleetDir(homeDir, fleet), "ledger.jsonl");
}

function mkdirPrivate(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: DIR_MODE });
}

function writePrivate(path: string, body: string): void {
  mkdirPrivate(dirname(path));
  // Write-then-rename so a reader never sees half a record.
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { encoding: "utf8", mode: FILE_MODE });
  renameSync(tmp, path);
}

export function readJson<T>(path: string): T | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** The record at a path, or null when there is none or it is not JSON. */
export function readRecord(path: string): FleetRecord | null {
  const parsed = readJson<FleetRecord>(path);
  if (!parsed || typeof parsed !== "object") return null;
  if (typeof parsed.fleet !== "string" || typeof parsed.member !== "string") return null;
  return parsed;
}

export class RecordExistsError extends Error {
  constructor(readonly path: string) {
    super(`record already exists: ${path}`);
  }
}

/**
 * Write a member's record. Refuses to overwrite: a record is written once,
 * before the member starts, and never changes after `member.start` (rule 7).
 * Returns the path written.
 */
export function writeRecord(homeDir: string, record: FleetRecord): string {
  const path = recordPath(homeDir, record.fleet, record.member);
  if (existsSync(path)) throw new RecordExistsError(path);
  writePrivate(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

/**
 * Rewrite a record that is still unclaimed. The caller has checked the ledger:
 * a record never changes after `member.start`, but before it the starter may
 * learn something it guessed (a hand-started root's real approvals).
 */
export function replaceUnclaimedRecord(homeDir: string, record: FleetRecord): string {
  const path = recordPath(homeDir, record.fleet, record.member);
  writePrivate(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

/** Every record under a fleet, by member id. */
export function readRecords(homeDir: string, fleet: string): Map<string, FleetRecord> {
  const out = new Map<string, FleetRecord>();
  const dir = membersDir(homeDir, fleet);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names.sort()) {
    if (!name.endsWith(".json")) continue;
    const record = readRecord(join(dir, name));
    if (record) out.set(record.member, record);
  }
  return out;
}

/** The fleets that have a directory under `home`. */
export function listFleets(homeDir: string): string[] {
  try {
    return readdirSync(join(homeDir, "fleets"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Every `ledger*.jsonl` under a fleet: this host's `ledger.jsonl` plus any
 * `ledger.<host>.jsonl` copied in from another host.
 */
export function ledgerPaths(homeDir: string, fleet: string): string[] {
  const dir = fleetDir(homeDir, fleet);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => /^ledger.*\.jsonl$/.test(name))
    .sort()
    .map((name) => join(dir, name));
}

/** ISO 8601 UTC with whole seconds, the way the spec's examples read. */
export function isoNow(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Append one line to this host's ledger for a fleet. Adds `at`, `fleet` and
 * `host`; the caller passes `event` and `by`, because who did it is the one
 * thing this module must not guess. Returns the line as written.
 */
export function append(
  homeDir: string,
  fleet: string,
  input: LedgerInput,
  opts: { now?: Date; host?: string } = {},
): LedgerLine {
  if (!input.by) throw new Error("ledger line needs `by`: sysop or a member id");
  if (!input.event) throw new Error("ledger line needs `event`");
  const { at: givenAt, host: givenHost, event, by, ...rest } = input as LedgerInput & { event: string; by: string };
  // Key order is fixed so every writer's lines read the same way.
  const line: LedgerLine = {
    at: typeof givenAt === "string" ? givenAt : isoNow(opts.now),
    event,
    fleet,
    host: typeof givenHost === "string" ? givenHost : (opts.host ?? thisHost()),
    by,
    ...rest,
  };
  const path = ledgerPath(homeDir, fleet);
  mkdirPrivate(dirname(path));
  appendFileSync(path, `${JSON.stringify(line)}\n`, { encoding: "utf8", mode: FILE_MODE });
  try {
    if ((statSync(path).mode & 0o777) !== FILE_MODE) chmodSync(path, FILE_MODE);
  } catch {
    // A ledger we cannot chmod is still a ledger we appended to.
  }
  return line;
}

function parseLines(text: string): LedgerLine[] {
  const out: LedgerLine[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    try {
      const parsed = JSON.parse(line) as LedgerLine;
      if (parsed && typeof parsed === "object" && typeof parsed.event === "string") out.push(parsed);
    } catch {
      // One bad line must not hide the rest of the ledger.
    }
  }
  return out;
}

/** Every ledger under a fleet, merged and sorted by `at` (stable, so one file's order holds on ties). */
export function readLedger(homeDir: string, fleet: string): LedgerLine[] {
  const lines: LedgerLine[] = [];
  for (const path of ledgerPaths(homeDir, fleet)) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    lines.push(...parseLines(text));
  }
  return lines.map((line, index) => ({ line, index })).sort((a, b) => {
    const byAt = String(a.line.at ?? "").localeCompare(String(b.line.at ?? ""));
    return byAt !== 0 ? byAt : a.index - b.index;
  }).map((entry) => entry.line);
}

type Match = Partial<Record<keyof LedgerLine, unknown>>;

function matches(line: LedgerLine, match: Match): boolean {
  for (const [key, value] of Object.entries(match)) {
    if (value === undefined) continue;
    if (line[key] !== value) return false;
  }
  return true;
}

/** The lines of one event whose keys match, in ledger order. */
export function findEvents(lines: LedgerLine[], event: string, match: Match = {}): LedgerLine[] {
  return lines.filter((line) => line.event === event && matches(line, match));
}

export function hasEvent(lines: LedgerLine[], event: string, match: Match = {}): boolean {
  return lines.some((line) => line.event === event && matches(line, match));
}

/** The `member.start` that claimed a record, or null when the record is unclaimed. */
export function claimedBy(lines: LedgerLine[], member: string): LedgerLine | null {
  return findEvents(lines, "member.start", { member })[0] ?? null;
}

/**
 * The end line that counts for a member: the first written, except `lost`,
 * which a later real end supersedes. Null when the member has not ended.
 */
export function endOf(lines: LedgerLine[], member: string): LedgerLine | null {
  const ends = findEvents(lines, "member.end", { member });
  if (ends.length === 0) return null;
  const real = ends.find((line) => line.state !== "lost");
  return real ?? ends[0];
}

/** The swarm.end for a swarm, or null: one per swarm, never two. */
export function swarmEndOf(lines: LedgerLine[], swarm: string): LedgerLine | null {
  return findEvents(lines, "swarm.end", { swarm })[0] ?? null;
}

export function spawnOf(lines: LedgerLine[], swarm: string): LedgerLine | null {
  return findEvents(lines, "swarm.spawn", { swarm })[0] ?? null;
}

/** Latest `member.spend` total per member under a list of members. */
export function latestSpend(lines: LedgerLine[], member: string): string | undefined {
  const spends = findEvents(lines, "member.spend", { member });
  return spends.length ? spends[spends.length - 1].total : undefined;
}

/**
 * The state a swarm ends with, from its members' end lines: `done` when every
 * member ended `done`, else the first of failed, stopped, budget, timeout found.
 * Null when a member has no end line yet.
 */
export function swarmEndState(ends: Array<LedgerLine | null>): EndState | null {
  if (ends.some((end) => end === null)) return null;
  const states = ends.map((end) => String(end!.state));
  if (states.every((state) => state === "done")) return "done";
  for (const candidate of ["failed", "stopped", "budget", "timeout"] as const) {
    if (states.includes(candidate)) return candidate;
  }
  // Only `lost` members remain: nothing real to report, the closest truth is failed.
  return "failed";
}

/** `$OPENFLEET_HOME/current`: the fleet the account's next root member joins. */
export function currentPath(homeDir: string): string {
  return join(homeDir, "current");
}

export function readCurrent(homeDir: string): string | null {
  try {
    const value = readFileSync(currentPath(homeDir), "utf8").trim();
    return value === "" ? null : value;
  } catch {
    return null;
  }
}

export function writeCurrent(homeDir: string, fleet: string): void {
  writePrivate(currentPath(homeDir), `${fleet}\n`);
}

// ---------------------------------------------------------------------------
// The per-session file the Claude Code hooks key on
// ---------------------------------------------------------------------------
//
// Not part of the spec. `OPENFLEET_*` exported at SessionStart reach the
// member's tools but not later hook processes, so every hook after the first
// looks its member up by session id here.

export interface SessionFile {
  record: FleetRecord | null;
  recordPath: string | null;
  member: string | null;
  fleet: string;
  swarm: string | null;
  last_message: string | null;
  /** Set when the start was refused at the ceiling, with the reason to repeat. */
  refused?: { key: string; reason: string } | null;
  [key: string]: unknown;
}

export function sessionPath(homeDir: string, sessionId: string): string {
  return join(homeDir, "sessions", `${basename(sessionId)}.json`);
}

export function readSession(homeDir: string, sessionId: string): SessionFile | null {
  return readJson<SessionFile>(sessionPath(homeDir, sessionId));
}

export function writeSession(homeDir: string, sessionId: string, session: SessionFile): void {
  writePrivate(sessionPath(homeDir, sessionId), `${JSON.stringify(session, null, 2)}\n`);
}

/** `$OPENFLEET_HOME/hooks.log`: where a hook says what went wrong, since it may not tell the engine. */
export function logHook(homeDir: string, message: string, now: Date = new Date()): void {
  try {
    mkdirPrivate(homeDir);
    appendFileSync(join(homeDir, "hooks.log"), `${isoNow(now)} ${message}\n`, { encoding: "utf8", mode: FILE_MODE });
  } catch {
    // Logging must never be the thing that fails.
  }
}
