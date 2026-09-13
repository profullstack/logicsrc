/**
 * Shared fixtures for the tests: a temp home, the implicit fleet of the
 * spec's worked example (`anthony@dev`), and the ledger and records that
 * morning should have produced. Excluded from the build.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { append, implicitFleet, writeRecord, type Env, type ImplicitFleet } from "./store.js";
import type { FleetRecord } from "./types.js";

export const DEV: ImplicitFleet = implicitFleet({ user: "anthony", host: "dev" });
export const FLEET = DEV.id;

export function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "openfleet-test-"));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

const OPENFLEET_KEYS = ["OPENFLEET_HOME", "OPENFLEET_RECORD", "OPENFLEET_FLEET", "OPENFLEET_MEMBER", "OPENFLEET_SWARM"] as const;

/** Snapshot the OPENFLEET_* keys of process.env and hand back a restore, so one test's environment never leaks into another file's. */
export function snapshotEnv(): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const key of OPENFLEET_KEYS) saved[key] = process.env[key];
  return () => {
    for (const key of OPENFLEET_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  };
}

/** A clean environment for a test: a home and nothing else OpenFleet knows. */
export function envFor(home: string, extra: Env = {}): Env {
  return { OPENFLEET_HOME: home, HOME: home, ...extra };
}

export const ROOT: FleetRecord = {
  openfleet: "0.1",
  fleet: FLEET,
  sysop: FLEET,
  member: "460a4502",
  depth: 0,
  engine: "claude-code",
  host: "dev",
  cwd: "/home/anthony",
  started: "2026-09-13T04:55:00Z",
  approvals: "bypass",
  ceiling: { approvals: "bypass", depth: 1, hosts: ["dev"] },
};

export const PIECE_CEILING = { approvals: "bypass" as const, depth: 1, fan_out: 4, hosts: ["dev"], until: "2026-09-13T06:11:01Z" };

export const PIECE_1: FleetRecord = {
  openfleet: "0.1",
  fleet: FLEET,
  sysop: FLEET,
  member: "create-two-0541-1",
  parent: "460a4502",
  swarm: "create-two-0541",
  task: "create two ...",
  piece: { title: "create hello.sh bash", owns: ["hello.sh"] },
  depth: 1,
  engine: "claude-code",
  host: "dev",
  cwd: "/home/anthony/.claude/jobs/460a4502/tmp/swarm-live",
  started: "2026-09-13T05:41:01Z",
  approvals: "bypass",
  ceiling: { ...PIECE_CEILING },
};

export const PIECE_2: FleetRecord = {
  ...PIECE_1,
  member: "create-two-0541-2",
  piece: { title: "create bye.sh bash", owns: ["bye.sh"] },
  engine: "moshcode/claude",
  session: "create-two-0541-2",
};

export const PLANNER = "9f1c2d3e-0000-4000-8000-000000000001";

/**
 * The morning up to the moment the two pieces are written and unclaimed:
 * the root, its planner swarm of one (done), and `swarm.spawn` for
 * create-two-0541 with both records on disk.
 */
export function seedWorkedExample(home: string): void {
  writeRecord(home, ROOT);
  append(home, FLEET, { at: "2026-09-13T04:55:01Z", event: "member.start", by: "460a4502", member: "460a4502", session: "460a4502", depth: 0, engine: "claude-code", cwd: "/home/anthony", approvals: "bypass" }, { host: "dev" });
  append(home, FLEET, { at: "2026-09-13T05:40:50Z", event: "swarm.spawn", by: "460a4502", swarm: "460a4502-1", task: 'claude -p "Split the task below into at most 4 ..."', ceiling: {}, pieces: [{ member: PLANNER }] }, { host: "dev" });
  append(home, FLEET, { at: "2026-09-13T05:40:51Z", event: "member.start", by: PLANNER, member: PLANNER, session: "4242", swarm: "460a4502-1", parent: "460a4502", depth: 1, engine: "claude-p", approvals: "bypass" }, { host: "dev" });
  append(home, FLEET, { at: "2026-09-13T05:40:59Z", event: "member.end", by: PLANNER, member: PLANNER, state: "done" }, { host: "dev" });
  append(home, FLEET, { at: "2026-09-13T05:40:59Z", event: "swarm.end", by: PLANNER, swarm: "460a4502-1", state: "done" }, { host: "dev" });
  append(
    home,
    FLEET,
    {
      at: "2026-09-13T05:41:01Z",
      event: "swarm.spawn",
      by: "460a4502",
      swarm: "create-two-0541",
      task: "create two ...",
      ceiling: { fan_out: 4, until: "2026-09-13T06:11:01Z" },
      pieces: [
        { member: "create-two-0541-1", title: "create hello.sh bash", owns: ["hello.sh"] },
        { member: "create-two-0541-2", title: "create bye.sh bash", owns: ["bye.sh"] },
      ],
    },
    { host: "dev" },
  );
  writeRecord(home, PIECE_1);
  writeRecord(home, PIECE_2);
}

/** The rest of the morning: both pieces claimed, the first done. */
export function seedWorkedExampleToEnd(home: string): void {
  seedWorkedExample(home);
  append(home, FLEET, { at: "2026-09-13T05:41:12Z", event: "member.start", by: "create-two-0541-1", member: "create-two-0541-1", session: "172ffd83", swarm: "create-two-0541", parent: "460a4502", depth: 1, engine: "claude-code", cwd: PIECE_1.cwd, approvals: "bypass", piece: PIECE_1.piece }, { host: "dev" });
  append(home, FLEET, { at: "2026-09-13T05:41:13Z", event: "member.start", by: "create-two-0541-2", member: "create-two-0541-2", session: "create-two-0541-2", swarm: "create-two-0541", parent: "460a4502", depth: 1, engine: "moshcode/claude", cwd: PIECE_2.cwd, approvals: "bypass", piece: PIECE_2.piece }, { host: "dev" });
  append(home, FLEET, { at: "2026-09-13T05:41:36Z", event: "member.end", by: "create-two-0541-1", member: "create-two-0541-1", state: "done", summary: "Created hello.sh, mode -rwxrwxr-x, prints hello." }, { host: "dev" });
}
