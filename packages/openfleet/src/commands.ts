/**
 * `logicsrc fleet`: the sysop's five verbs over `$OPENFLEET_HOME`, plus the
 * Claude Code hook entry points.
 *
 * Every dependency that touches the world (environment, clock, processes,
 * rosters, stdin, stdout) is injectable so the verbs can be tested without a
 * filesystem outside a temp dir and without a single process. Exit codes are
 * set on `process.exitCode`, never through `process.exit`, so a caller that
 * embeds the group keeps control.
 */

import { existsSync } from "node:fs";
import type { Command } from "commander";
import { isNarrower, parseBudget, parseUntil } from "./ceiling.js";
import { endMember, memberCeiling } from "./context.js";
import { flattenMembers, flattenSwarms, fold, renderTree } from "./fold.js";
import { hooksStatus, installHooks, removeHooks, settingsFile } from "./hooks-install.js";
import { realHookIo, runHook, type HookIo } from "./hooks.js";
import { defaultRosters, realExec, type Exec } from "./rosters.js";
import {
  append,
  claimedBy,
  endOf,
  findEvents,
  fleetDir,
  home as homeOf,
  implicitFleet,
  isoNow,
  listFleets,
  readLedger,
  readRecords,
  spawnOf,
  swarmEndOf,
  swarmEndState,
  writeCurrent,
  type Env,
  type ImplicitFleet,
} from "./store.js";
import { slug } from "./swarm.js";
import type { Approvals, Ceiling, EndState, FleetRecord, LedgerLine, Rosters, Tree } from "./types.js";


/** Exit codes: 0 ok, 1 usage, 2 invalid input, 3 not found, 4 refused (the human-only verbs and stop outside reach). */
export const EXIT = { OK: 0, USAGE: 1, INVALID: 2, NOT_FOUND: 3, REFUSED: 4 } as const;

export interface Deps {
  env: Env;
  now: () => Date;
  exec: Exec;
  kill: (pid: number, signal?: NodeJS.Signals) => void;
  rosters: Rosters;
  stdin: () => Promise<string>;
  write: (line: string) => void;
  error: (line: string) => void;
  /** Raw writers for the hook entry point, whose stdout is a contract (a deny decision, a context line). */
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  host?: string;
  user?: string;
  hookIo?: Partial<HookIo>;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      text += chunk;
    });
    process.stdin.on("end", () => resolve(text));
    process.stdin.on("error", () => resolve(text));
  });
}

export function realDeps(): Deps {
  return {
    env: process.env,
    now: () => new Date(),
    exec: realExec,
    kill: (pid, signal) => process.kill(pid, signal ?? "SIGTERM"),
    rosters: defaultRosters(realExec, process.env),
    stdin: readStdin,
    write: (line) => console.log(line),
    error: (line) => console.error(line),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
}

class CliError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

function fail(message: string, code: number): never {
  throw new CliError(message, code);
}

async function run(deps: Deps, body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (error) {
    const code = error instanceof CliError ? error.code : EXIT.USAGE;
    deps.error((error as Error).message);
    process.exitCode = code;
  }
}

interface Ctx {
  deps: Deps;
  home: string;
  implicit: ImplicitFleet;
  host: string;
  json: boolean;
}

function ctxOf(command: Command, deps: Deps, opts: { json?: boolean }): Ctx {
  const globals = command.optsWithGlobals<{ home?: string }>();
  const implicit = implicitFleet({ user: deps.user, host: deps.host });
  return { deps, home: globals.home ?? homeOf(deps.env), implicit, host: deps.host ?? implicit.host, json: opts.json === true };
}

/** The human-only test (rule 2): a process that carries OPENFLEET_MEMBER is an agent. */
function sysopOnly(verb: string, deps: Deps): void {
  const member = deps.env.OPENFLEET_MEMBER;
  if (member) fail(`${verb} is the sysop's: this process carries OPENFLEET_MEMBER=${member}, so it is an agent`, EXIT.REFUSED);
}

interface CeilingFlags {
  approvals?: string;
  budget?: string;
  depth?: string;
  fanOut?: string;
  hosts?: string;
  until?: string;
}

function ceilingFrom(flags: CeilingFlags, now: Date): Ceiling {
  const ceiling: Ceiling = {};
  if (flags.approvals !== undefined) {
    if (flags.approvals !== "native" && flags.approvals !== "bypass") fail(`--approvals must be native or bypass, not ${flags.approvals}`, EXIT.INVALID);
    ceiling.approvals = flags.approvals;
  }
  if (flags.budget !== undefined) {
    if (!parseBudget(flags.budget)) fail(`--budget must read "<amount> <unit>", like "20 USD" or "500000 tokens", not "${flags.budget}"`, EXIT.INVALID);
    ceiling.budget = flags.budget.trim();
  }
  if (flags.depth !== undefined) {
    const depth = Number(flags.depth);
    if (!Number.isInteger(depth) || depth < 0) fail(`--depth must be a whole number, not ${flags.depth}`, EXIT.INVALID);
    ceiling.depth = depth;
  }
  if (flags.fanOut !== undefined) {
    const fanOut = Number(flags.fanOut);
    if (!Number.isInteger(fanOut) || fanOut < 1) fail(`--fan-out must be a whole number of at least 1, not ${flags.fanOut}`, EXIT.INVALID);
    ceiling.fan_out = fanOut;
  }
  if (flags.hosts !== undefined) {
    const hosts = flags.hosts.split(",").map((host) => host.trim()).filter((host) => host !== "");
    if (hosts.length === 0) fail("--hosts needs at least one hostname", EXIT.INVALID);
    ceiling.hosts = hosts;
  }
  if (flags.until !== undefined) {
    const until = parseUntil(flags.until, now);
    if (!until) fail(`--until must be a duration like 2h or an ISO 8601 time, not ${flags.until}`, EXIT.INVALID);
    ceiling.until = until;
  }
  return ceiling;
}

function addCeilingFlags(command: Command): Command {
  return command
    .option("--approvals <mode>", "native or bypass: the most a member below may run with")
    .option("--budget <amount>", 'total spend allowed, "20 USD" or "500000 tokens"')
    .option("--depth <n>", "the deepest member allowed (1: roots may spawn, their members may not)")
    .option("--fan-out <n>", "the most members one swarm may hold")
    .option("--hosts <a,b>", "hostnames members may run on")
    .option("--until <when>", "a duration from now (2h) or an ISO 8601 time after which everything is stopped");
}

function yyyymmdd(now: Date): string {
  return now.toISOString().slice(0, 10).replace(/-/g, "");
}

function emit(ctx: Ctx, data: unknown, text: () => string | string[]): void {
  if (ctx.json) {
    ctx.deps.write(JSON.stringify(data, null, 2));
    return;
  }
  const lines = text();
  for (const line of Array.isArray(lines) ? lines : [lines]) ctx.deps.write(line);
}

// ---------------------------------------------------------------------------
// Stopping members through their engines
// ---------------------------------------------------------------------------

interface StopRow {
  kind: "member";
  member: string;
  engine?: string;
  stopped: boolean;
  state?: string;
  note?: string;
}

interface SwarmRow {
  kind: "swarm";
  swarm: string;
  state: string;
  ended: boolean;
  note?: string;
}

/** What `stop` and `cap` did, in the order it happened. */
type Row = StopRow | SwarmRow;

function report(rows: Row[]): { members: Omit<StopRow, "kind">[]; swarms: Omit<SwarmRow, "kind">[] } {
  const members: Omit<StopRow, "kind">[] = [];
  const swarms: Omit<SwarmRow, "kind">[] = [];
  for (const row of rows) {
    if (row.kind === "member") {
      const { kind, ...rest } = row;
      void kind;
      members.push(rest);
    } else {
      const { kind, ...rest } = row;
      void kind;
      swarms.push(rest);
    }
  }
  return { members, swarms };
}

/** Claude Code's roster keys jobs by the first eight characters of the session id. */
function claudeHandle(handle: string): string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle) ? handle.slice(0, 8) : handle;
}

async function stopThroughEngine(deps: Deps, record: Partial<FleetRecord> & { member: string }): Promise<string | null> {
  const engine = record.engine;
  const handle = record.session ?? record.member;
  if (engine === "claude-code") {
    const result = await deps.exec("claude", ["stop", claudeHandle(handle)]);
    return result.code === 0 ? null : `claude stop ${claudeHandle(handle)} exited ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`;
  }
  if (typeof engine === "string" && engine.startsWith("moshcode/")) {
    const result = await deps.exec("moshcode", ["herd", "kill", handle]);
    return result.code === 0 ? null : `moshcode herd kill ${handle} exited ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`;
  }
  if (engine === "tmux") {
    const result = await deps.exec("tmux", ["-L", "moshcode", "kill-pane", "-t", handle]);
    return result.code === 0 ? null : `tmux kill-pane -t ${handle} exited ${result.code}: ${result.stderr.trim()}`;
  }
  if (engine === "claude-p") {
    const pid = Number(record.session);
    if (!Number.isInteger(pid) || pid <= 0) return `claude-p member ${record.member} has no pid in its record`;
    try {
      deps.kill(pid, "SIGTERM");
      return null;
    } catch (error) {
      return `kill ${pid}: ${(error as Error).message}`;
    }
  }
  return engine ? `no way to stop engine ${engine}` : `member ${record.member} names no engine`;
}

/** A member as the stop path sees it: its record when there is one, else what its member.start said. */
function memberFacts(home: string, fleet: string, lines: LedgerLine[], member: string): (Partial<FleetRecord> & { member: string }) | null {
  const record = readRecords(home, fleet).get(member);
  if (record) return record;
  const start = claimedBy(lines, member);
  if (!start) return null;
  return { member, engine: start.engine, session: start.session, swarm: start.swarm, parent: start.parent, host: start.host };
}

async function stopMember(ctx: Ctx, fleet: string, member: string, by: string, rows: Row[]): Promise<void> {
  const lines = readLedger(ctx.home, fleet);
  const facts = memberFacts(ctx.home, fleet, lines, member);
  if (!facts) {
    rows.push({ kind: "member", member, stopped: false, note: "no record and no member.start" });
    return;
  }
  const end = endOf(lines, member);
  if (end && end.state !== "lost") {
    rows.push({ kind: "member", member, engine: facts.engine, stopped: false, state: String(end.state), note: "already ended" });
    return;
  }
  if (!claimedBy(lines, member)) {
    rows.push({ kind: "member", member, engine: facts.engine, stopped: false, state: "unclaimed", note: "never started" });
    return;
  }
  const problem = await stopThroughEngine(ctx.deps, facts);
  if (problem) {
    rows.push({ kind: "member", member, engine: facts.engine, stopped: false, note: problem });
    return;
  }
  endMember(ctx.home, fleet, member, { state: "stopped", by, now: ctx.deps.now(), host: ctx.host }, facts.swarm);
  rows.push({ kind: "member", member, engine: facts.engine, stopped: true, state: "stopped" });
}

/** Members of a swarm: records and starts that name it, plus pieces its spawn minted. */
function membersOfSwarm(home: string, fleet: string, lines: LedgerLine[], swarm: string): string[] {
  const out = new Set<string>();
  for (const record of readRecords(home, fleet).values()) if (record.swarm === swarm) out.add(record.member);
  for (const line of findEvents(lines, "member.start", { swarm })) if (typeof line.member === "string") out.add(line.member);
  for (const piece of spawnOf(lines, swarm)?.pieces ?? []) if (typeof piece?.member === "string") out.add(piece.member);
  return [...out];
}

/** Rule 11: nested swarms first, then the members through their engines, then one swarm.end. */
async function stopSwarm(ctx: Ctx, fleet: string, swarm: string, by: string, rows: Row[]): Promise<void> {
  let lines = readLedger(ctx.home, fleet);
  const nested = findEvents(lines, "swarm.spawn", { parent_swarm: swarm }).map((line) => String(line.swarm));
  for (const child of nested) await stopSwarm(ctx, fleet, child, by, rows);
  const members = membersOfSwarm(ctx.home, fleet, lines, swarm);
  for (const member of members) await stopMember(ctx, fleet, member, by, rows);
  lines = readLedger(ctx.home, fleet);
  if (swarmEndOf(lines, swarm)) {
    rows.push({ kind: "swarm", swarm, state: String(swarmEndOf(lines, swarm)?.state), ended: false, note: "already ended" });
    return;
  }
  const started = members.filter((member) => claimedBy(lines, member));
  const ends = started.map((member) => endOf(lines, member));
  const missing = started.filter((_, index) => ends[index] === null);
  if (missing.length) {
    rows.push({ kind: "swarm", swarm, state: "open", ended: false, note: `no end line yet for ${missing.join(", ")}` });
    return;
  }
  const state: EndState = started.length ? (swarmEndState(ends) ?? "stopped") : "stopped";
  append(ctx.home, fleet, { event: "swarm.end", by, swarm, state }, { now: ctx.deps.now(), host: ctx.host });
  rows.push({ kind: "swarm", swarm, state, ended: true });
}

/** The swarms from `swarm` up to the top, by `parent_swarm`. */
function swarmAncestry(lines: LedgerLine[], swarm: string): LedgerLine[] {
  const out: LedgerLine[] = [];
  const seen = new Set<string>();
  let current: string | undefined = swarm;
  while (current && !seen.has(current)) {
    seen.add(current);
    const spawn = spawnOf(lines, current);
    if (!spawn) break;
    out.push(spawn);
    current = spawn.parent_swarm;
  }
  return out;
}

/** An agent reaches only the swarms it spawned and what sits under them. */
function withinReach(lines: LedgerLine[], swarm: string | undefined, caller: string): boolean {
  if (!swarm) return false;
  return swarmAncestry(lines, swarm).some((spawn) => spawn.by === caller);
}

function findSwarm(home: string, fleets: string[], swarm: string): string | null {
  for (const fleet of fleets) if (spawnOf(readLedger(home, fleet), swarm)) return fleet;
  return null;
}

function findMember(home: string, fleets: string[], member: string): string | null {
  for (const fleet of fleets) {
    if (readRecords(home, fleet).has(member)) return fleet;
    if (claimedBy(readLedger(home, fleet), member)) return fleet;
  }
  return null;
}

function stopText(rows: Row[]): string[] {
  return rows.map((row) =>
    row.kind === "member"
      ? `${row.stopped ? "stopped" : "skipped"}  ${row.member}${row.engine ? `  ${row.engine}` : ""}${row.state ? `  ${row.state}` : ""}${row.note ? `  (${row.note})` : ""}`
      : `${row.ended ? "ended" : "left"}    swarm ${row.swarm}  ${row.state}${row.note ? `  (${row.note})` : ""}`,
  );
}

// ---------------------------------------------------------------------------
// log rendering
// ---------------------------------------------------------------------------

function short(value: unknown, max = 72): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) return "";
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function describeLine(line: LedgerLine): string {
  const c = (ceiling: unknown) => (ceiling && typeof ceiling === "object" ? JSON.stringify(ceiling) : "");
  switch (line.event) {
    case "fleet.open":
      return `fleet ${line.fleet} sysop ${String(line.sysop ?? "")} ceiling ${c(line.ceiling)}`;
    case "fleet.cap":
      return `target ${String(line.target ?? "")} ceiling ${c(line.ceiling)}`;
    case "swarm.spawn":
      return `swarm ${String(line.swarm ?? "")} task ${short(line.task ?? "", 48)} pieces ${Array.isArray(line.pieces) ? line.pieces.length : 0}${line.ceiling && Object.keys(line.ceiling).length ? ` narrowed ${c(line.ceiling)}` : ""}`;
    case "member.start":
      return `member ${String(line.member ?? "")}${line.session && line.session !== line.member ? ` session ${String(line.session)}` : ""}${line.swarm ? ` swarm ${String(line.swarm)}` : ""} engine ${String(line.engine ?? "?")} approvals ${String(line.approvals ?? "native")}`;
    case "member.spend":
      return `member ${String(line.member ?? "")} amount ${String(line.amount ?? "")} total ${String(line.total ?? "")}`;
    case "member.end":
      return `member ${String(line.member ?? "")} ${String(line.state ?? "")}${line.total ? ` total ${String(line.total)}` : ""}${line.summary ? ` ${short(line.summary, 60)}` : ""}`;
    case "swarm.end":
      return `swarm ${String(line.swarm ?? "")} ${String(line.state ?? "")}${line.summary ? ` ${short(line.summary, 60)}` : ""}`;
    case "ceiling.refuse":
      return `${line.member ? `member ${String(line.member)} ` : ""}${String(line.action ?? "")} refused on ${String(line.key ?? "")}: wanted ${short(line.wanted)}, allowed ${short(line.allowed)}`;
    default: {
      const { at, event, fleet, host, by, ...rest } = line;
      void at;
      void event;
      void fleet;
      void host;
      void by;
      return short(rest);
    }
  }
}

function sinceOf(value: string | undefined, now: Date): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i);
  if (match) {
    const n = Number(match[1]);
    const unit = match[2].toLowerCase();
    const factor = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
    return now.getTime() - n * factor;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? Number.NaN : ms;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerOpenFleetCommands(cmd: Command, partial: Partial<Deps> = {}): void {
  const deps: Deps = { ...realDeps(), ...partial };
  cmd.option("--home <dir>", "the OpenFleet home (default $OPENFLEET_HOME, else ~/.openfleet)");

  addCeilingFlags(
    cmd
      .command("open")
      .argument("[name]", "a short name for the fleet; the id is <name>-<yyyymmdd>", "fleet")
      .option("--sysop <id>", "the human answerable for the fleet: an OpenProfile.md URL, or user@host")
      .option("--json", "print the fleet as JSON")
      .description("Open a fleet: mint its id, name the sysop, set the whole ceiling, write fleet.open and current. Sysop only."),
  ).action(async (name: string, opts: CeilingFlags & { sysop?: string; json?: boolean }, command: Command) =>
    run(deps, async () => {
      sysopOnly("open", deps);
      const ctx = ctxOf(command, deps, opts);
      const now = deps.now();
      const ceiling = ceilingFrom(opts, now);
      if (!ceiling.hosts) ceiling.hosts = [ctx.host];
      const base = `${slug(name, 40)}-${yyyymmdd(now)}`;
      let fleet = base;
      for (let n = 2; existsSync(fleetDir(ctx.home, fleet)); n += 1) fleet = `${base}-${n}`;
      const sysop = opts.sysop ?? ctx.implicit.sysop;
      const line = append(ctx.home, fleet, { event: "fleet.open", by: "sysop", fleet, sysop, ceiling }, { now, host: ctx.host });
      writeCurrent(ctx.home, fleet);
      emit(ctx, { fleet, sysop, ceiling, at: line.at, home: ctx.home }, () => fleet);
    }),
  );

  addCeilingFlags(
    cmd
      .command("cap")
      .argument("<target>", "a fleet id, or a running swarm's id")
      .option("--fleet <fleet>", "the fleet a swarm target belongs to, when the id is not unique")
      .option("--json", "print what was written and what was stopped as JSON")
      .description("Set a fleet's whole ceiling or narrow a running swarm's; stop whatever is now above it. Sysop only."),
  ).action(async (target: string, opts: CeilingFlags & { fleet?: string; json?: boolean }, command: Command) =>
    run(deps, async () => {
      sysopOnly("cap", deps);
      const ctx = ctxOf(command, deps, opts);
      const now = deps.now();
      const ceiling = ceilingFrom(opts, now);
      const fleets = listFleets(ctx.home);
      let fleet: string;
      let kind: "fleet" | "swarm";
      if (fleets.includes(target) || target === ctx.implicit.id) {
        fleet = target;
        kind = "fleet";
        if (!ceiling.hosts) ceiling.hosts = [ctx.host];
      } else {
        const found = opts.fleet ? (spawnOf(readLedger(ctx.home, opts.fleet), target) ? opts.fleet : null) : findSwarm(ctx.home, fleets, target);
        if (!found) fail(`no fleet or swarm named ${target} under ${ctx.home}`, EXIT.NOT_FOUND);
        fleet = found;
        kind = "swarm";
        if (Object.keys(ceiling).length === 0) fail("cap on a swarm needs at least one key to narrow", EXIT.INVALID);
      }
      const line = append(ctx.home, fleet, { event: "fleet.cap", by: "sysop", target, ceiling }, { now, host: ctx.host });

      // Members already above the new ceiling are stopped, each with member.end state stopped.
      const rows: Row[] = [];
      const lines = readLedger(ctx.home, fleet);
      const records = readRecords(ctx.home, fleet);
      const inScope = kind === "fleet" ? [...records.keys()] : membersOfSwarm(ctx.home, fleet, lines, target).concat(
        findEvents(lines, "swarm.spawn").filter((spawn) => swarmAncestry(lines, String(spawn.swarm)).some((s) => s.swarm === target)).flatMap((spawn) => membersOfSwarm(ctx.home, fleet, lines, String(spawn.swarm))),
      );
      for (const member of new Set(inScope)) {
        if (!claimedBy(lines, member) || endOf(lines, member)) continue;
        const record = records.get(member);
        const start = claimedBy(lines, member)!;
        const facts: FleetRecord = record ?? { openfleet: "0.1", fleet, sysop: "", member, swarm: start.swarm, parent: start.parent, depth: start.depth, engine: start.engine, host: start.host, approvals: start.approvals };
        const allowed = memberCeiling(ctx.home, lines, facts, ctx.implicit);
        const approvals: Approvals = (start.approvals ?? facts.approvals) === "bypass" ? "bypass" : "native";
        const above =
          !isNarrower("approvals", approvals, allowed.approvals) ||
          !isNarrower("depth", facts.depth ?? 0, allowed.depth) ||
          !isNarrower("hosts", [facts.host ?? ctx.host], allowed.hosts) ||
          !isNarrower("until", isoNow(now), allowed.until);
        if (above) await stopMember(ctx, fleet, member, "sysop", rows);
      }
      emit(ctx, { target, kind, fleet, ceiling, at: line.at, stopped: report(rows).members }, () => [
        `capped ${kind} ${target}: ${JSON.stringify(ceiling)}`,
        ...stopText(rows),
      ]);
    }),
  );

  cmd
    .command("tree")
    .argument("[fleet]", "one fleet; default every fleet under the home")
    .option("--no-roster", "do not read the engine rosters (claude agents, moshcode herd)")
    .option("--json", "print the tree as JSON")
    .description("Render a fleet, or every fleet on this host, as a tree: swarms, members, state, engine, spend and a mark on every bypass member.")
    .action(async (fleet: string | undefined, opts: { roster?: boolean; json?: boolean }, command: Command) =>
      run(deps, async () => {
        const ctx = ctxOf(command, deps, opts);
        if (fleet && !listFleets(ctx.home).includes(fleet) && fleet !== ctx.implicit.id) fail(`no fleet named ${fleet} under ${ctx.home}`, EXIT.NOT_FOUND);
        const rosters = opts.roster === false ? {} : deps.rosters;
        const tree: Tree = await fold(ctx.home, rosters, { implicit: ctx.implicit, host: ctx.host, ...(fleet ? { fleet } : {}) });
        // A recorded member its engine no longer lists, with no end line, is lost (verb table, tree).
        const by = deps.env.OPENFLEET_MEMBER ?? "sysop";
        for (const entry of flattenMembers(tree)) {
          const node = entry.member;
          if (node.roster || node.state !== "working" || node.alive !== false) continue;
          const result = endMember(ctx.home, entry.fleet, node.member, { state: "lost", by, now: deps.now(), host: ctx.host }, node.swarm);
          if (result.ended) {
            node.state = "lost";
            node.ended = result.ended.at;
          }
        }
        emit(ctx, tree, () => renderTree(tree, { host: ctx.host }));
      }),
    );

  cmd
    .command("stop")
    .argument("<target>", "a member id, a swarm id, or with --fleet a fleet id")
    .option("--fleet", "the target is a fleet: stop everything in it")
    .option("--json", "print what was stopped as JSON")
    .description("End a member, a swarm, or everything in a fleet as one unit, through each member's own engine. An agent reaches only what it spawned.")
    .action(async (target: string, opts: { fleet?: boolean; json?: boolean }, command: Command) =>
      run(deps, async () => {
        const ctx = ctxOf(command, deps, opts);
        const caller = deps.env.OPENFLEET_MEMBER;
        const by = caller ?? "sysop";
        const fleets = listFleets(ctx.home);
        const rows: Row[] = [];

        if (opts.fleet) {
          if (caller) fail(`stop --fleet is the sysop's: this process carries OPENFLEET_MEMBER=${caller}`, EXIT.REFUSED);
          if (!fleets.includes(target)) fail(`no fleet named ${target} under ${ctx.home}`, EXIT.NOT_FOUND);
          const tree = await fold(ctx.home, {}, { implicit: ctx.implicit, host: ctx.host, fleet: target });
          // Top-level swarms first (each ends its nested ones), then the roots themselves.
          for (const entry of flattenSwarms(tree)) {
            if (swarmAncestry(readLedger(ctx.home, target), entry.swarm.swarm).length === 1) await stopSwarm(ctx, target, entry.swarm.swarm, by, rows);
          }
          for (const entry of flattenMembers(tree)) if (!entry.swarm) await stopMember(ctx, target, entry.member.member, by, rows);
          emit(ctx, { target, kind: "fleet", ...report(rows) }, () => stopText(rows));
          return;
        }

        const swarmFleet = findSwarm(ctx.home, fleets, target);
        if (swarmFleet) {
          if (caller && !withinReach(readLedger(ctx.home, swarmFleet), target, caller)) {
            fail(`stop refuses: swarm ${target} is outside the subtree ${caller} spawned`, EXIT.REFUSED);
          }
          await stopSwarm(ctx, swarmFleet, target, by, rows);
          emit(ctx, { target, kind: "swarm", fleet: swarmFleet, ...report(rows) }, () => stopText(rows));
          return;
        }

        const memberFleet = findMember(ctx.home, fleets, target);
        if (!memberFleet) fail(`no swarm or member named ${target} under ${ctx.home}`, EXIT.NOT_FOUND);
        const lines = readLedger(ctx.home, memberFleet);
        const facts = memberFacts(ctx.home, memberFleet, lines, target);
        if (caller && !withinReach(lines, facts?.swarm, caller)) {
          fail(`stop refuses: member ${target} is outside the subtree ${caller} spawned`, EXIT.REFUSED);
        }
        await stopMember(ctx, memberFleet, target, by, rows);
        if (rows.some((row) => row.kind === "member" && !row.stopped && row.note && row.note !== "already ended")) process.exitCode = EXIT.NOT_FOUND;
        emit(ctx, { target, kind: "member", fleet: memberFleet, ...report(rows) }, () => stopText(rows));
      }),
    );

  cmd
    .command("log")
    .argument("[fleet]", "one fleet; default every fleet under the home")
    .option("--since <when>", "only lines at or after a time, or within a duration (2h)")
    .option("--member <id>", "only lines about one member")
    .option("--swarm <id>", "only lines about one swarm and its members")
    .option("--json", "print JSON Lines, one event per line")
    .description("Read the ledger for a fleet, a swarm or a member: what happened, in order, who did it, what was spent, how each ended, what was refused.")
    .action(async (fleet: string | undefined, opts: { since?: string; member?: string; swarm?: string; json?: boolean }, command: Command) =>
      run(deps, async () => {
        const ctx = ctxOf(command, deps, opts);
        const fleets = fleet ? [fleet] : listFleets(ctx.home);
        if (fleet && !listFleets(ctx.home).includes(fleet)) fail(`no fleet named ${fleet} under ${ctx.home}`, EXIT.NOT_FOUND);
        const since = sinceOf(opts.since, deps.now());
        if (since !== null && Number.isNaN(since)) fail(`--since must be a duration like 2h or an ISO 8601 time, not ${opts.since}`, EXIT.INVALID);
        let lines: LedgerLine[] = [];
        for (const name of fleets) {
          const all = readLedger(ctx.home, name);
          const swarmMembers = opts.swarm ? new Set(membersOfSwarm(ctx.home, name, all, opts.swarm)) : null;
          lines.push(
            ...all.filter((line) => {
              if (since !== null && Date.parse(line.at) < since) return false;
              if (opts.member && line.member !== opts.member && line.by !== opts.member) return false;
              if (opts.swarm && line.swarm !== opts.swarm && line.target !== opts.swarm && !(typeof line.member === "string" && swarmMembers?.has(line.member))) return false;
              return true;
            }),
          );
        }
        lines = lines.sort((a, b) => a.at.localeCompare(b.at));
        if (ctx.json) {
          for (const line of lines) deps.write(JSON.stringify(line));
          return;
        }
        if (lines.length === 0) {
          deps.write("(no events)");
          return;
        }
        const byWidth = Math.max(...lines.map((line) => line.by.length));
        for (const line of lines) deps.write(`${line.at}  ${line.event.padEnd(14)}  ${line.by.padEnd(byWidth)}  ${describeLine(line)}`);
      }),
    );

  cmd
    .command("hook")
    .argument("<event>", "SessionStart, UserPromptSubmit, PreToolUse, Stop or SessionEnd")
    .description("Run one Claude Code hook over the JSON on stdin. Installed by `hooks install`; never fails the engine.")
    .action(async (event: string, _opts: unknown, command: Command) => {
      const globals = command.optsWithGlobals<{ home?: string }>();
      const env: Env = globals.home ? { ...deps.env, OPENFLEET_HOME: globals.home } : deps.env;
      const implicit = implicitFleet({ user: deps.user, host: deps.host });
      const io: HookIo = { ...realHookIo(env), now: deps.now, implicit, host: deps.host ?? implicit.host, ...deps.hookIo, env };
      let text = "";
      try {
        text = await deps.stdin();
      } catch {
        text = "";
      }
      const result = runHook(event, text, io);
      if (result.stdout) deps.stdout(result.stdout);
      if (result.stderr) deps.stderr(result.stderr);
      process.exitCode = result.exit;
    });

  const hooks = cmd.command("hooks").description("Install, remove or inspect the Claude Code hooks in ~/.claude/settings.json (merged, never clobbered).");
  const fileOf = (opts: { settingsFile?: string }) => opts.settingsFile ?? settingsFile(deps.env);
  hooks
    .command("install")
    .option("--settings-file <path>", "the settings file to merge into (default ~/.claude/settings.json)")
    .option("--dry-run", "compute the change and write nothing")
    .option("--json", "print the result as JSON")
    .description("Add the five OpenFleet hooks, replacing older copies of ours and touching nothing else.")
    .action(async (opts: { settingsFile?: string; dryRun?: boolean; json?: boolean }, command: Command) =>
      run(deps, async () => {
        const ctx = ctxOf(command, deps, opts);
        const result = installHooks(fileOf(opts), { dryRun: opts.dryRun });
        if (!result.ok) fail(result.error ?? "install failed", EXIT.INVALID);
        emit(ctx, result, () => [
          `${result.written ? `${opts.dryRun ? "would write" : "wrote"} ${result.written} hook${result.written === 1 ? "" : "s"}` : "already installed"} in ${result.file}`,
          ...result.changes.map((change) => `  ${change.event.padEnd(17)} ${change.change}`),
        ]);
      }),
    );
  hooks
    .command("remove")
    .option("--settings-file <path>", "the settings file to edit (default ~/.claude/settings.json)")
    .option("--dry-run", "compute the change and write nothing")
    .option("--json", "print the result as JSON")
    .description("Take the OpenFleet hooks back out, leaving every other hook and setting as it was.")
    .action(async (opts: { settingsFile?: string; dryRun?: boolean; json?: boolean }, command: Command) =>
      run(deps, async () => {
        const ctx = ctxOf(command, deps, opts);
        const result = removeHooks(fileOf(opts), { dryRun: opts.dryRun });
        if (!result.ok) fail(result.error ?? "remove failed", EXIT.INVALID);
        emit(ctx, result, () => `${opts.dryRun ? "would remove" : "removed"} ${result.removed} hook${result.removed === 1 ? "" : "s"} from ${result.file}`);
      }),
    );
  hooks
    .command("status")
    .option("--settings-file <path>", "the settings file to inspect (default ~/.claude/settings.json)")
    .option("--json", "print the status as JSON")
    .description("Say which OpenFleet hooks are installed and whether they carry this version's command text.")
    .action(async (opts: { settingsFile?: string; json?: boolean }, command: Command) =>
      run(deps, async () => {
        const ctx = ctxOf(command, deps, opts);
        const status = hooksStatus(fileOf(opts));
        emit(ctx, status, () => [
          `${status.file}: ${!status.readable ? `unreadable (${status.error})` : status.installed ? "installed" : status.partial ? "partially installed" : "not installed"}`,
          ...status.events.map((event) => `  ${event.event.padEnd(17)} ${event.installed ? (event.current ? "installed" : "installed, older text") : "missing"}`),
        ]);
      }),
    );
}
