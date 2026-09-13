/**
 * Fold `$OPENFLEET_HOME` into one tree: fleets, their root members, their
 * swarms (nested), each swarm's members, with state, engine, host, depth,
 * spend against budget and a mark on every `bypass` member. Built from the
 * ledger and the records; an engine's roster adds liveness and is the only
 * place a member with no record exists.
 */

import { fleetCeiling, formatSpend, isImplicitFleet, sumSpend } from "./ceiling.js";
import { fleetSysop } from "./context.js";
import { rosterFor } from "./rosters.js";
import {
  claimedBy,
  endOf,
  findEvents,
  implicitFleet,
  latestSpend,
  listFleets,
  readLedger,
  readRecords,
  swarmEndOf,
  type ImplicitFleet,
} from "./store.js";
import type { Approvals, EndState, FleetNode, LedgerLine, MemberNode, RosterRow, Rosters, SwarmNode, Tree } from "./types.js";

export interface FoldOptions {
  implicit?: ImplicitFleet;
  host?: string;
  /** Only this fleet. */
  fleet?: string;
}

interface RosterState {
  rows: RosterRow[];
  /** Roster names that were readable, so an unmatched member of that engine is gone rather than unknown. */
  readable: Set<keyof Rosters>;
  consumed: Set<RosterRow>;
}

async function readRosters(rosters: Rosters): Promise<RosterState> {
  const state: RosterState = { rows: [], readable: new Set(), consumed: new Set() };
  for (const name of ["claude", "moshcode"] as const) {
    const read = rosters[name];
    if (!read) continue;
    let rows: RosterRow[] | null = null;
    try {
      rows = await read();
    } catch {
      rows = null;
    }
    if (!rows) continue;
    state.readable.add(name);
    state.rows.push(...rows);
  }
  return state;
}

function matchRow(state: RosterState, ids: Array<string | undefined>): RosterRow | null {
  const wanted = new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""));
  if (wanted.size === 0) return null;
  for (const row of state.rows) {
    if (state.consumed.has(row)) continue;
    if (wanted.has(row.id) || (row.sessionId !== undefined && wanted.has(row.sessionId)) || (row.member !== undefined && wanted.has(row.member))) {
      state.consumed.add(row);
      return row;
    }
  }
  return null;
}

function spendOf(members: MemberNode[], swarms: SwarmNode[]): Record<string, number> {
  const sums = sumSpend(members.map((member) => member.spend));
  for (const swarm of swarms) {
    for (const [unit, amount] of Object.entries(swarm.spend)) sums[unit] = (sums[unit] ?? 0) + amount;
  }
  return sums;
}

function foldFleet(homeDir: string, fleet: string, implicit: ImplicitFleet, roster: RosterState, host: string): FleetNode {
  const lines = readLedger(homeDir, fleet);
  const records = readRecords(homeDir, fleet);

  // Every member the ledger or the records know: records, starts, and pieces minted in a spawn.
  const memberIds = new Set<string>(records.keys());
  for (const line of lines) {
    if (line.event === "member.start" && typeof line.member === "string") memberIds.add(line.member);
    if (line.event === "swarm.spawn" && Array.isArray(line.pieces)) {
      for (const piece of line.pieces) if (typeof piece?.member === "string") memberIds.add(piece.member);
    }
  }

  const pieceOf = new Map<string, { swarm: string; title?: string; owns?: string[]; task?: string }>();
  const swarms = new Map<string, SwarmNode>();
  for (const spawn of findEvents(lines, "swarm.spawn")) {
    if (typeof spawn.swarm !== "string") continue;
    const end = swarmEndOf(lines, spawn.swarm);
    swarms.set(spawn.swarm, {
      swarm: spawn.swarm,
      ...(typeof spawn.task === "string" ? { task: spawn.task } : {}),
      by: spawn.by,
      ...(typeof spawn.parent_swarm === "string" ? { parent_swarm: spawn.parent_swarm } : {}),
      ceiling: spawn.ceiling && typeof spawn.ceiling === "object" ? spawn.ceiling : {},
      members: [],
      swarms: [],
      ...(end ? { state: end.state as EndState, ...(typeof end.summary === "string" ? { summary: end.summary } : {}) } : {}),
      spend: {},
    });
    for (const piece of spawn.pieces ?? []) {
      if (typeof piece?.member === "string") {
        pieceOf.set(piece.member, { swarm: spawn.swarm, title: piece.title, owns: piece.owns, task: spawn.task });
      }
    }
  }

  const members = new Map<string, MemberNode>();
  for (const id of memberIds) {
    const record = records.get(id) ?? null;
    const start = claimedBy(lines, id);
    const end = endOf(lines, id);
    const piece = pieceOf.get(id);
    const engine = record?.engine ?? start?.engine;
    const row = matchRow(roster, [id, record?.session, start?.session]);
    const covering = rosterFor(engine);
    const approvals: Approvals = (start?.approvals ?? record?.approvals) === "bypass" ? "bypass" : "native";
    const owns = record?.piece?.owns ?? piece?.owns;
    const title = record?.piece?.title ?? piece?.title ?? row?.name;
    const node: MemberNode = {
      member: id,
      ...(record?.session ?? start?.session ? { session: record?.session ?? start?.session } : {}),
      ...(title ? { title } : {}),
      ...(record?.task ?? piece?.task ? { task: record?.task ?? piece?.task } : {}),
      ...(engine ?? row?.engine ? { engine: engine ?? row?.engine } : {}),
      host: record?.host ?? start?.host ?? host,
      depth: record?.depth ?? start?.depth ?? 0,
      state: end ? (end.state as EndState) : start ? "working" : "unclaimed",
      approvals,
      ...(owns ? { owns } : {}),
      ...(record?.orphan ? { orphan: true } : {}),
      ...(row ? { alive: true } : covering && roster.readable.has(covering) ? { alive: false } : {}),
      ...(latestSpend(lines, id) ? { spend: latestSpend(lines, id) } : {}),
      ...(start ? { started: start.at } : record?.started ? { started: record.started } : {}),
      ...(end ? { ended: end.at } : {}),
      ...(typeof end?.summary === "string" ? { summary: end.summary } : {}),
      ...(record?.parent ?? start?.parent ? { parent: record?.parent ?? start?.parent } : {}),
      ...(record?.swarm ?? start?.swarm ?? piece?.swarm ? { swarm: record?.swarm ?? start?.swarm ?? piece?.swarm } : {}),
      swarms: [],
    };
    members.set(id, node);
  }

  const byStart = (a: { started?: string; member?: string; swarm?: string }, b: typeof a) =>
    String(a.started ?? "").localeCompare(String(b.started ?? "")) || String(a.member ?? a.swarm).localeCompare(String(b.member ?? b.swarm));

  // Members into swarms, swarms under their parent swarm or spawner, the rest at the top.
  const roots: MemberNode[] = [];
  for (const node of [...members.values()].sort(byStart)) {
    const swarm = node.swarm ? swarms.get(node.swarm) : undefined;
    if (swarm) swarm.members.push(node);
    else roots.push(node);
  }
  const fleetSwarms: SwarmNode[] = [];
  for (const swarm of swarms.values()) {
    const parentSwarm = swarm.parent_swarm ? swarms.get(swarm.parent_swarm) : undefined;
    if (parentSwarm && parentSwarm !== swarm) {
      parentSwarm.swarms.push(swarm);
      continue;
    }
    const spawner = members.get(swarm.by);
    if (spawner) spawner.swarms.push(swarm);
    else fleetSwarms.push(swarm);
  }
  // Spend rolls up from the leaves: a swarm's total is its members' plus every swarm under them.
  const sumSwarm = (swarm: SwarmNode): void => {
    for (const nested of swarm.swarms) sumSwarm(nested);
    for (const member of swarm.members) for (const nested of member.swarms) sumSwarm(nested);
    swarm.spend = spendOf(swarm.members, [...swarm.swarms, ...swarm.members.flatMap((member) => member.swarms)]);
  };
  for (const swarm of fleetSwarms) sumSwarm(swarm);
  for (const root of roots) for (const swarm of root.swarms) sumSwarm(swarm);

  const ceiling = fleetCeiling(lines, fleet, implicit.ceiling);
  const implicitHere = isImplicitFleet(lines, fleet);
  return {
    fleet,
    sysop: fleetSysop(lines, fleet) ?? implicit.sysop,
    implicit: implicitHere,
    ceiling,
    roots,
    swarms: fleetSwarms,
    spend: spendOf(roots, [...fleetSwarms, ...roots.flatMap((root) => root.swarms)]),
  };
}

/** Fold every fleet under `home` (or one) into a tree, joining the rosters given. */
export async function fold(homeDir: string, rosters: Rosters = {}, opts: FoldOptions = {}): Promise<Tree> {
  const implicit = opts.implicit ?? implicitFleet();
  const host = opts.host ?? implicit.host;
  const roster = await readRosters(rosters);
  const names = opts.fleet ? [opts.fleet] : listFleets(homeDir);
  const fleets = names.map((fleet) => foldFleet(homeDir, fleet, implicit, roster, host));

  // Sessions an engine lists that have no record are root members of the implicit fleet, marked as roster rows.
  const leftovers = roster.rows.filter((row) => !roster.consumed.has(row));
  if (leftovers.length && (!opts.fleet || opts.fleet === implicit.id)) {
    let node = fleets.find((fleet) => fleet.fleet === implicit.id);
    if (!node) {
      node = { fleet: implicit.id, sysop: implicit.sysop, implicit: true, ceiling: { ...implicit.ceiling }, roots: [], swarms: [], spend: {} };
      fleets.push(node);
    }
    for (const row of leftovers) {
      node.roots.push({
        member: row.id,
        ...(row.sessionId ? { session: row.sessionId } : {}),
        ...(row.name ? { title: row.name } : {}),
        engine: row.engine,
        host,
        depth: 0,
        state: rowState(row.state),
        approvals: row.approvals ?? "native",
        roster: true,
        alive: true,
        ...(row.startedAt ? { started: row.startedAt } : {}),
        swarms: [],
      });
    }
  }

  fleets.sort((a, b) => Number(b.implicit) - Number(a.implicit) || a.fleet.localeCompare(b.fleet));
  return { fleets };
}

function rowState(state: string | undefined): MemberNode["state"] {
  if (state === "done" || state === "failed" || state === "stopped") return state;
  return "working";
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

interface Row {
  prefix: string;
  label: string;
  title: string;
  /** The engine for a member row, the member count for a swarm row. */
  engine: string;
  rest: string;
}

function hhmm(iso: string | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const date = new Date(ms);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function quote(task: string | undefined, max = 60): string {
  if (!task) return "";
  const text = task.length > max ? `${task.slice(0, max - 4).trimEnd()} ...` : task;
  // A command line that carries its own quotes reads better bare.
  return text.includes('"') ? text : `"${text}"`;
}

export function describeCeiling(ceiling: Record<string, unknown>): string {
  const parts: string[] = [];
  if (ceiling.approvals) parts.push(`approvals ${String(ceiling.approvals)}`);
  if (ceiling.depth !== undefined) parts.push(`depth ${String(ceiling.depth)}`);
  if (ceiling.fan_out !== undefined) parts.push(`fan-out ${String(ceiling.fan_out)}`);
  if (Array.isArray(ceiling.hosts)) parts.push(`hosts ${ceiling.hosts.join(",")}`);
  if (ceiling.budget) parts.push(`budget ${String(ceiling.budget)}`);
  if (ceiling.until) parts.push(`until ${hhmm(String(ceiling.until))}`);
  return parts.join(", ");
}

function memberRow(node: MemberNode, prefix: string, host: string): Row {
  const label = node.session && node.session !== node.member ? `${node.member} (${node.session})` : node.member;
  const marks: string[] = [];
  if (node.approvals === "bypass") marks.push("[bypass]");
  if (node.orphan) marks.push("[orphan]");
  if (node.roster) marks.push("[roster]");
  if (node.alive === false && node.state === "working") marks.push("[gone]");
  const rest = [
    node.state,
    ...marks,
    ...(node.owns && node.owns.length ? [`owns ${node.owns.join(",")}`] : []),
    ...(node.host && node.host !== host ? [`@${node.host}`] : []),
    ...(node.spend ? [node.spend] : []),
  ].join("  ");
  return { prefix, label, title: node.title ?? "", engine: node.engine ?? "?", rest };
}

function swarmRow(node: SwarmNode, prefix: string): Row {
  const count = node.members.length;
  const size = node.ceiling.fan_out !== undefined ? `${count}/${String(node.ceiling.fan_out)} members` : `${count} member${count === 1 ? "" : "s"}`;
  const rest = [...(node.state ? [node.state] : node.ceiling.until ? [`until ${hhmm(String(node.ceiling.until))}`] : [])];
  const spend = formatSpend(node.spend, typeof node.ceiling.budget === "string" ? node.ceiling.budget : undefined);
  if (spend) rest.push(spend);
  return { prefix, label: `swarm ${node.swarm}`, title: quote(node.task), engine: size, rest: rest.join("  ") };
}

function walk(rows: Row[], items: Array<{ kind: "member"; node: MemberNode } | { kind: "swarm"; node: SwarmNode }>, indent: string, host: string): void {
  items.forEach((item, index) => {
    const last = index === items.length - 1;
    const branch = last ? "└─ " : "├─ ";
    const childIndent = `${indent}${last ? "   " : "│  "}`;
    if (item.kind === "member") {
      rows.push(memberRow(item.node, `${indent}${branch}`, host));
      walk(rows, item.node.swarms.map((node) => ({ kind: "swarm" as const, node })), childIndent, host);
    } else {
      rows.push(swarmRow(item.node, `${indent}${branch}`));
      walk(
        rows,
        [
          ...item.node.members.map((node) => ({ kind: "member" as const, node })),
          ...item.node.swarms.map((node) => ({ kind: "swarm" as const, node })),
        ],
        childIndent,
        host,
      );
    }
  });
}

/** The tree as plain text, one fleet after another, columns aligned per fleet. */
export function renderTree(tree: Tree, opts: { host?: string } = {}): string {
  const host = opts.host ?? implicitFleet().host;
  const out: string[] = [];
  if (tree.fleets.length === 0) return "(no fleets)";
  for (const fleet of tree.fleets) {
    const ceiling = describeCeiling(fleet.ceiling);
    const spend = formatSpend(fleet.spend, typeof fleet.ceiling.budget === "string" ? fleet.ceiling.budget : undefined);
    out.push(`${fleet.fleet}  (${fleet.implicit ? "implicit fleet" : "fleet"}, sysop ${fleet.sysop}${ceiling ? `, ${ceiling}` : ""}${spend ? `, spent ${spend}` : ""})`);
    const rows: Row[] = [];
    walk(
      rows,
      [
        ...fleet.roots.map((node) => ({ kind: "member" as const, node })),
        ...fleet.swarms.map((node) => ({ kind: "swarm" as const, node })),
      ],
      "",
      host,
    );
    const labelWidth = Math.max(0, ...rows.map((row) => row.prefix.length + row.label.length));
    const titleWidth = Math.max(0, ...rows.map((row) => row.title.length));
    const engineWidth = Math.max(0, ...rows.map((row) => row.engine.length));
    for (const row of rows) {
      const head = `${row.prefix}${row.label}`.padEnd(labelWidth);
      const title = titleWidth ? `  ${row.title.padEnd(titleWidth)}` : "";
      out.push(`${head}${title}  ${row.engine.padEnd(engineWidth)}  ${row.rest}`.trimEnd());
    }
  }
  return out.join("\n");
}

/** Every member in a tree, depth first, with the swarm it sits in. */
export function flattenMembers(tree: Tree): Array<{ fleet: string; member: MemberNode; swarm: SwarmNode | null }> {
  const out: Array<{ fleet: string; member: MemberNode; swarm: SwarmNode | null }> = [];
  const visitSwarm = (fleet: string, swarm: SwarmNode): void => {
    for (const member of swarm.members) {
      out.push({ fleet, member, swarm });
      for (const nested of member.swarms) visitSwarm(fleet, nested);
    }
    for (const nested of swarm.swarms) visitSwarm(fleet, nested);
  };
  for (const fleet of tree.fleets) {
    for (const root of fleet.roots) {
      out.push({ fleet: fleet.fleet, member: root, swarm: null });
      for (const swarm of root.swarms) visitSwarm(fleet.fleet, swarm);
    }
    for (const swarm of fleet.swarms) visitSwarm(fleet.fleet, swarm);
  }
  return out;
}

/** Every swarm in a tree, parents before children. */
export function flattenSwarms(tree: Tree): Array<{ fleet: string; swarm: SwarmNode; parentMember: string | null }> {
  const out: Array<{ fleet: string; swarm: SwarmNode; parentMember: string | null }> = [];
  const visitSwarm = (fleet: string, swarm: SwarmNode, parentMember: string | null): void => {
    out.push({ fleet, swarm, parentMember });
    for (const member of swarm.members) for (const nested of member.swarms) visitSwarm(fleet, nested, member.member);
    for (const nested of swarm.swarms) visitSwarm(fleet, nested, parentMember);
  };
  for (const fleet of tree.fleets) {
    for (const root of fleet.roots) for (const swarm of root.swarms) visitSwarm(fleet.fleet, swarm, root.member);
    for (const swarm of fleet.swarms) visitSwarm(fleet.fleet, swarm, null);
  }
  return out;
}
