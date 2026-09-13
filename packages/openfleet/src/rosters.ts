/**
 * The engine rosters a sysop tool can read (rule 14): Claude Code's
 * `claude agents --json --all` and moshcode's `~/.moshcode/herd/sessions.json`.
 * They add liveness to recorded members and are the only place a member with
 * no record exists. Neither is required; a roster that cannot be read is null
 * and the tree says nothing about liveness for that engine.
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Env } from "./store.js";
import { readJson } from "./store.js";
import type { Approvals, RosterRow, Rosters } from "./types.js";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run a program with an argv array, never a shell string. */
export type Exec = (file: string, args: string[], opts?: { timeoutMs?: number }) => Promise<ExecResult>;

export const realExec: Exec = (file, args, opts = {}) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: opts.timeoutMs ?? 15_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? ((error as NodeJS.ErrnoException & { code?: unknown }).code as number | string | undefined) : 0;
      resolve({
        code: typeof code === "number" ? code : error ? 1 : 0,
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? "") + (error && typeof code !== "number" ? `\n${error.message}` : ""),
      });
    });
  });

function homeDirOf(env: Env): string {
  return env.HOME && env.HOME.trim() !== "" ? env.HOME : homedir();
}

/** Where Claude Code keeps its jobs: `$CLAUDE_CONFIG_DIR`, else `~/.claude`. */
export function claudeHome(env: Env = process.env): string {
  return env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR.trim() !== "" ? env.CLAUDE_CONFIG_DIR : join(homeDirOf(env), ".claude");
}

/** Claude Code's own flags for a job, kept through respawn: the approvals a recordless root ran with (rule 12). */
export function approvalsFromFlags(flags: unknown): Approvals {
  if (!Array.isArray(flags)) return "native";
  const list = flags.map(String);
  if (list.includes("--dangerously-skip-permissions")) return "bypass";
  const at = list.indexOf("--permission-mode");
  if (at >= 0 && list[at + 1] === "bypassPermissions") return "bypass";
  if (list.some((flag) => flag === "--permission-mode=bypassPermissions")) return "bypass";
  return "native";
}

function isoFromMs(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

interface ClaudeRow {
  pid?: number;
  id?: string;
  cwd?: string;
  kind?: string;
  startedAt?: number;
  sessionId?: string;
  name?: string;
  status?: string;
  state?: string;
}

/** `claude agents --json --all`, or null when the CLI is missing or says no. */
export async function claudeRoster(exec: Exec, env: Env = process.env): Promise<RosterRow[] | null> {
  let result: ExecResult;
  try {
    result = await exec("claude", ["agents", "--json", "--all"], { timeoutMs: 10_000 });
  } catch {
    return null;
  }
  if (result.code !== 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return null;
  }
  const rows: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? (Object.values(parsed as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined) ?? []
      : [];
  const out: RosterRow[] = [];
  for (const raw of rows) {
    const row = raw as ClaudeRow;
    if (!row || typeof row.id !== "string") continue;
    const state = readJson<{ respawnFlags?: unknown }>(join(claudeHome(env), "jobs", row.id, "state.json"));
    out.push({
      engine: "claude-code",
      id: row.id,
      ...(row.sessionId ? { sessionId: row.sessionId } : {}),
      ...(row.name ? { name: row.name } : {}),
      ...(row.cwd ? { cwd: row.cwd } : {}),
      ...(row.state ? { state: row.state } : {}),
      approvals: approvalsFromFlags(state?.respawnFlags),
      ...(isoFromMs(row.startedAt) ? { startedAt: isoFromMs(row.startedAt) } : {}),
      ...(typeof row.pid === "number" ? { pid: row.pid } : {}),
    });
  }
  return out;
}

/** The flags moshcode's engines use to skip their own approval prompts. */
const BYPASS_FLAGS = ["--dangerously-skip-permissions", "--dangerously-bypass-approvals-and-sandbox", "--yolo", "--turbo"];

export function carriesBypass(args: unknown): boolean {
  return Array.isArray(args) && args.some((arg) => BYPASS_FLAGS.includes(String(arg)));
}

/** `~/.moshcode/herd/sessions.json` (or `$MOSHCODE_HERD_DIR/sessions.json`). */
export function moshcodeManifestPath(env: Env = process.env): string {
  const dir = env.MOSHCODE_HERD_DIR && env.MOSHCODE_HERD_DIR.trim() !== "" ? env.MOSHCODE_HERD_DIR : join(homeDirOf(env), ".moshcode", "herd");
  return join(dir, "sessions.json");
}

interface MoshcodeMeta {
  engine?: string;
  args?: unknown;
  cwd?: string;
  created?: number;
  agent?: boolean;
  herd?: string;
  fleet?: string;
  swarm?: string;
  member?: string;
  approvals?: string;
}

export async function moshcodeRoster(env: Env = process.env): Promise<RosterRow[] | null> {
  let text: string;
  try {
    text = readFileSync(moshcodeManifestPath(env), "utf8");
  } catch {
    return null;
  }
  let parsed: { sessions?: Record<string, MoshcodeMeta> };
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const sessions = parsed && typeof parsed === "object" && parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {};
  return Object.entries(sessions).map(([name, meta]) => {
    const approvals: Approvals =
      meta.approvals === "bypass" || meta.approvals === "native"
        ? meta.approvals
        : meta.agent === true || carriesBypass(meta.args)
          ? "bypass"
          : "native";
    return {
      engine: `moshcode/${meta.engine ?? "unknown"}`,
      id: name,
      name,
      ...(meta.cwd ? { cwd: meta.cwd } : {}),
      approvals,
      ...(isoFromMs(meta.created) ? { startedAt: isoFromMs(meta.created) } : {}),
      ...(meta.fleet ? { fleet: meta.fleet } : {}),
      ...(meta.swarm ? { swarm: meta.swarm } : {}),
      ...(meta.member ? { member: meta.member } : {}),
    };
  });
}

/** Both rosters, each reading the real thing. */
export function defaultRosters(exec: Exec = realExec, env: Env = process.env): Rosters {
  return {
    claude: () => claudeRoster(exec, env),
    moshcode: () => moshcodeRoster(env),
  };
}

/** Which roster answers for an engine string, so "not listed" can mean "gone" rather than "unknown". */
export function rosterFor(engine: string | undefined): keyof Rosters | null {
  if (engine === "claude-code") return "claude";
  // moshcode names every pane it starts, tmux ones included, in its herd manifest.
  if (engine?.startsWith("moshcode/") || engine === "tmux") return "moshcode";
  return null;
}

/** A Claude Code job id: the first eight hex characters of its session id. */
export const JOB_ID_RE = /^[0-9a-f]{8}$/i;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Can this engine's roster hold the member at all? `claude agents` lists
 * background jobs only, so an interactive or `-p` session (a UUID member with
 * no job id) is never in it and its absence says nothing. moshcode's manifest
 * holds every pane it started. Only a member the roster can hold is "gone"
 * when the roster no longer lists it.
 */
export function rosterHolds(engine: string | undefined, member: string, session: string | undefined): boolean {
  const roster = rosterFor(engine);
  if (roster === null) return false;
  if (roster === "moshcode") return true;
  return JOB_ID_RE.test(member) || (typeof session === "string" && JOB_ID_RE.test(session));
}

/**
 * The job id `claude stop` takes for a claude-code member: the member id of a
 * background job, else the first eight characters of the record's session
 * when that is a session UUID. Null for an interactive session with no job
 * id, which the tool cannot stop. A session equal to the member is the
 * engine's own id echoed back in `member.start`, not a job handle.
 */
export function claudeJobId(member: string, session: string | undefined): string | null {
  if (JOB_ID_RE.test(member)) return member;
  if (typeof session !== "string" || session === member) return null;
  if (JOB_ID_RE.test(session)) return session;
  if (UUID_RE.test(session)) return session.slice(0, 8);
  return null;
}
