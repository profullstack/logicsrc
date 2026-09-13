/**
 * Where a process sits, and how a session claims or derives its record.
 *
 * `context` answers "which fleet, which member" from the environment the way
 * the spec orders it: the record `OPENFLEET_RECORD` names, else the fleet
 * `OPENFLEET_FLEET` names, else `$OPENFLEET_HOME/current`, else the implicit
 * fleet. `claimOrDerive` is the engine-side rule from "Claiming and deriving"
 * and rule 13, written once so the Claude Code hooks and any other starter
 * make the same decision from the same ledger.
 */

import { checkCeiling, effectiveCeiling, fleetCeiling, isImplicitFleet, mergeCeiling, rootApprovals, swarmChain } from "./ceiling.js";
import { nextSwarmOfOne } from "./swarm.js";
import {
  append,
  claimedBy,
  endOf,
  findEvents,
  home as homeOf,
  implicitFleet,
  isoNow,
  readCurrent,
  readLedger,
  readRecord,
  recordPath,
  replaceUnclaimedRecord,
  spawnOf,
  swarmEndOf,
  writeRecord,
  type Env,
  type ImplicitFleet,
} from "./store.js";
import type { Approvals, Ceiling, EndState, FleetRecord, LedgerInput, LedgerLine, Refusal } from "./types.js";
import { OPENFLEET_VERSION } from "./types.js";

export interface Context {
  home: string;
  fleet: string;
  sysop: string;
  /** No `fleet.open` in the ledger: the fleet is the implicit `<user>@<host>`. */
  implicit: boolean;
  record: FleetRecord | null;
  recordPath: string | null;
  /** `OPENFLEET_MEMBER`, else the record's member. Present means this process is an agent. */
  member: string | null;
  swarm: string | null;
  host: string;
  ceiling: Ceiling;
}

export interface ContextOptions {
  implicit?: ImplicitFleet;
  host?: string;
}

/** The sysop an opened fleet's `fleet.open` names, or null for the implicit fleet. */
export function fleetSysop(lines: LedgerLine[], fleet: string): string | null {
  const opens = findEvents(lines, "fleet.open", { fleet });
  const sysop = opens.length ? opens[opens.length - 1].sysop : undefined;
  return typeof sysop === "string" ? sysop : null;
}

export function context(env: Env = process.env, opts: ContextOptions = {}): Context {
  const implicit = opts.implicit ?? implicitFleet();
  const host = opts.host ?? implicit.host;
  const home = homeOf(env);
  let record: FleetRecord | null = null;
  let path: string | null = null;
  if (env.OPENFLEET_RECORD) {
    record = readRecord(env.OPENFLEET_RECORD);
    if (record) path = env.OPENFLEET_RECORD;
  }
  const fleet = record?.fleet ?? env.OPENFLEET_FLEET ?? readCurrent(home) ?? implicit.id;
  const lines = readLedger(home, fleet);
  const implicitHere = isImplicitFleet(lines, fleet);
  const sysop = record?.sysop ?? fleetSysop(lines, fleet) ?? implicit.sysop;
  const member = env.OPENFLEET_MEMBER ?? record?.member ?? null;
  const swarm = env.OPENFLEET_SWARM ?? record?.swarm ?? null;
  const ceiling = record ? memberCeiling(home, lines, record, implicit) : fleetCeiling(lines, fleet, implicit.ceiling);
  return { home, fleet, sysop, implicit: implicitHere, record, recordPath: path, member, swarm, host, ceiling };
}

/**
 * The root above a record, following `parent` through record files, then
 * `member.start` lines when a record is missing (it may live on another host).
 * Null when the chain breaks, which reads as approvals native.
 */
export function rootOf(homeDir: string, lines: LedgerLine[], record: FleetRecord): { approvals?: Approvals; orphan?: boolean; member: string } | null {
  let current: { approvals?: Approvals; orphan?: boolean; member: string; parent?: string } = record;
  const seen = new Set<string>([record.member]);
  while (current.parent) {
    const parent = current.parent;
    if (seen.has(parent)) return null;
    seen.add(parent);
    const file = readRecord(recordPath(homeDir, record.fleet, parent));
    if (file) {
      current = file;
      continue;
    }
    const start = claimedBy(lines, parent);
    if (!start) return null;
    current = { member: parent, approvals: start.approvals, parent: start.parent };
  }
  return current;
}

/**
 * The effective ceiling a member is under now. The record's own `ceiling` is
 * what it was started under; the latest `fleet.cap` for its fleet and for any
 * swarm on its path wins over that copy (rule 7). A record with no ceiling
 * gets the fleet's, with the root's approvals entering at the root in the
 * implicit fleet, merged down its swarm path.
 */
export function memberCeiling(homeDir: string, lines: LedgerLine[], record: FleetRecord, implicit: ImplicitFleet): Ceiling {
  const chain = swarmChain(lines, record.swarm);
  let base: Ceiling;
  if (record.ceiling && typeof record.ceiling === "object") {
    base = { ...record.ceiling };
  } else {
    base = fleetCeiling(lines, record.fleet, implicit.ceiling);
    if (isImplicitFleet(lines, record.fleet)) base.approvals = rootApprovals(rootOf(homeDir, lines, record));
    base = effectiveCeiling(base, lines, chain);
  }
  const fleetCaps = findEvents(lines, "fleet.cap", { target: record.fleet });
  if (fleetCaps.length) base = mergeCeiling(base, fleetCaps[fleetCaps.length - 1].ceiling);
  for (const swarm of chain) {
    const caps = findEvents(lines, "fleet.cap", { target: swarm });
    if (caps.length) base = mergeCeiling(base, caps[caps.length - 1].ceiling);
  }
  return base;
}

// ---------------------------------------------------------------------------
// Claiming and deriving
// ---------------------------------------------------------------------------

export interface SessionFacts {
  /** The engine's own id for this session. */
  id: string;
  engine: string;
  cwd: string;
  /** The process id, the handle a `claude -p` is stopped by. */
  pid?: number;
  /** The command line the session was started with; the task of a swarm of one. */
  command?: string;
  approvals: Approvals;
  /** The member id a root record uses when it differs from `id`: a Claude Code job id. */
  member?: string;
  /** For a root: the engine's child marker was present in the invoking environment (rule 13). */
  orphan?: boolean;
}

export interface StartOptions {
  home: string;
  env: Env;
  now?: Date;
  host?: string;
  implicit?: ImplicitFleet;
  session: SessionFacts;
}

export type Resolution =
  | { kind: "claim"; record: FleetRecord; recordPath: string; session: string }
  | { kind: "derive"; record: FleetRecord; recordPath: string; parent: FleetRecord; spawned: LedgerLine | null }
  | { kind: "root"; record: FleetRecord; recordPath: string; existed: boolean }
  | { kind: "refused"; refusal: Refusal; line: LedgerLine; parent: FleetRecord; member: string };

/**
 * Resolve the record a starting session runs as.
 *
 * - `OPENFLEET_RECORD` names an unclaimed record: claim it (the caller writes
 *   `member.start` once it knows the approvals for certain).
 * - It names a claimed record: derive a child record, joining the swarm
 *   `OPENFLEET_SWARM` names when its `swarm.spawn` was written by the claimed
 *   member, else a swarm of one. The merged ceiling is checked before anything
 *   is written; a refusal writes `ceiling.refuse` and nothing else.
 * - It is unset: write a root record, `orphan: true` when the session's
 *   invoking environment carried a child marker.
 */
export function claimOrDerive(opts: StartOptions): Resolution {
  const now = opts.now ?? new Date();
  const implicit = opts.implicit ?? implicitFleet();
  const host = opts.host ?? implicit.host;
  const { home, env, session } = opts;

  const inherited = env.OPENFLEET_RECORD ? readRecord(env.OPENFLEET_RECORD) : null;
  if (inherited && env.OPENFLEET_RECORD) {
    const lines = readLedger(home, inherited.fleet);
    if (!claimedBy(lines, inherited.member)) {
      return { kind: "claim", record: inherited, recordPath: env.OPENFLEET_RECORD, session: inherited.session ?? session.id };
    }
    return derive(inherited, lines, { home, env, now, host, implicit, session });
  }

  return root({ home, env, now, host, implicit, session });
}

function derive(
  parent: FleetRecord,
  lines: LedgerLine[],
  opts: { home: string; env: Env; now: Date; host: string; implicit: ImplicitFleet; session: SessionFacts },
): Resolution {
  const { home, env, now, host, implicit, session } = opts;
  const member = session.id;
  const depth = (parent.depth ?? 0) + 1;

  // The swarm the child joins, when the parent spawned the one the environment names.
  let swarm: string;
  let task: string | undefined;
  let narrowing: Ceiling | undefined;
  let spawnToWrite: LedgerInput | null = null;
  const named = env.OPENFLEET_SWARM;
  const namedSpawn = named && named !== parent.swarm ? spawnOf(lines, named) : null;
  if (named && namedSpawn && namedSpawn.by === parent.member) {
    swarm = named;
    task = namedSpawn.task;
    narrowing = namedSpawn.ceiling;
  } else {
    const existing = findEvents(lines, "swarm.spawn").map((line) => String(line.swarm ?? ""));
    swarm = nextSwarmOfOne(parent.member, existing);
    task = session.command ?? session.engine;
    spawnToWrite = {
      event: "swarm.spawn",
      by: parent.member,
      swarm,
      ...(parent.swarm ? { parent_swarm: parent.swarm } : {}),
      task,
      ceiling: {},
      pieces: [{ member }],
    };
  }

  const parentCeiling = memberCeiling(home, lines, parent, implicit);
  const ceiling = mergeCeiling(parentCeiling, narrowing);
  const refusal = checkCeiling({ approvals: session.approvals, depth, hosts: [host], until: isoNow(now) }, ceiling);
  if (refusal) {
    const line = append(
      home,
      parent.fleet,
      { event: "ceiling.refuse", by: parent.member, member, action: "start", key: refusal.key, wanted: refusal.wanted, allowed: refusal.allowed },
      { now, host },
    );
    return { kind: "refused", refusal, line, parent, member };
  }

  let spawned: LedgerLine | null = null;
  if (spawnToWrite) spawned = append(home, parent.fleet, spawnToWrite, { now, host });

  const record: FleetRecord = {
    openfleet: OPENFLEET_VERSION,
    fleet: parent.fleet,
    sysop: parent.sysop,
    member,
    parent: parent.member,
    swarm,
    ...(task !== undefined ? { task } : {}),
    depth,
    engine: session.engine,
    ...(session.pid !== undefined ? { session: String(session.pid) } : {}),
    host,
    cwd: session.cwd,
    started: isoNow(now),
    approvals: session.approvals,
    ceiling,
  };
  const path = writeRecord(home, record);
  return { kind: "derive", record, recordPath: path, parent, spawned };
}

function root(opts: { home: string; env: Env; now: Date; host: string; implicit: ImplicitFleet; session: SessionFacts }): Resolution {
  const { home, env, now, host, implicit, session } = opts;
  const member = session.member ?? session.id;
  const fleet = env.OPENFLEET_FLEET ?? readCurrent(home) ?? implicit.id;
  const path = recordPath(home, fleet, member);
  const existing = readRecord(path);
  if (existing) return { kind: "root", record: existing, recordPath: path, existed: true };

  const lines = readLedger(home, fleet);
  const implicitHere = isImplicitFleet(lines, fleet);
  const sysop = fleetSysop(lines, fleet) ?? implicit.sysop;
  const orphan = session.orphan === true;
  const ceiling: Ceiling = implicitHere
    ? { approvals: orphan ? "native" : session.approvals, depth: 1, hosts: [host] }
    : fleetCeiling(lines, fleet, implicit.ceiling);

  const record: FleetRecord = {
    openfleet: OPENFLEET_VERSION,
    fleet,
    sysop,
    member,
    ...(orphan ? { orphan: true } : {}),
    depth: 0,
    engine: session.engine,
    ...(session.pid !== undefined && session.engine === "claude-p" ? { session: String(session.pid) } : {}),
    host,
    cwd: session.cwd,
    started: isoNow(now),
    approvals: session.approvals,
    ceiling,
  };
  writeRecord(home, record);
  return { kind: "root", record, recordPath: path, existed: false };
}

// ---------------------------------------------------------------------------
// member.start and member.end
// ---------------------------------------------------------------------------

export interface StartResult {
  started: LedgerLine | null;
  refused: { refusal: Refusal; line: LedgerLine } | null;
  /** The record was already claimed; nothing was written. */
  already: LedgerLine | null;
  /** The record as it stands: rewritten when a hand-started root's real approvals differed from the guess. */
  record: FleetRecord;
}

/**
 * Claim a record: check the effective ceiling, then write `member.start` with
 * `by` the member itself. A refusal writes `ceiling.refuse` instead, with `by`
 * the record's parent, else the caller's `OPENFLEET_MEMBER`, else the record's
 * own member when it carries `orphan`, else `sysop` for a root the human
 * started by hand.
 */
export function startMember(
  homeDir: string,
  given: FleetRecord,
  facts: { sessionId: string; approvals: Approvals; env?: Env; now?: Date; host?: string; implicit?: ImplicitFleet },
): StartResult {
  const now = facts.now ?? new Date();
  const implicit = facts.implicit ?? implicitFleet();
  let record = given;
  const host = facts.host ?? record.host ?? implicit.host;
  const lines = readLedger(homeDir, record.fleet);
  const already = claimedBy(lines, record.member);
  if (already) return { started: null, refused: null, already, record };

  // A root the sysop started by hand runs under the approvals it was started
  // with (rule 12). The starter may have guessed those before the engine said;
  // the engine's word replaces the guess while the record is still unclaimed.
  const handStartedRoot = !record.parent && !record.orphan && isImplicitFleet(lines, record.fleet);
  if (handStartedRoot && record.approvals !== facts.approvals) {
    record = { ...record, approvals: facts.approvals, ceiling: { ...(record.ceiling ?? {}), approvals: facts.approvals } };
    replaceUnclaimedRecord(homeDir, record);
  }

  const allowed = memberCeiling(homeDir, lines, record, implicit);
  const refusal = checkCeiling({ approvals: facts.approvals, depth: record.depth ?? 0, hosts: [host], until: isoNow(now) }, allowed);
  if (refusal) {
    const by = record.parent ?? facts.env?.OPENFLEET_MEMBER ?? (record.orphan ? record.member : "sysop");
    const line = append(
      homeDir,
      record.fleet,
      { event: "ceiling.refuse", by, member: record.member, action: "start", key: refusal.key, wanted: refusal.wanted, allowed: refusal.allowed },
      { now, host },
    );
    return { started: null, refused: { refusal, line }, already: null, record };
  }

  const started = append(
    homeDir,
    record.fleet,
    {
      event: "member.start",
      by: record.member,
      member: record.member,
      session: record.session ?? facts.sessionId,
      ...(record.swarm ? { swarm: record.swarm } : {}),
      ...(record.parent ? { parent: record.parent } : {}),
      depth: record.depth ?? 0,
      ...(record.engine ? { engine: record.engine } : {}),
      ...(record.cwd ? { cwd: record.cwd } : {}),
      approvals: facts.approvals,
      ...(record.piece ? { piece: record.piece } : {}),
    },
    { now, host },
  );
  return { started, refused: null, already: null, record };
}

export interface EndFacts {
  state: EndState;
  by: string;
  summary?: string;
  total?: string;
  links?: unknown[];
  now?: Date;
  host?: string;
}

export interface EndResult {
  ended: LedgerLine | null;
  swarmEnded: LedgerLine | null;
  /** An end line already counted; nothing was written. */
  already: LedgerLine | null;
}

/**
 * End a member: one `member.end` that counts (a `lost` line may be superseded
 * by a real one, anything else stands), then, for a swarm of one the engine
 * derived, that swarm's `swarm.end` with the same state.
 */
export function endMember(homeDir: string, fleet: string, member: string, facts: EndFacts, swarm?: string): EndResult {
  const now = facts.now ?? new Date();
  const lines = readLedger(homeDir, fleet);
  const existing = endOf(lines, member);
  if (existing && !(existing.state === "lost" && facts.state !== "lost")) return { ended: null, swarmEnded: null, already: existing };

  const ended = append(
    homeDir,
    fleet,
    {
      event: "member.end",
      by: facts.by,
      member,
      state: facts.state,
      ...(facts.summary !== undefined ? { summary: facts.summary } : {}),
      ...(facts.total !== undefined ? { total: facts.total } : {}),
      ...(facts.links !== undefined ? { links: facts.links } : {}),
    },
    { now, host: facts.host },
  );

  let swarmEnded: LedgerLine | null = null;
  if (swarm) {
    const spawn = spawnOf(lines, swarm);
    const ofOne = spawn?.pieces?.length === 1 && spawn.pieces[0]?.member === member;
    if (ofOne && !swarmEndOf(lines, swarm)) {
      swarmEnded = append(
        homeDir,
        fleet,
        { event: "swarm.end", by: facts.by, swarm, state: facts.state, ...(facts.summary !== undefined ? { summary: facts.summary } : {}) },
        { now, host: facts.host },
      );
    }
  }
  return { ended, swarmEnded, already: null };
}
