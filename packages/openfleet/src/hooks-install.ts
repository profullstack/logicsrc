/**
 * Claude Code hooks: install, remove, status, over `~/.claude/settings.json`.
 *
 * Three rules, copied from moshcode's herd hooks because they are about being
 * a good guest in someone else's config file:
 *
 *   MERGE, NEVER CLOBBER. The file is the user's and holds their other hooks.
 *   Install extends it; remove takes out only entries whose command is ours.
 *
 *   A HOOK MUST NEVER BREAK AN ENGINE. Every command is guarded so a box with
 *   no `logicsrc` on PATH gets silence, not a failing hook on every turn.
 *
 *   OURS IS MATCHED BY ITS TEXT. The settings schema belongs to the engine; a
 *   marker key we invent is one it may reject. `logicsrc fleet hook` in the
 *   command is marker enough.
 */

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Env } from "./store.js";

export const HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "Stop", "SessionEnd"] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

export interface HookSpec {
  event: HookEvent;
  command: string;
  matcher?: string;
  timeout?: number;
}

const GUARD = "command -v logicsrc >/dev/null 2>&1";

/**
 * The shell command one hook runs.
 *
 * Every event but one ends in `; exit 0`: whatever happened, the engine
 * carries on. UserPromptSubmit is the one hook that must be heard: a start the
 * ceiling refuses exits 2 (rule 5), so its guard is `|| exit 0` and the exit
 * code is the handler's own. SessionStart's stdout is the member's context
 * line, so nothing there is redirected.
 */
export function hookCommand(event: HookEvent): string {
  if (event === "UserPromptSubmit") return `${GUARD} || exit 0; logicsrc fleet hook ${event}`;
  return `${GUARD} && logicsrc fleet hook ${event}; exit 0`;
}

export function hookSpecs(): HookSpec[] {
  return [
    { event: "SessionStart", command: hookCommand("SessionStart") },
    { event: "UserPromptSubmit", command: hookCommand("UserPromptSubmit") },
    { event: "PreToolUse", command: hookCommand("PreToolUse"), matcher: "Edit|Write|MultiEdit|NotebookEdit" },
    { event: "Stop", command: hookCommand("Stop") },
    // SessionEnd hooks share a 1.5 s budget unless one names a longer timeout.
    { event: "SessionEnd", command: hookCommand("SessionEnd"), timeout: 20 },
  ];
}

export function isOurs(entry: unknown): boolean {
  const command = (entry as { command?: unknown } | null)?.command;
  return typeof command === "string" && /\blogicsrc fleet hook\b/.test(command);
}

/** `~/.claude/settings.json`, from `$HOME` so tests can point it elsewhere. */
export function settingsFile(env: Env = process.env): string {
  const base = env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR.trim() !== "" ? env.CLAUDE_CONFIG_DIR : join(env.HOME && env.HOME.trim() !== "" ? env.HOME : homedir(), ".claude");
  return join(base, "settings.json");
}

const SETTINGS_MODE = 0o600;

type Json = Record<string, unknown>;

interface ReadResult {
  ok: boolean;
  present: boolean;
  data: Json;
  error?: string;
}

export function readSettings(file: string): ReadResult {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, present: false, data: {} };
    return { ok: false, present: true, data: {}, error: String((error as Error).message) };
  }
  if (!text.trim()) return { ok: true, present: true, data: {} };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, present: true, data: {}, error: `${file} is not a JSON object` };
    }
    return { ok: true, present: true, data: parsed as Json };
  } catch (error) {
    // A settings file we cannot parse is one we cannot merge into; overwriting
    // it would take every other hook and preference with us.
    return { ok: false, present: true, data: {}, error: `${file} is not valid JSON (${(error as Error).message}): fix it and re-run` };
  }
}

function existingMode(file: string): number {
  try {
    return statSync(file).mode & 0o777;
  } catch {
    return SETTINGS_MODE;
  }
}

export function writeSettings(file: string, data: Json, mode: number): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  // Write-then-rename: a crash mid-write on the engine's own settings file
  // would otherwise leave it truncated.
  const tmp = `${file}.logicsrc-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode });
  renameSync(tmp, file);
}

interface Group {
  matcher?: string;
  hooks?: unknown[];
  [key: string]: unknown;
}

function hooksOf(settings: Json): Record<string, unknown> {
  const hooks = settings.hooks;
  if (hooks && typeof hooks === "object" && !Array.isArray(hooks)) return hooks as Record<string, unknown>;
  const fresh: Record<string, unknown> = {};
  settings.hooks = fresh;
  return fresh;
}

function groupsOf(hooks: Record<string, unknown>, event: string): Group[] {
  if (!Array.isArray(hooks[event])) hooks[event] = [];
  return hooks[event] as Group[];
}

function entryFor(spec: HookSpec): Record<string, unknown> {
  return { type: "command", command: spec.command, ...(spec.timeout !== undefined ? { timeout: spec.timeout } : {}) };
}

function sameEntry(entry: unknown, spec: HookSpec): boolean {
  const e = entry as Record<string, unknown> | null;
  return !!e && e.command === spec.command && (e.timeout ?? undefined) === spec.timeout;
}

type Change = "added" | "updated" | "unchanged";

/** Add or refresh our entry for one event, replacing an older text of ours rather than firing twice. */
function mergeEvent(settings: Json, spec: HookSpec): Change {
  const groups = groupsOf(hooksOf(settings), spec.event);
  for (const group of groups) {
    if (!Array.isArray(group?.hooks)) continue;
    const at = group.hooks.findIndex(isOurs);
    if (at < 0) continue;
    const onlyOurs = group.hooks.length === 1;
    const matcherOk = spec.matcher === undefined ? true : group.matcher === spec.matcher;
    if (sameEntry(group.hooks[at], spec) && matcherOk) return "unchanged";
    group.hooks[at] = entryFor(spec);
    // The matcher is the group's; only touch it when the group is ours alone.
    if (onlyOurs) {
      if (spec.matcher !== undefined) group.matcher = spec.matcher;
      else delete group.matcher;
    }
    return "updated";
  }
  groups.push({ ...(spec.matcher !== undefined ? { matcher: spec.matcher } : {}), hooks: [entryFor(spec)] });
  return "added";
}

/** Take our entries out of one event, leaving structure we did not create alone. */
function pruneEvent(settings: Json, event: string): number {
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) return 0;
  const table = hooks as Record<string, unknown>;
  if (!Array.isArray(table[event])) return 0;
  let removed = 0;
  const kept: Group[] = [];
  for (const group of table[event] as Group[]) {
    if (!Array.isArray(group?.hooks)) {
      kept.push(group);
      continue;
    }
    const before = group.hooks.length;
    const remaining = group.hooks.filter((entry) => !isOurs(entry));
    removed += before - remaining.length;
    // A group that held only our hook goes with it; one that held someone else's stays.
    if (remaining.length === 0 && before > 0) continue;
    kept.push({ ...group, hooks: remaining });
  }
  if (kept.length) table[event] = kept;
  else delete table[event];
  if (Object.keys(table).length === 0) delete settings.hooks;
  return removed;
}

export interface EventStatus {
  event: HookEvent;
  installed: boolean;
  /** Installed with exactly the text this version writes. */
  current: boolean;
}

export interface HooksStatus {
  file: string;
  present: boolean;
  readable: boolean;
  installed: boolean;
  partial: boolean;
  events: EventStatus[];
  error?: string;
}

export function hooksStatus(file: string): HooksStatus {
  const read = readSettings(file);
  const specs = hookSpecs();
  if (!read.ok) {
    return { file, present: read.present, readable: false, installed: false, partial: false, events: specs.map((spec) => ({ event: spec.event, installed: false, current: false })), error: read.error };
  }
  const hooks = read.data.hooks && typeof read.data.hooks === "object" ? (read.data.hooks as Record<string, unknown>) : {};
  const events = specs.map((spec) => {
    const groups = Array.isArray(hooks[spec.event]) ? (hooks[spec.event] as Group[]) : [];
    const found = groups.flatMap((group) => (Array.isArray(group?.hooks) ? group.hooks : [])).filter(isOurs);
    return { event: spec.event, installed: found.length > 0, current: found.some((entry) => sameEntry(entry, spec)) };
  });
  const all = events.every((event) => event.installed && event.current);
  return { file, present: read.present, readable: true, installed: all, partial: events.some((event) => event.installed) && !all, events };
}

export interface InstallResult {
  ok: boolean;
  file: string;
  changes: Array<{ event: HookEvent; change: Change }>;
  written: number;
  error?: string;
}

export function installHooks(file: string, opts: { dryRun?: boolean } = {}): InstallResult {
  const read = readSettings(file);
  if (!read.ok) return { ok: false, file, changes: [], written: 0, error: read.error };
  const settings = read.data;
  const changes = hookSpecs().map((spec) => ({ event: spec.event, change: mergeEvent(settings, spec) }));
  const written = changes.filter((change) => change.change !== "unchanged").length;
  if (!opts.dryRun && written > 0) {
    try {
      writeSettings(file, settings, read.present ? existingMode(file) : SETTINGS_MODE);
    } catch (error) {
      return { ok: false, file, changes, written: 0, error: String((error as Error).message) };
    }
  }
  return { ok: true, file, changes, written };
}

export interface RemoveResult {
  ok: boolean;
  file: string;
  removed: number;
  error?: string;
}

/** Take them out again. Only ever removes commands this module wrote, from any event that holds one. */
export function removeHooks(file: string, opts: { dryRun?: boolean } = {}): RemoveResult {
  const read = readSettings(file);
  if (!read.ok) return { ok: false, file, removed: 0, error: read.error };
  if (!read.present) return { ok: true, file, removed: 0 };
  const settings = read.data;
  const events = new Set<string>([
    ...HOOK_EVENTS,
    ...Object.keys(settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks) ? (settings.hooks as Json) : {}),
  ]);
  let removed = 0;
  for (const event of events) removed += pruneEvent(settings, event);
  if (!opts.dryRun && removed > 0) {
    try {
      writeSettings(file, settings, existingMode(file));
    } catch (error) {
      return { ok: false, file, removed: 0, error: String((error as Error).message) };
    }
  }
  return { ok: true, file, removed };
}
