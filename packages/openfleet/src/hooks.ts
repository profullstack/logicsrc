/**
 * The Claude Code side of OpenFleet, run from the engine's own hooks.
 *
 * Five hooks, one handler each. SessionStart resolves the record (claim,
 * derive, root, orphan) and hands the member its variables through
 * CLAUDE_ENV_FILE; UserPromptSubmit checks the ceiling with the permission
 * mode the engine reports and writes member.start or refuses the start;
 * PreToolUse keeps an edit inside piece.owns; Stop and SessionEnd write
 * member.end. Exported variables reach the member's tools but not later hook
 * processes, so every hook after the first finds its member through
 * `$OPENFLEET_HOME/sessions/<session_id>.json`.
 *
 * A hook must never throw at the engine: everything is caught, logged to
 * `$OPENFLEET_HOME/hooks.log`, and exits 0, except the one deliberate exit 2
 * that refuses a start.
 */

import { appendFileSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { describeRefusal } from "./ceiling.js";
import { claimOrDerive, endMember, startMember } from "./context.js";
import { approvalsFromFlags, claudeHome } from "./rosters.js";
import {
  claimedBy,
  endOf,
  home as homeOf,
  implicitFleet,
  logHook,
  readJson,
  readLedger,
  readSession,
  writeSession,
  type Env,
  type ImplicitFleet,
  type SessionFile,
} from "./store.js";
import type { Approvals, FleetRecord } from "./types.js";

export interface HookIo {
  env: Env;
  now: () => Date;
  host?: string;
  implicit?: ImplicitFleet;
  /** `/proc/<pid>/environ` as a map, the environment the engine was invoked with; null when unreadable. */
  readProcEnviron: (pid: string) => Record<string, string> | null;
  /** `/proc/<pid>/cmdline` as argv; null when unreadable. */
  readProcCmdline: (pid: string) => string[] | null;
  /** Append to `$CLAUDE_ENV_FILE`. */
  appendFile: (path: string, text: string) => void;
}

export interface HookResult {
  exit: 0 | 2;
  stdout: string;
  stderr: string;
}

const OK: HookResult = { exit: 0, stdout: "", stderr: "" };

function parseNulList(buffer: Buffer): string[] {
  return buffer.toString("utf8").split("\0").filter((part) => part !== "");
}

export function realHookIo(env: Env = process.env): HookIo {
  return {
    env,
    now: () => new Date(),
    readProcEnviron: (pid) => {
      try {
        const out: Record<string, string> = {};
        for (const part of parseNulList(readFileSync(`/proc/${pid}/environ`))) {
          const at = part.indexOf("=");
          if (at > 0) out[part.slice(0, at)] = part.slice(at + 1);
        }
        return out;
      } catch {
        return null;
      }
    },
    readProcCmdline: (pid) => {
      try {
        return parseNulList(readFileSync(`/proc/${pid}/cmdline`));
      } catch {
        return null;
      }
    },
    appendFile: (path, text) => appendFileSync(path, text, "utf8"),
  };
}

interface Payload {
  session_id?: string;
  cwd?: string;
  transcript_path?: string;
  source?: string;
  agent_id?: string;
  permission_mode?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; notebook_path?: string; [key: string]: unknown };
  last_assistant_message?: string;
  background_tasks?: unknown[];
  reason?: string;
  [key: string]: unknown;
}

function parsePayload(text: string): Payload {
  if (!text.trim()) return {};
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === "object" ? (parsed as Payload) : {};
}

/** The engine's child markers (rule 13), in the environment the engine was invoked with. */
export const CHILD_MARKERS = ["CLAUDE_JOB_DIR", "CLAUDE_CODE_CHILD_SESSION", "MOSHCODE_HERD_NAME"] as const;

/** `CLAUDE_JOB_DIR` is this session's own when its basename is the session id's first eight characters. */
export function ownJobDir(env: Env, sessionId: string): string | null {
  const dir = env.CLAUDE_JOB_DIR;
  if (!dir || !sessionId) return null;
  return basename(dir) === sessionId.slice(0, 8) ? dir : null;
}

/** The `SUMMARY:` section of a closing message when it wrote one, else its last 500 characters. */
export function summaryOf(text: string | null | undefined): string | undefined {
  if (typeof text !== "string" || text.trim() === "") return undefined;
  const at = text.search(/^\s*SUMMARY:/m);
  if (at >= 0) return text.slice(at).trim();
  const trimmed = text.trim();
  return trimmed.length > 500 ? trimmed.slice(-500) : trimmed;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** The `export` lines a SessionStart hook hands the member through CLAUDE_ENV_FILE. */
export function exportLines(homeDir: string, session: SessionFile): string {
  const vars: Array<[string, string | null | undefined]> = [
    ["OPENFLEET_HOME", homeDir],
    ["OPENFLEET_RECORD", session.recordPath],
    ["OPENFLEET_FLEET", session.fleet],
    ["OPENFLEET_MEMBER", session.member],
    ["OPENFLEET_SWARM", session.swarm],
  ];
  return vars
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "")
    .map(([name, value]) => `export ${name}=${shellQuote(value)}\n`)
    .join("");
}

export function contextLine(record: FleetRecord): string {
  let line = `OpenFleet: you are member ${record.member} of fleet ${record.fleet}`;
  if (record.piece?.title) line += `, piece ${record.piece.title}`;
  if (record.piece?.owns?.length) line += `, owns ${record.piece.owns.join(", ")}`;
  return line;
}

function stateJson(jobDir: string): { respawnFlags?: unknown; tokens?: unknown; children?: unknown } | null {
  return readJson(join(jobDir, "state.json"));
}

function linksFrom(state: { children?: unknown } | null): unknown[] | undefined {
  if (!state || !Array.isArray(state.children)) return undefined;
  const links = state.children
    .map((child) => (child && typeof child === "object" ? (child as { href?: unknown }).href : undefined))
    .filter((href): href is string => typeof href === "string");
  return links.length ? links : undefined;
}

function totalFrom(state: { tokens?: unknown } | null): string | undefined {
  return state && typeof state.tokens === "number" && Number.isFinite(state.tokens) ? `${state.tokens} tokens` : undefined;
}

// ---------------------------------------------------------------------------
// SessionStart
// ---------------------------------------------------------------------------

export function handleSessionStart(payload: Payload, io: HookIo): HookResult {
  if (payload.agent_id) return OK;
  const sessionId = payload.session_id;
  if (!sessionId) return OK;
  const env = io.env;
  const homeDir = homeOf(env);
  const implicit = io.implicit ?? implicitFleet();
  const host = io.host ?? implicit.host;

  const existing = readSession(homeDir, sessionId);
  if (existing) {
    // A resume, a respawn, or a repeat: the member is the same one, keyed by session id.
    if (existing.refused) return { exit: 0, stdout: `OpenFleet: start refused, ${existing.refused.reason}\n`, stderr: "" };
    if (env.CLAUDE_ENV_FILE) io.appendFile(env.CLAUDE_ENV_FILE, exportLines(homeDir, existing));
    return { exit: 0, stdout: existing.record ? `${contextLine(existing.record)}\n` : "", stderr: "" };
  }

  const jobDir = ownJobDir(env, sessionId);
  const bg = jobDir !== null;
  const engine = env.CLAUDE_CODE_ENTRYPOINT === "sdk-cli" ? "claude-p" : "claude-code";
  const pid = env.CLAUDE_PID;

  let approvals: Approvals = "native";
  if (bg) approvals = approvalsFromFlags(stateJson(jobDir)?.respawnFlags);
  else if (pid) approvals = approvalsFromFlags(io.readProcCmdline(pid) ?? []);

  let orphan = false;
  if (!bg && pid) {
    const invoked = io.readProcEnviron(pid);
    if (invoked) orphan = CHILD_MARKERS.some((marker) => typeof invoked[marker] === "string" && invoked[marker] !== "");
  }

  const cmdline = pid ? io.readProcCmdline(pid) : null;
  const command = cmdline && cmdline.length ? cmdline.join(" ") : "claude";
  const pidNumber = pid && /^\d+$/.test(pid) ? Number(pid) : undefined;

  const resolution = claimOrDerive({
    home: homeDir,
    env,
    now: io.now(),
    host,
    implicit,
    session: {
      id: sessionId,
      engine,
      cwd: payload.cwd ?? process.cwd(),
      ...(pidNumber !== undefined ? { pid: pidNumber } : {}),
      command,
      approvals,
      ...(bg ? { member: basename(jobDir) } : {}),
      orphan,
    },
  });

  if (resolution.kind === "refused") {
    const reason = describeRefusal(resolution.refusal);
    writeSession(homeDir, sessionId, {
      record: null,
      recordPath: null,
      member: resolution.member,
      fleet: resolution.parent.fleet,
      swarm: null,
      last_message: null,
      refused: { key: resolution.refusal.key, reason },
    });
    logHook(homeDir, `SessionStart ${sessionId}: refused, ${reason}`, io.now());
    return { exit: 0, stdout: `OpenFleet: start refused, ${reason}\n`, stderr: "" };
  }

  const record = resolution.record;
  const session: SessionFile = {
    record,
    recordPath: resolution.recordPath,
    member: record.member,
    fleet: record.fleet,
    swarm: record.swarm ?? null,
    last_message: null,
    kind: resolution.kind,
    approvals,
  };
  writeSession(homeDir, sessionId, session);
  if (env.CLAUDE_ENV_FILE) io.appendFile(env.CLAUDE_ENV_FILE, exportLines(homeDir, session));
  return { exit: 0, stdout: `${contextLine(record)}\n`, stderr: "" };
}

// ---------------------------------------------------------------------------
// UserPromptSubmit
// ---------------------------------------------------------------------------

export function handleUserPromptSubmit(payload: Payload, io: HookIo): HookResult {
  if (payload.agent_id) return OK;
  const sessionId = payload.session_id;
  if (!sessionId) return OK;
  const env = io.env;
  const homeDir = homeOf(env);
  const session = readSession(homeDir, sessionId);
  if (!session) return OK;
  if (session.refused) return { exit: 2, stdout: "", stderr: `OpenFleet refused the start: ${session.refused.reason}\n` };
  if (!session.record) return OK;
  const record = session.record;
  if (claimedBy(readLedger(homeDir, record.fleet), record.member)) return OK;

  const approvals: Approvals = payload.permission_mode === "bypassPermissions" ? "bypass" : "native";
  const implicit = io.implicit ?? implicitFleet();
  const result = startMember(homeDir, record, { sessionId, approvals, env, now: io.now(), host: io.host ?? implicit.host, implicit });
  if (result.refused) {
    const reason = describeRefusal(result.refused.refusal);
    writeSession(homeDir, sessionId, { ...session, refused: { key: result.refused.refusal.key, reason } });
    logHook(homeDir, `UserPromptSubmit ${sessionId}: refused, ${reason}`, io.now());
    return { exit: 2, stdout: "", stderr: `OpenFleet refused the start: ${reason}\n` };
  }
  if (result.started) writeSession(homeDir, sessionId, { ...session, record: result.record, approvals });
  return OK;
}

// ---------------------------------------------------------------------------
// PreToolUse
// ---------------------------------------------------------------------------

function globToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i += 1;
        if (pattern[i + 1] === "/") i += 1;
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

/** Does a path relative to the record's cwd fall under one `piece.owns` entry? A directory owns what is under it. */
export function ownsPath(owns: string[], rel: string): boolean {
  const target = rel.replace(/\\/g, "/");
  for (const raw of owns) {
    const pattern = String(raw).replace(/^\.\//, "").replace(/\/+$/, "");
    if (pattern === "") continue;
    if (/[*?]/.test(pattern)) {
      if (globToRegExp(pattern).test(target)) return true;
      continue;
    }
    if (target === pattern || target.startsWith(`${pattern}/`)) return true;
  }
  return false;
}

export function handlePreToolUse(payload: Payload, io: HookIo): HookResult {
  const sessionId = payload.session_id;
  if (!sessionId) return OK;
  const homeDir = homeOf(io.env);
  const session = readSession(homeDir, sessionId);
  const owns = session?.record?.piece?.owns;
  if (!session?.record || !Array.isArray(owns) || owns.length === 0) return OK;
  const filePath = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path;
  if (typeof filePath !== "string" || filePath === "") return OK;
  const cwd = session.record.cwd ?? payload.cwd ?? process.cwd();
  const rel = relative(cwd, resolve(cwd, filePath));
  const outside = rel === "" || rel.startsWith("..") || isAbsolute(rel) || !ownsPath(owns, rel);
  if (!outside) return OK;
  const reason = `outside piece.owns: ${rel || filePath} (member ${session.record.member} owns ${owns.join(", ")})`;
  const decision = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
  return { exit: 0, stdout: `${JSON.stringify(decision)}\n`, stderr: "" };
}

// ---------------------------------------------------------------------------
// Stop and SessionEnd
// ---------------------------------------------------------------------------

export function handleStop(payload: Payload, io: HookIo): HookResult {
  if (payload.agent_id) return OK;
  const sessionId = payload.session_id;
  if (!sessionId) return OK;
  const env = io.env;
  const homeDir = homeOf(env);
  const session = readSession(homeDir, sessionId);
  if (!session) return OK;
  if (typeof payload.last_assistant_message === "string") {
    session.last_message = payload.last_assistant_message;
    writeSession(homeDir, sessionId, session);
  }
  const jobDir = ownJobDir(env, sessionId);
  if (!jobDir || !session.record) return OK;
  if (!Array.isArray(payload.background_tasks) || payload.background_tasks.length > 0) return OK;
  const record = session.record;
  if (endOf(readLedger(homeDir, record.fleet), record.member)) return OK;
  const state = stateJson(jobDir);
  endMember(
    homeDir,
    record.fleet,
    record.member,
    {
      state: "done",
      by: record.member,
      summary: summaryOf(session.last_message),
      links: linksFrom(state),
      total: totalFrom(state),
      now: io.now(),
      host: io.host ?? record.host,
    },
    record.swarm,
  );
  return OK;
}

export function handleSessionEnd(payload: Payload, io: HookIo): HookResult {
  const sessionId = payload.session_id;
  if (!sessionId) return OK;
  const env = io.env;
  const homeDir = homeOf(env);
  const session = readSession(homeDir, sessionId);
  if (!session?.record) return OK;
  // clear, resume and logout hand the same work to another session; only a real exit ends the member.
  if (payload.reason !== undefined && payload.reason !== "other" && payload.reason !== "prompt_input_exit") return OK;
  const record = session.record;
  const lines = readLedger(homeDir, record.fleet);
  if (endOf(lines, record.member)) return OK;
  const jobDir = ownJobDir(env, sessionId);
  const state = jobDir ? stateJson(jobDir) : null;
  endMember(
    homeDir,
    record.fleet,
    record.member,
    {
      state: "done",
      by: record.member,
      summary: summaryOf(session.last_message),
      links: linksFrom(state),
      total: totalFrom(state),
      now: io.now(),
      host: io.host ?? record.host,
    },
    record.swarm,
  );
  return OK;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, (payload: Payload, io: HookIo) => HookResult> = {
  SessionStart: handleSessionStart,
  UserPromptSubmit: handleUserPromptSubmit,
  PreToolUse: handlePreToolUse,
  Stop: handleStop,
  SessionEnd: handleSessionEnd,
};

/** Run one hook over the JSON Claude Code wrote to stdin. Never throws. */
export function runHook(event: string, payloadText: string, io: HookIo): HookResult {
  const homeDir = homeOf(io.env);
  const handler = HANDLERS[event];
  if (!handler) {
    logHook(homeDir, `${event}: no such hook`, io.now());
    return OK;
  }
  let payload: Payload;
  try {
    payload = parsePayload(payloadText);
  } catch (error) {
    logHook(homeDir, `${event}: bad payload: ${(error as Error).message}`, io.now());
    return OK;
  }
  try {
    return handler(payload, io);
  } catch (error) {
    logHook(homeDir, `${event} ${payload.session_id ?? "?"}: ${(error as Error).stack ?? String(error)}`, io.now());
    return OK;
  }
}

/** Where a job's state lives, for callers that want the same path this module reads. */
export function jobStatePath(env: Env, jobId: string): string {
  return join(claudeHome(env), "jobs", jobId, "state.json");
}
