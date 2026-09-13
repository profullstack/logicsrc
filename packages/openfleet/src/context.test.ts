import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claimOrDerive, context, endMember, memberCeiling, startMember } from "./context.js";
import { append, findEvents, readLedger, readRecord, recordPath, writeCurrent, writeRecord } from "./store.js";
import { DEV, FLEET, PIECE_1, ROOT, cleanup, envFor, seedWorkedExample, tempHome } from "./test-helpers.js";

const NOW = new Date("2026-09-13T05:41:12Z");

describe("claiming: the worked example's first piece", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
    seedWorkedExample(home);
  });
  afterEach(() => cleanup(home));

  it("claims the unclaimed record OPENFLEET_RECORD names, writing nothing yet", () => {
    const env = envFor(home, { OPENFLEET_RECORD: recordPath(home, FLEET, "create-two-0541-1") });
    const before = readLedger(home, FLEET).length;
    const resolution = claimOrDerive({ home, env, now: NOW, host: "dev", implicit: DEV, session: { id: "172ffd83-d296-485b-a89d-1d7cdd5abbc9", engine: "claude-code", cwd: "/x", approvals: "bypass" } });
    expect(resolution.kind).toBe("claim");
    if (resolution.kind !== "claim") throw new Error("unreachable");
    expect(resolution.record.member).toBe("create-two-0541-1");
    expect(resolution.session).toBe("172ffd83-d296-485b-a89d-1d7cdd5abbc9");
    expect(readLedger(home, FLEET).length).toBe(before);
  });

  it("then member.start is the spec's line: by the member, session the job id, piece as data", () => {
    const result = startMember(home, PIECE_1, { sessionId: "172ffd83", approvals: "bypass", now: NOW, host: "dev", implicit: DEV });
    expect(result.refused).toBeNull();
    expect(result.started).toEqual({
      at: "2026-09-13T05:41:12Z",
      event: "member.start",
      fleet: "anthony@dev",
      host: "dev",
      by: "create-two-0541-1",
      member: "create-two-0541-1",
      session: "172ffd83",
      swarm: "create-two-0541",
      parent: "460a4502",
      depth: 1,
      engine: "claude-code",
      cwd: "/home/anthony/.claude/jobs/460a4502/tmp/swarm-live",
      approvals: "bypass",
      piece: { title: "create hello.sh bash", owns: ["hello.sh"] },
    });
    const again = startMember(home, PIECE_1, { sessionId: "other", approvals: "bypass", now: NOW, host: "dev", implicit: DEV });
    expect(again.already?.session).toBe("172ffd83");
    expect(again.started).toBeNull();
    expect(findEvents(readLedger(home, FLEET), "member.start", { member: "create-two-0541-1" }).length).toBe(1);
  });

  it("keeps the record's own session when it has one: the tmux target moshcode wrote", () => {
    const piece2 = readRecord(recordPath(home, FLEET, "create-two-0541-2"))!;
    const result = startMember(home, piece2, { sessionId: "a-claude-session-id", approvals: "bypass", now: NOW, host: "dev", implicit: DEV });
    expect(result.started?.session).toBe("create-two-0541-2");
  });

  it("a claimed record makes the next session derive instead of running as that member", () => {
    startMember(home, PIECE_1, { sessionId: "172ffd83", approvals: "bypass", now: NOW, host: "dev", implicit: DEV });
    const env = envFor(home, { OPENFLEET_RECORD: recordPath(home, FLEET, "create-two-0541-1") });
    const resolution = claimOrDerive({ home, env, now: NOW, host: "dev", implicit: DEV, session: { id: "child-session", engine: "claude-p", cwd: "/x", pid: 777, approvals: "native" } });
    // Depth 2 under a ceiling of depth 1: refused, on depth, by the parent.
    expect(resolution.kind).toBe("refused");
    if (resolution.kind !== "refused") throw new Error("unreachable");
    expect(resolution.refusal.key).toBe("depth");
    expect(resolution.line).toMatchObject({ event: "ceiling.refuse", by: "create-two-0541-1", member: "child-session", action: "start", key: "depth", wanted: 2, allowed: 1 });
    expect(existsSync(recordPath(home, FLEET, "child-session"))).toBe(false);
  });
});

describe("deriving under the root: the planner's swarm of one", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
    seedWorkedExample(home);
  });
  afterEach(() => cleanup(home));

  const rootEnv = (home: string) => envFor(home, { OPENFLEET_RECORD: recordPath(home, FLEET, "460a4502") });

  it("mints <parent>-<n>, writes swarm.spawn by the parent with the command line as task, then the child record", () => {
    const resolution = claimOrDerive({
      home,
      env: rootEnv(home),
      now: new Date("2026-09-13T05:40:50Z"),
      host: "dev",
      implicit: DEV,
      session: { id: "plan-session", engine: "claude-p", cwd: "/home/anthony", pid: 4242, command: 'claude -p "Split the task below"', approvals: "bypass" },
    });
    expect(resolution.kind).toBe("derive");
    if (resolution.kind !== "derive") throw new Error("unreachable");
    // 460a4502-1 already exists in the seed, so the next is -2.
    expect(resolution.spawned).toMatchObject({ event: "swarm.spawn", by: "460a4502", swarm: "460a4502-2", task: 'claude -p "Split the task below"', ceiling: {}, pieces: [{ member: "plan-session" }] });
    expect(resolution.spawned).not.toHaveProperty("parent_swarm");
    expect(resolution.record).toEqual({
      openfleet: "0.1",
      fleet: FLEET,
      sysop: FLEET,
      member: "plan-session",
      parent: "460a4502",
      swarm: "460a4502-2",
      task: 'claude -p "Split the task below"',
      depth: 1,
      engine: "claude-p",
      session: "4242",
      host: "dev",
      cwd: "/home/anthony",
      started: "2026-09-13T05:40:50Z",
      approvals: "bypass",
      ceiling: { approvals: "bypass", depth: 1, hosts: ["dev"] },
    });
    expect(readRecord(resolution.recordPath)).toEqual(resolution.record);
    const lines = readLedger(home, FLEET);
    const spawnAt = lines.findIndex((line) => line.event === "swarm.spawn" && line.swarm === "460a4502-2");
    expect(spawnAt).toBeGreaterThan(-1);
  });

  it("joins the swarm OPENFLEET_SWARM names when the parent spawned it, taking its task and narrowing, no piece", () => {
    const resolution = claimOrDerive({
      home,
      env: envFor(home, { OPENFLEET_RECORD: recordPath(home, FLEET, "460a4502"), OPENFLEET_SWARM: "create-two-0541" }),
      now: NOW,
      host: "dev",
      implicit: DEV,
      session: { id: "joiner", engine: "claude-p", cwd: "/x", pid: 9, approvals: "bypass" },
    });
    expect(resolution.kind).toBe("derive");
    if (resolution.kind !== "derive") throw new Error("unreachable");
    expect(resolution.spawned).toBeNull();
    expect(resolution.record).toMatchObject({ member: "joiner", parent: "460a4502", swarm: "create-two-0541", task: "create two ...", depth: 1 });
    expect(resolution.record).not.toHaveProperty("piece");
    expect(resolution.record.ceiling).toEqual({ approvals: "bypass", depth: 1, hosts: ["dev"], fan_out: 4, until: "2026-09-13T06:11:01Z" });
  });

  it("ignores OPENFLEET_SWARM that names a swarm someone else spawned, and derives a swarm of one instead", () => {
    append(home, FLEET, { event: "swarm.spawn", by: "someone-else", swarm: "theirs-0600", task: "t", ceiling: {}, pieces: [] }, { host: "dev" });
    const resolution = claimOrDerive({
      home,
      env: envFor(home, { OPENFLEET_RECORD: recordPath(home, FLEET, "460a4502"), OPENFLEET_SWARM: "theirs-0600" }),
      now: NOW,
      host: "dev",
      implicit: DEV,
      session: { id: "s", engine: "claude-p", cwd: "/x", approvals: "native" },
    });
    expect(resolution.kind).toBe("derive");
    if (resolution.kind !== "derive") throw new Error("unreachable");
    expect(resolution.record.swarm).toBe("460a4502-2");
  });

  it("refuses bypass under a native root before writing anything, with by the parent and member the would-be id", () => {
    writeRecord(home, { ...ROOT, member: "aaaa1111", approvals: "native", ceiling: { approvals: "native", depth: 1, hosts: ["dev"] } });
    append(home, FLEET, { event: "member.start", by: "aaaa1111", member: "aaaa1111", session: "aaaa1111", depth: 0, engine: "claude-code", approvals: "native" }, { host: "dev" });
    const before = readLedger(home, FLEET).length;
    const resolution = claimOrDerive({
      home,
      env: envFor(home, { OPENFLEET_RECORD: recordPath(home, FLEET, "aaaa1111") }),
      now: NOW,
      host: "dev",
      implicit: DEV,
      session: { id: "wants-bypass", engine: "claude-p", cwd: "/x", approvals: "bypass" },
    });
    expect(resolution.kind).toBe("refused");
    if (resolution.kind !== "refused") throw new Error("unreachable");
    expect(resolution.line).toMatchObject({ event: "ceiling.refuse", by: "aaaa1111", member: "wants-bypass", action: "start", key: "approvals", wanted: "bypass", allowed: "native" });
    const lines = readLedger(home, FLEET);
    expect(lines.length).toBe(before + 1);
    expect(findEvents(lines, "swarm.spawn", { by: "aaaa1111" })).toEqual([]);
    expect(existsSync(recordPath(home, FLEET, "wants-bypass"))).toBe(false);
  });

  it("refuses a host the ceiling does not list", () => {
    const resolution = claimOrDerive({
      home,
      env: rootEnv(home),
      now: NOW,
      host: "netcup",
      implicit: DEV,
      session: { id: "remote", engine: "claude-p", cwd: "/x", approvals: "native" },
    });
    expect(resolution.kind).toBe("refused");
    if (resolution.kind !== "refused") throw new Error("unreachable");
    expect(resolution.refusal).toEqual({ key: "hosts", wanted: ["netcup"], allowed: ["dev"] });
  });
});

describe("root and orphan records", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
  });
  afterEach(() => cleanup(home));

  it("writes a root record in the implicit fleet under its own approvals, depth 1, this host", () => {
    const resolution = claimOrDerive({ home, env: envFor(home), now: NOW, host: "dev", implicit: DEV, session: { id: "460a4502-full-session-id", member: "460a4502", engine: "claude-code", cwd: "/home/anthony", approvals: "bypass" } });
    expect(resolution.kind).toBe("root");
    if (resolution.kind !== "root") throw new Error("unreachable");
    expect(resolution.existed).toBe(false);
    expect(resolution.record).toEqual({
      openfleet: "0.1",
      fleet: FLEET,
      sysop: FLEET,
      member: "460a4502",
      depth: 0,
      engine: "claude-code",
      host: "dev",
      cwd: "/home/anthony",
      started: "2026-09-13T05:41:12Z",
      approvals: "bypass",
      ceiling: { approvals: "bypass", depth: 1, hosts: ["dev"] },
    });
    const again = claimOrDerive({ home, env: envFor(home), now: NOW, host: "dev", implicit: DEV, session: { id: "460a4502-full-session-id", member: "460a4502", engine: "claude-code", cwd: "/elsewhere", approvals: "native" } });
    expect(again.kind).toBe("root");
    if (again.kind !== "root") throw new Error("unreachable");
    expect(again.existed).toBe(true);
    expect(again.record.cwd).toBe("/home/anthony");
  });

  it("a claude -p root carries its pid as session, the handle it is stopped by", () => {
    const resolution = claimOrDerive({ home, env: envFor(home), now: NOW, host: "dev", implicit: DEV, session: { id: "p-session", engine: "claude-p", cwd: "/x", pid: 31337, approvals: "native" } });
    if (resolution.kind !== "root") throw new Error("unreachable");
    expect(resolution.record.session).toBe("31337");
  });

  it("starting a root never refuses in the implicit fleet: the root supplies its own approvals", () => {
    const resolution = claimOrDerive({ home, env: envFor(home), now: NOW, host: "dev", implicit: DEV, session: { id: "r", engine: "claude-code", cwd: "/x", approvals: "bypass" } });
    if (resolution.kind !== "root") throw new Error("unreachable");
    const result = startMember(home, resolution.record, { sessionId: "r", approvals: "bypass", now: NOW, host: "dev", implicit: DEV });
    expect(result.started?.approvals).toBe("bypass");
  });

  it("an orphan root gets ceiling approvals native and is refused when it runs with bypass, by its own member", () => {
    const resolution = claimOrDerive({ home, env: envFor(home), now: NOW, host: "dev", implicit: DEV, session: { id: "orphan-1", engine: "claude-p", cwd: "/x", approvals: "bypass", orphan: true } });
    if (resolution.kind !== "root") throw new Error("unreachable");
    expect(resolution.record.orphan).toBe(true);
    expect(resolution.record.ceiling).toEqual({ approvals: "native", depth: 1, hosts: ["dev"] });
    const result = startMember(home, resolution.record, { sessionId: "orphan-1", approvals: "bypass", now: NOW, host: "dev", implicit: DEV });
    expect(result.started).toBeNull();
    expect(result.refused?.line).toMatchObject({ event: "ceiling.refuse", by: "orphan-1", member: "orphan-1", action: "start", key: "approvals", wanted: "bypass", allowed: "native" });
    const native = startMember(home, resolution.record, { sessionId: "orphan-1", approvals: "native", now: NOW, host: "dev", implicit: DEV });
    expect(native.started?.approvals).toBe("native");
  });

  it("an opened fleet named by current gives a root the fleet's whole ceiling; bypass under a native fleet is refused with by sysop", () => {
    append(home, "team-20260913", { event: "fleet.open", by: "sysop", fleet: "team-20260913", sysop: "https://anthony.example/profile.md", ceiling: { depth: 2, hosts: ["dev"] } }, { host: "dev" });
    writeCurrent(home, "team-20260913");
    const resolution = claimOrDerive({ home, env: envFor(home), now: NOW, host: "dev", implicit: DEV, session: { id: "r2", engine: "claude-code", cwd: "/x", approvals: "bypass" } });
    if (resolution.kind !== "root") throw new Error("unreachable");
    expect(resolution.record).toMatchObject({ fleet: "team-20260913", sysop: "https://anthony.example/profile.md", ceiling: { depth: 2, hosts: ["dev"] } });
    const result = startMember(home, resolution.record, { sessionId: "r2", approvals: "bypass", now: NOW, host: "dev", implicit: DEV });
    expect(result.refused?.line).toMatchObject({ by: "sysop", key: "approvals", wanted: "bypass", allowed: "native" });
    // OPENFLEET_FLEET in the sysop's shell overrides current.
    const other = claimOrDerive({ home, env: envFor(home, { OPENFLEET_FLEET: "elsewhere" }), now: NOW, host: "dev", implicit: DEV, session: { id: "r3", engine: "claude-code", cwd: "/x", approvals: "native" } });
    if (other.kind !== "root") throw new Error("unreachable");
    expect(other.record.fleet).toBe("elsewhere");
  });
});

describe("ending", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
    seedWorkedExample(home);
  });
  afterEach(() => cleanup(home));

  it("writes one member.end that counts, and a swarm.end only for a swarm of one", () => {
    startMember(home, PIECE_1, { sessionId: "172ffd83", approvals: "bypass", now: NOW, host: "dev", implicit: DEV });
    const first = endMember(home, FLEET, "create-two-0541-1", { state: "done", by: "create-two-0541-1", summary: "Created hello.sh", now: new Date("2026-09-13T05:41:36Z"), host: "dev" }, "create-two-0541");
    expect(first.ended).toMatchObject({ event: "member.end", by: "create-two-0541-1", member: "create-two-0541-1", state: "done", summary: "Created hello.sh" });
    expect(first.swarmEnded).toBeNull();
    const second = endMember(home, FLEET, "create-two-0541-1", { state: "stopped", by: "sysop" }, "create-two-0541");
    expect(second.ended).toBeNull();
    expect(second.already?.state).toBe("done");
  });

  it("lets a real end supersede lost, and ends a derived swarm of one with the member", () => {
    const derived = claimOrDerive({ home, env: envFor(home, { OPENFLEET_RECORD: recordPath(home, FLEET, "460a4502") }), now: NOW, host: "dev", implicit: DEV, session: { id: "p2", engine: "claude-p", cwd: "/x", approvals: "native" } });
    if (derived.kind !== "derive") throw new Error("unreachable");
    startMember(home, derived.record, { sessionId: "p2", approvals: "native", now: NOW, host: "dev", implicit: DEV });
    const lost = endMember(home, FLEET, "p2", { state: "lost", by: "sysop", now: NOW, host: "dev" }, derived.record.swarm);
    expect(lost.ended?.state).toBe("lost");
    expect(lost.swarmEnded?.state).toBe("lost");
    const real = endMember(home, FLEET, "p2", { state: "done", by: "p2", summary: "plan", now: NOW, host: "dev" }, derived.record.swarm);
    expect(real.ended?.state).toBe("done");
    // One swarm.end per swarm: the lost one stands.
    expect(real.swarmEnded).toBeNull();
    expect(findEvents(readLedger(home, FLEET), "swarm.end", { swarm: derived.record.swarm }).length).toBe(1);
  });
});

describe("context and the effective ceiling", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
    seedWorkedExample(home);
  });
  afterEach(() => cleanup(home));

  it("reads the own record first, then OPENFLEET_FLEET, then current, then the implicit fleet", () => {
    const own = context(envFor(home, { OPENFLEET_RECORD: recordPath(home, FLEET, "create-two-0541-1"), OPENFLEET_MEMBER: "create-two-0541-1", OPENFLEET_SWARM: "create-two-0541" }), { implicit: DEV });
    expect(own).toMatchObject({ home, fleet: FLEET, sysop: FLEET, implicit: true, member: "create-two-0541-1", swarm: "create-two-0541", host: "dev" });
    expect(own.record?.member).toBe("create-two-0541-1");
    expect(own.ceiling).toEqual({ approvals: "bypass", depth: 1, fan_out: 4, hosts: ["dev"], until: "2026-09-13T06:11:01Z" });

    expect(context(envFor(home, { OPENFLEET_FLEET: "named" }), { implicit: DEV })).toMatchObject({ fleet: "named", member: null, record: null });
    writeCurrent(home, "from-current");
    expect(context(envFor(home), { implicit: DEV }).fleet).toBe("from-current");
    cleanup(home);
    home = tempHome();
    expect(context(envFor(home), { implicit: DEV })).toMatchObject({ fleet: FLEET, sysop: FLEET, implicit: true, ceiling: { depth: 1, hosts: ["dev"] } });
  });

  it("lets the latest fleet.cap for a swarm win over the ceiling copied into a record", () => {
    const lines = readLedger(home, FLEET);
    expect(memberCeiling(home, lines, PIECE_1, DEV)).toEqual(PIECE_1.ceiling);
    append(home, FLEET, { event: "fleet.cap", by: "sysop", target: "create-two-0541", ceiling: { approvals: "native", until: "2026-09-13T06:00:00Z" } }, { host: "dev" });
    expect(memberCeiling(home, readLedger(home, FLEET), PIECE_1, DEV)).toEqual({ ...PIECE_1.ceiling, approvals: "native", until: "2026-09-13T06:00:00Z" });
  });

  it("computes a ceiling for a record that carries none: the fleet's, the root's approvals, the swarm path", () => {
    const { ceiling: _dropped, ...thin } = PIECE_1;
    void _dropped;
    expect(memberCeiling(home, readLedger(home, FLEET), thin, DEV)).toEqual({ approvals: "bypass", depth: 1, hosts: ["dev"], fan_out: 4, until: "2026-09-13T06:11:01Z" });
    // Whose root cannot be found reads as native.
    expect(memberCeiling(home, readLedger(home, FLEET), { ...thin, parent: "nobody" }, DEV).approvals).toBe("native");
  });
});
