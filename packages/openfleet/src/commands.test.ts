import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT, registerOpenFleetCommands, type Deps } from "./commands.js";
import { startMember } from "./context.js";
import { append, findEvents, readCurrent, readLedger, recordPath, writeRecord } from "./store.js";
import { DEV, FLEET, PIECE_1, PIECE_2, ROOT, cleanup, envFor, seedWorkedExample, seedWorkedExampleToEnd, tempHome } from "./test-helpers.js";
import type { RosterRow } from "./types.js";

const NOW = new Date("2026-09-13T06:00:00Z");

interface Harness {
  run: (...argv: string[]) => Promise<number>;
  out: string[];
  err: string[];
  raw: string[];
  execs: string[][];
  kills: number[];
  deps: Deps;
}

function harness(home: string, extra: Partial<Deps> = {}, env: Record<string, string> = {}): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const raw: string[] = [];
  const execs: string[][] = [];
  const kills: number[] = [];
  const deps: Deps = {
    env: envFor(home, env),
    now: () => NOW,
    exec: async (file, args) => {
      execs.push([file, ...args]);
      return { code: 0, stdout: "", stderr: "" };
    },
    kill: (pid) => {
      kills.push(pid);
    },
    rosters: {},
    stdin: async () => "",
    write: (line) => out.push(line),
    error: (line) => err.push(line),
    stdout: (text) => raw.push(text),
    stderr: (text) => raw.push(text),
    host: "dev",
    user: "anthony",
    ...extra,
  };
  const run = async (...argv: string[]): Promise<number> => {
    const program = new Command();
    program.name("logicsrc").enablePositionalOptions().exitOverride();
    const fleet = program.command("fleet");
    registerOpenFleetCommands(fleet, deps);
    process.exitCode = 0;
    await program.parseAsync(["node", "logicsrc", "fleet", ...argv]);
    const code = Number(process.exitCode ?? 0);
    process.exitCode = 0;
    return code;
  };
  return { run, out, err, raw, execs, kills, deps };
}

describe("open", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
  });
  afterEach(() => {
    cleanup(home);
    process.exitCode = 0;
  });

  it("mints <name>-<yyyymmdd>, writes fleet.open by sysop with the ceiling from flags, writes current, prints the id", async () => {
    const h = harness(home);
    expect(await h.run("open", "team", "--approvals", "bypass", "--budget", "20 USD", "--depth", "2", "--fan-out", "4", "--hosts", "dev,netcup", "--until", "2h")).toBe(0);
    expect(h.out).toEqual(["team-20260913"]);
    expect(readCurrent(home)).toBe("team-20260913");
    const lines = readLedger(home, "team-20260913");
    expect(lines).toEqual([
      { at: "2026-09-13T06:00:00Z", event: "fleet.open", fleet: "team-20260913", host: "dev", by: "sysop", sysop: "anthony@dev", ceiling: { approvals: "bypass", budget: "20 USD", depth: 2, fan_out: 4, hosts: ["dev", "netcup"], until: "2026-09-13T08:00:00Z" } },
    ]);
    // A second fleet the same day gets a suffix; a bare open uses "fleet" and this host.
    expect(await h.run("open", "team", "--json")).toBe(0);
    expect(JSON.parse(h.out[1])).toMatchObject({ fleet: "team-20260913-2", sysop: "anthony@dev", ceiling: { hosts: ["dev"] } });
    expect(await h.run("open", "--sysop", "https://anthony.example/profile.md")).toBe(0);
    expect(h.out[2]).toBe("fleet-20260913");
    expect(readLedger(home, "fleet-20260913")[0].sysop).toBe("https://anthony.example/profile.md");
  });

  it("refuses with exit 4 when the caller carries OPENFLEET_MEMBER, and rejects bad flags with exit 2", async () => {
    const agent = harness(home, {}, { OPENFLEET_MEMBER: "create-two-0541-1" });
    expect(await agent.run("open")).toBe(EXIT.REFUSED);
    expect(agent.err[0]).toMatch(/sysop's.*OPENFLEET_MEMBER=create-two-0541-1/);
    expect(existsSync(join(home, "fleets"))).toBe(false);
    const h = harness(home);
    expect(await h.run("open", "--approvals", "sometimes")).toBe(EXIT.INVALID);
    expect(await h.run("open", "--budget", "20")).toBe(EXIT.INVALID);
    expect(await h.run("open", "--depth", "-1")).toBe(EXIT.INVALID);
    expect(await h.run("open", "--until", "later")).toBe(EXIT.INVALID);
    expect(existsSync(join(home, "fleets"))).toBe(false);
  });
});

describe("cap", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
    seedWorkedExampleToEnd(home);
  });
  afterEach(() => {
    cleanup(home);
    process.exitCode = 0;
  });

  it("narrows a running swarm and stops the bypass member now above the native ceiling, through its engine", async () => {
    const h = harness(home);
    expect(await h.run("cap", "create-two-0541", "--approvals", "native")).toBe(0);
    const lines = readLedger(home, FLEET);
    expect(findEvents(lines, "fleet.cap")[0]).toMatchObject({ by: "sysop", target: "create-two-0541", ceiling: { approvals: "native" } });
    expect(h.execs).toEqual([["moshcode", "herd", "kill", "create-two-0541-2"]]);
    expect(findEvents(lines, "member.end", { member: "create-two-0541-2" })[0]).toMatchObject({ by: "sysop", state: "stopped" });
    expect(h.out[0]).toBe('capped swarm create-two-0541: {"approvals":"native"}');
    expect(h.out[1]).toBe("stopped  create-two-0541-2  moshcode/claude  stopped");
    // The already-done member was left alone, and the root, outside the swarm, was not touched.
    expect(findEvents(lines, "member.end", { member: "create-two-0541-1" }).length).toBe(1);
    expect(findEvents(lines, "member.end", { member: "460a4502" })).toEqual([]);
  });

  it("sets a fleet's whole ceiling, refuses an agent, and says when the target does not exist", async () => {
    const h = harness(home);
    expect(await h.run("cap", FLEET, "--approvals", "native", "--json")).toBe(0);
    const result = JSON.parse(h.out[0]);
    expect(result).toMatchObject({ target: FLEET, kind: "fleet", ceiling: { approvals: "native", hosts: ["dev"] } });
    // The root ran with bypass; under a native fleet ceiling it is stopped through claude.
    expect(h.execs).toContainEqual(["claude", "stop", "460a4502"]);
    expect(result.stopped.map((row: { member: string }) => row.member)).toContain("460a4502");
    expect(await h.run("cap", "nope", "--depth", "1")).toBe(EXIT.NOT_FOUND);
    expect(await h.run("cap", "create-two-0541")).toBe(EXIT.INVALID);
    const agent = harness(home, {}, { OPENFLEET_MEMBER: "460a4502" });
    expect(await agent.run("cap", "create-two-0541", "--depth", "1")).toBe(EXIT.REFUSED);
  });

  it("refuses a cap that would widen a swarm before writing anything: a cap on a swarm only narrows", async () => {
    const h = harness(home);
    expect(await h.run("cap", "create-two-0541", "--fan-out", "8")).toBe(EXIT.INVALID);
    expect(h.err[0]).toBe("cap on swarm create-two-0541 never widens: fan_out 8 is not within 4");
    expect(await h.run("cap", "create-two-0541", "--depth", "2")).toBe(EXIT.INVALID);
    expect(await h.run("cap", "create-two-0541", "--until", "2026-09-13T07:00:00Z")).toBe(EXIT.INVALID);
    expect(await h.run("cap", "create-two-0541", "--hosts", "dev,netcup")).toBe(EXIT.INVALID);
    expect(findEvents(readLedger(home, FLEET), "fleet.cap")).toEqual([]);
    expect(h.execs).toEqual([]);
    // Equal or narrower lands.
    expect(await h.run("cap", "create-two-0541", "--fan-out", "2", "--until", "2026-09-13T06:05:00Z")).toBe(0);
    expect(findEvents(readLedger(home, FLEET), "fleet.cap")[0]).toMatchObject({ target: "create-two-0541", ceiling: { fan_out: 2, until: "2026-09-13T06:05:00Z" } });
  });
});

describe("tree", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
    seedWorkedExampleToEnd(home);
  });
  afterEach(() => {
    cleanup(home);
    process.exitCode = 0;
  });

  it("prints the tree, or JSON, and writes member.end lost for a recorded member its engine no longer lists", async () => {
    const h = harness(home);
    expect(await h.run("tree")).toBe(0);
    expect(h.out[0].split("\n")[0]).toBe("anthony@dev  (implicit fleet, sysop anthony@dev, depth 1, hosts dev)");
    expect(h.out[0]).toContain("swarm create-two-0541");
    expect(await h.run("tree", "--json")).toBe(0);
    expect(JSON.parse(h.out[1]).fleets[0].roots[0].member).toBe("460a4502");
    expect(await h.run("tree", "nope")).toBe(EXIT.NOT_FOUND);

    const moshcode = async (): Promise<RosterRow[]> => [];
    const rostered = harness(home, { rosters: { moshcode } });
    expect(await rostered.run("tree")).toBe(0);
    expect(rostered.out[0]).toMatch(/create-two-0541-2 +create bye.sh bash +moshcode\/claude +lost/);
    expect(findEvents(readLedger(home, FLEET), "member.end", { member: "create-two-0541-2" })[0]).toMatchObject({ by: "sysop", state: "lost" });
    // As an agent, the lost line is by that agent.
    const asAgent = harness(home, { rosters: { claude: async () => [] } }, { OPENFLEET_MEMBER: "create-two-0541-1" });
    expect(await asAgent.run("tree")).toBe(0);
    expect(findEvents(readLedger(home, FLEET), "member.end", { member: "460a4502" })[0]).toMatchObject({ by: "create-two-0541-1", state: "lost" });
    // --no-roster reads nothing and writes nothing.
    const quiet = harness(home, { rosters: { claude: async () => { throw new Error("should not be read"); } } });
    expect(await quiet.run("tree", "--no-roster")).toBe(0);
  });

  it("never marks an interactive claude session lost: the roster cannot hold it", async () => {
    const interactive = "68aca9c1-1111-4222-8333-444455556666";
    append(home, FLEET, { at: "2026-09-13T05:50:00Z", event: "member.start", by: interactive, member: interactive, session: interactive, depth: 0, engine: "claude-code", cwd: "/x", approvals: "native" }, { host: "dev" });
    const h = harness(home, { rosters: { claude: async () => [] } });
    expect(await h.run("tree")).toBe(0);
    expect(findEvents(readLedger(home, FLEET), "member.end", { member: interactive })).toEqual([]);
    expect(h.out[0]).toMatch(new RegExp(`${interactive} +claude-code +working$`, "m"));
    // The background job beside it, same roster, is lost.
    expect(findEvents(readLedger(home, FLEET), "member.end", { member: "460a4502" })[0]).toMatchObject({ state: "lost" });
  });

  it("enforces a deadline: a working member past its effective until is stopped through its engine and ends timeout, then its swarm ends", async () => {
    // The worked example's swarm runs until 06:11:01Z; the clock reads 06:30.
    const late = harness(home, { now: () => new Date("2026-09-13T06:30:00Z") });
    expect(await late.run("tree")).toBe(0);
    expect(late.execs).toEqual([["moshcode", "herd", "kill", "create-two-0541-2"]]);
    const lines = readLedger(home, FLEET);
    expect(findEvents(lines, "member.end", { member: "create-two-0541-2" })[0]).toMatchObject({ by: "sysop", state: "timeout", at: "2026-09-13T06:30:00Z" });
    expect(findEvents(lines, "swarm.end", { swarm: "create-two-0541" })[0]).toMatchObject({ by: "sysop", state: "timeout" });
    // The root has no deadline and is left alone.
    expect(findEvents(lines, "member.end", { member: "460a4502" })).toEqual([]);
    expect(late.out[0]).toMatch(/create-two-0541-2 +create bye.sh bash +moshcode\/claude +timeout/);
    expect(late.out[0]).toMatch(/swarm create-two-0541 +"create two \.\.\." +2\/4 members +timeout/);
    expect(late.out.slice(1)).toEqual(["stopped  create-two-0541-2  moshcode/claude  timeout", "ended    swarm create-two-0541  timeout"]);
    // A second run finds everything ended and writes nothing more.
    const again = harness(home, { now: () => new Date("2026-09-13T06:31:00Z") });
    expect(await again.run("tree", "--json")).toBe(0);
    expect(again.execs).toEqual([]);
    expect(JSON.parse(again.out[0]).enforced).toEqual({ members: [], swarms: [] });
    expect(findEvents(readLedger(home, FLEET), "swarm.end", { swarm: "create-two-0541" }).length).toBe(1);
  });

  it("leaves enforcement to the sysop: an agent's tree stops nothing", async () => {
    const agent = harness(home, { now: () => new Date("2026-09-13T06:30:00Z") }, { OPENFLEET_MEMBER: "460a4502" });
    expect(await agent.run("tree")).toBe(0);
    expect(agent.execs).toEqual([]);
    expect(findEvents(readLedger(home, FLEET), "member.end", { member: "create-two-0541-2" })).toEqual([]);
  });

  it("enforces a budget: a swarm whose spend has reached its budget has its members stopped with budget, siblings outside it untouched", async () => {
    const fleet = "team-20260913";
    append(home, fleet, { at: "2026-09-13T05:00:00Z", event: "fleet.open", by: "sysop", fleet, sysop: "anthony@dev", ceiling: { approvals: "bypass", depth: 2, hosts: ["dev"], budget: "20 USD" } }, { host: "dev" });
    append(home, fleet, { at: "2026-09-13T05:01:00Z", event: "swarm.spawn", by: "sysop", swarm: "hand-0501", task: "by hand", ceiling: { budget: "5 USD" }, pieces: [{ member: "hand-0501-1" }, { member: "hand-0501-2" }] }, { host: "dev" });
    append(home, fleet, { at: "2026-09-13T05:02:00Z", event: "member.start", by: "hand-0501-1", member: "hand-0501-1", session: "hand-0501-1", swarm: "hand-0501", depth: 0, engine: "moshcode/codex", approvals: "native" }, { host: "dev" });
    append(home, fleet, { at: "2026-09-13T05:02:01Z", event: "member.start", by: "hand-0501-2", member: "hand-0501-2", session: "hand-0501-2", swarm: "hand-0501", depth: 0, engine: "moshcode/kimi", approvals: "native" }, { host: "dev" });
    append(home, fleet, { at: "2026-09-13T05:03:00Z", event: "member.start", by: "aaaa0001", member: "aaaa0001", session: "aaaa0001", depth: 0, engine: "claude-code", approvals: "native" }, { host: "dev" });
    append(home, fleet, { at: "2026-09-13T05:05:00Z", event: "member.spend", by: "hand-0501-1", member: "hand-0501-1", amount: "3 USD", total: "3 USD" }, { host: "dev" });
    append(home, fleet, { at: "2026-09-13T05:06:00Z", event: "member.spend", by: "hand-0501-2", member: "hand-0501-2", amount: "2 USD", total: "2 USD" }, { host: "dev" });
    const h = harness(home);
    expect(await h.run("tree", fleet)).toBe(0);
    expect(h.execs).toEqual([
      ["moshcode", "herd", "kill", "hand-0501-1"],
      ["moshcode", "herd", "kill", "hand-0501-2"],
    ]);
    const lines = readLedger(home, fleet);
    expect(findEvents(lines, "member.end").map((line) => [line.member, line.state, line.by])).toEqual([
      ["hand-0501-1", "budget", "sysop"],
      ["hand-0501-2", "budget", "sysop"],
    ]);
    expect(findEvents(lines, "swarm.end", { swarm: "hand-0501" })[0]).toMatchObject({ state: "budget", by: "sysop" });
    expect(h.out[0]).toMatch(/swarm hand-0501 +"by hand" +2 members +budget {2}5\/5 USD/);
    expect(h.out[0]).toMatch(/aaaa0001 +claude-code +working$/m);
    // The fleet's own budget: raise the spend past 20 USD and the root goes too.
    append(home, fleet, { at: "2026-09-13T06:00:01Z", event: "member.spend", by: "aaaa0001", member: "aaaa0001", amount: "15 USD", total: "15 USD" }, { host: "dev" });
    const over = harness(home, { now: () => new Date("2026-09-13T06:01:00Z") });
    expect(await over.run("tree", fleet, "--json")).toBe(0);
    expect(over.execs).toEqual([["claude", "stop", "aaaa0001"]]);
    expect(findEvents(readLedger(home, fleet), "member.end", { member: "aaaa0001" })[0]).toMatchObject({ state: "budget" });
    expect(JSON.parse(over.out[0]).enforced.members).toEqual([{ member: "aaaa0001", engine: "claude-code", stopped: true, state: "budget" }]);
  });
});

describe("stop", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
    seedWorkedExampleToEnd(home);
  });
  afterEach(() => {
    cleanup(home);
    process.exitCode = 0;
  });

  it("ends a swarm as one unit: nested swarms first, members through their engines, then one swarm.end", async () => {
    // A nested swarm spawned by the second piece, with a claude-p member and a tmux member.
    append(home, FLEET, { at: "2026-09-13T05:50:00Z", event: "swarm.spawn", by: "create-two-0541-2", swarm: "nested-0550", parent_swarm: "create-two-0541", task: "nested", ceiling: {}, pieces: [{ member: "nested-0550-1" }, { member: "nested-0550-2" }] }, { host: "dev" });
    append(home, FLEET, { at: "2026-09-13T05:50:01Z", event: "member.start", by: "nested-0550-1", member: "nested-0550-1", session: "31337", swarm: "nested-0550", parent: "create-two-0541-2", depth: 2, engine: "claude-p", approvals: "native" }, { host: "dev" });
    append(home, FLEET, { at: "2026-09-13T05:50:02Z", event: "member.start", by: "nested-0550-2", member: "nested-0550-2", session: "%7", swarm: "nested-0550", parent: "create-two-0541-2", depth: 2, engine: "tmux", approvals: "native" }, { host: "dev" });
    const h = harness(home);
    expect(await h.run("stop", "create-two-0541")).toBe(0);
    expect(h.kills).toEqual([31337]);
    expect(h.execs).toEqual([
      ["tmux", "-L", "moshcode", "kill-pane", "-t", "%7"],
      ["moshcode", "herd", "kill", "create-two-0541-2"],
    ]);
    const lines = readLedger(home, FLEET);
    const events = lines.filter((line) => Date.parse(line.at) >= NOW.getTime()).map((line) => `${line.event} ${line.member ?? line.swarm} ${line.state} ${line.by}`);
    expect(events).toEqual([
      "member.end nested-0550-1 stopped sysop",
      "member.end nested-0550-2 stopped sysop",
      "swarm.end nested-0550 stopped sysop",
      "member.end create-two-0541-2 stopped sysop",
      "swarm.end create-two-0541 stopped sysop",
    ]);
    expect(h.out).toEqual([
      "stopped  nested-0550-1  claude-p  stopped",
      "stopped  nested-0550-2  tmux  stopped",
      "ended    swarm nested-0550  stopped",
      "skipped  create-two-0541-1  claude-code  done  (already ended)",
      "stopped  create-two-0541-2  moshcode/claude  stopped",
      "ended    swarm create-two-0541  stopped",
    ]);
    // Stopping again touches nothing: one swarm.end per swarm, no end line for an ended member.
    const again = harness(home);
    expect(await again.run("stop", "create-two-0541", "--json")).toBe(0);
    expect(again.execs).toEqual([]);
    expect(findEvents(readLedger(home, FLEET), "swarm.end", { swarm: "create-two-0541" }).length).toBe(1);
    expect(JSON.parse(again.out[0]).swarms).toEqual([{ swarm: "nested-0550", state: "stopped", ended: false, note: "already ended" }, { swarm: "create-two-0541", state: "stopped", ended: false, note: "already ended" }]);
  });

  it("stops one member through claude, by the caller, and reports an engine that says no", async () => {
    const h = harness(home);
    expect(await h.run("stop", "460a4502")).toBe(0);
    expect(h.execs).toEqual([["claude", "stop", "460a4502"]]);
    expect(findEvents(readLedger(home, FLEET), "member.end", { member: "460a4502" })[0]).toMatchObject({ by: "sysop", state: "stopped" });
    const failing = harness(home, { exec: async () => ({ code: 1, stdout: "", stderr: "no such session" }) });
    expect(await failing.run("stop", "create-two-0541-2")).toBe(EXIT.NOT_FOUND);
    expect(failing.out[0]).toContain("no such session");
    expect(findEvents(readLedger(home, FLEET), "member.end", { member: "create-two-0541-2" })).toEqual([]);
    expect(await h.run("stop", "nobody")).toBe(EXIT.NOT_FOUND);
  });

  it("stops a claude-code member by its job id: the member of a background job, else the first eight characters of a session UUID, and says when there is none", async () => {
    const uuid = "68aca9c1-1111-4222-8333-444455556666";
    append(home, FLEET, { at: "2026-09-13T05:50:00Z", event: "member.start", by: "piece-x", member: "piece-x", session: uuid, depth: 0, engine: "claude-code", approvals: "native" }, { host: "dev" });
    append(home, FLEET, { at: "2026-09-13T05:51:00Z", event: "member.start", by: uuid, member: uuid, session: uuid, depth: 0, engine: "claude-code", approvals: "native" }, { host: "dev" });
    const h = harness(home);
    expect(await h.run("stop", "piece-x")).toBe(0);
    expect(h.execs).toEqual([["claude", "stop", "68aca9c1"]]);
    const interactive = harness(home);
    expect(await interactive.run("stop", uuid, "--json")).toBe(EXIT.NOT_FOUND);
    expect(interactive.execs).toEqual([]);
    expect(JSON.parse(interactive.out[0]).members[0]).toMatchObject({ member: uuid, stopped: false, error: expect.stringContaining("claude stop cannot end it") });
    expect(findEvents(readLedger(home, FLEET), "member.end", { member: uuid })).toEqual([]);
  });

  it("writes no swarm.end while a member's engine would not stop, or a nested swarm has no swarm.end, and exits non-zero", async () => {
    append(home, FLEET, { at: "2026-09-13T05:50:00Z", event: "swarm.spawn", by: "create-two-0541-2", swarm: "nested-0550", parent_swarm: "create-two-0541", task: "nested", ceiling: {}, pieces: [{ member: "nested-0550-1" }] }, { host: "dev" });
    append(home, FLEET, { at: "2026-09-13T05:50:02Z", event: "member.start", by: "nested-0550-1", member: "nested-0550-1", session: "%7", swarm: "nested-0550", parent: "create-two-0541-2", depth: 2, engine: "tmux", approvals: "native" }, { host: "dev" });
    // tmux says no; moshcode says yes.
    const h = harness(home, { exec: async (file) => (file === "tmux" ? { code: 1, stdout: "", stderr: "can't find pane: %7" } : { code: 0, stdout: "", stderr: "" }) });
    expect(await h.run("stop", "create-two-0541")).toBe(EXIT.NOT_FOUND);
    const lines = readLedger(home, FLEET);
    expect(findEvents(lines, "member.end", { member: "nested-0550-1" })).toEqual([]);
    expect(findEvents(lines, "swarm.end", { swarm: "nested-0550" })).toEqual([]);
    expect(findEvents(lines, "swarm.end", { swarm: "create-two-0541" })).toEqual([]);
    expect(findEvents(lines, "member.end", { member: "create-two-0541-2" })[0]).toMatchObject({ state: "stopped" });
    expect(h.out).toEqual([
      "skipped  nested-0550-1  tmux  (tmux kill-pane -t %7 exited 1: can't find pane: %7)",
      "left    swarm nested-0550  open  (no end line yet for nested-0550-1)",
      "skipped  create-two-0541-1  claude-code  done  (already ended)",
      "stopped  create-two-0541-2  moshcode/claude  stopped",
      "left    swarm create-two-0541  open  (no swarm.end yet for nested nested-0550)",
    ]);
    // Once the pane can be ended, the nested swarm and then the target end, each once.
    const later = harness(home);
    expect(await later.run("stop", "create-two-0541", "--json")).toBe(0);
    expect(later.execs).toEqual([["tmux", "-L", "moshcode", "kill-pane", "-t", "%7"]]);
    expect(JSON.parse(later.out[0]).swarms).toEqual([{ swarm: "nested-0550", state: "stopped", ended: true }, { swarm: "create-two-0541", state: "stopped", ended: true }]);
  });

  it("lets an agent stop only the swarm it spawned and what sits under it", async () => {
    const spawner = harness(home, {}, { OPENFLEET_MEMBER: "460a4502" });
    expect(await spawner.run("stop", "create-two-0541-2")).toBe(0);
    expect(findEvents(readLedger(home, FLEET), "member.end", { member: "create-two-0541-2" })[0].by).toBe("460a4502");
    const sibling = harness(home, {}, { OPENFLEET_MEMBER: "create-two-0541-1" });
    expect(await sibling.run("stop", "create-two-0541")).toBe(EXIT.REFUSED);
    expect(sibling.err[0]).toMatch(/outside the subtree create-two-0541-1 spawned/);
    expect(await sibling.run("stop", "460a4502")).toBe(EXIT.REFUSED);
    expect(await sibling.run("stop", FLEET, "--fleet")).toBe(EXIT.REFUSED);
    expect(sibling.execs).toEqual([]);
  });

  it("--fleet stops every swarm and every root", async () => {
    const h = harness(home);
    expect(await h.run("stop", FLEET, "--fleet")).toBe(0);
    expect(h.execs).toEqual([
      ["moshcode", "herd", "kill", "create-two-0541-2"],
      ["claude", "stop", "460a4502"],
    ]);
    const lines = readLedger(home, FLEET);
    expect(findEvents(lines, "swarm.end", { swarm: "create-two-0541" })[0]).toMatchObject({ state: "stopped" });
    expect(findEvents(lines, "member.end", { member: "460a4502" })[0]).toMatchObject({ state: "stopped", by: "sysop" });
  });
});

describe("log", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
    seedWorkedExampleToEnd(home);
  });
  afterEach(() => {
    cleanup(home);
    process.exitCode = 0;
  });

  it("prints one line per event, or JSON Lines, filtered by member, swarm and since", async () => {
    const h = harness(home);
    expect(await h.run("log")).toBe(0);
    expect(h.out.length).toBe(9);
    expect(h.out[0]).toMatch(/^2026-09-13T04:55:01Z {2}member.start {4}460a4502 +member 460a4502 engine claude-code approvals bypass$/);
    expect(h.out[8]).toMatch(/^2026-09-13T05:41:36Z {2}member.end {6}create-two-0541-1 +member create-two-0541-1 done Created hello.sh, mode -rwxrwxr-x, prints hello.$/);
    expect(h.out[5]).toContain('swarm create-two-0541 task create two ... pieces 2 narrowed {"fan_out":4,"until":"2026-09-13T06:11:01Z"}');

    const json = harness(home);
    expect(await json.run("log", FLEET, "--json", "--member", "create-two-0541-1")).toBe(0);
    expect(json.out.map((line) => JSON.parse(line).event)).toEqual(["member.start", "member.end"]);

    const swarm = harness(home);
    expect(await swarm.run("log", "--swarm", "create-two-0541")).toBe(0);
    expect(swarm.out.map((line) => line.split(/ {2}/)[1].trim())).toEqual(["swarm.spawn", "member.start", "member.start", "member.end"]);

    const since = harness(home);
    expect(await since.run("log", "--since", "2026-09-13T05:41:30Z")).toBe(0);
    expect(since.out.length).toBe(1);
    expect(await since.run("log", "--since", "1h")).toBe(0);
    expect(since.out.length).toBe(1 + 8);
    expect(await since.run("log", "--since", "whenever")).toBe(EXIT.INVALID);
    expect(await since.run("log", "nope")).toBe(EXIT.NOT_FOUND);
    const empty = harness(tempHome());
    expect(await empty.run("log")).toBe(0);
    expect(empty.out).toEqual(["(no events)"]);
  });
});

describe("hooks and hook", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
  });
  afterEach(() => {
    cleanup(home);
    process.exitCode = 0;
  });

  it("installs, reports and removes over --settings-file, never the real one", async () => {
    const file = join(home, "settings.json");
    const h = harness(home);
    expect(await h.run("hooks", "status", "--settings-file", file)).toBe(0);
    expect(h.out[0]).toBe(`${file}: not installed`);
    expect(await h.run("hooks", "install", "--settings-file", file)).toBe(0);
    expect(h.out[6]).toBe(`wrote 5 hooks in ${file}`);
    expect(JSON.parse(readFileSync(file, "utf8")).hooks.SessionStart[0].hooks[0].command).toBe("command -v logicsrc >/dev/null 2>&1 && logicsrc fleet hook SessionStart; exit 0");
    expect(await h.run("hooks", "install", "--settings-file", file, "--json")).toBe(0);
    expect(JSON.parse(h.out[12]).written).toBe(0);
    expect(await h.run("hooks", "status", "--settings-file", file)).toBe(0);
    expect(h.out[13]).toBe(`${file}: installed`);
    expect(await h.run("hooks", "remove", "--settings-file", file)).toBe(0);
    expect(h.out[19]).toBe(`removed 5 hooks from ${file}`);
    // With HOME pointed at the temp dir, the default file lands there too.
    expect(await h.run("hooks", "install", "--dry-run")).toBe(0);
    expect(h.out[20]).toBe(`would write 5 hooks in ${join(home, ".claude", "settings.json")}`);
    expect(existsSync(join(home, ".claude", "settings.json"))).toBe(false);
  });

  it("runs a hook over stdin and writes its verdict raw", async () => {
    seedWorkedExample(home);
    const sessionId = "68aca9c1-1111-4222-8333-444455556666";
    const start = harness(home, {
      stdin: async () => JSON.stringify({ session_id: sessionId, cwd: "/x", source: "startup" }),
      hookIo: { readProcCmdline: () => ["claude"], readProcEnviron: () => ({}), appendFile: () => undefined },
    }, { OPENFLEET_RECORD: recordPath(home, FLEET, "create-two-0541-1"), CLAUDE_PID: "1" });
    expect(await start.run("hook", "SessionStart")).toBe(0);
    expect(start.raw).toEqual(["OpenFleet: you are member create-two-0541-1 of fleet anthony@dev, piece create hello.sh bash, owns hello.sh\n"]);
    const deny = harness(home, { stdin: async () => JSON.stringify({ session_id: sessionId, cwd: "/x", tool_name: "Write", tool_input: { file_path: "bye.sh" } }) });
    expect(await deny.run("hook", "PreToolUse")).toBe(0);
    expect(JSON.parse(deny.raw[0]).hookSpecificOutput.permissionDecision).toBe("deny");
    // A refused start comes back as exit 2 with the reason on stderr.
    writeRecord(home, { ...ROOT, member: "native-root", approvals: "native", ceiling: { approvals: "native", depth: 1, hosts: ["dev"] } });
    startMember(home, { ...ROOT, member: "native-root", approvals: "native", ceiling: { approvals: "native", depth: 1, hosts: ["dev"] } }, { sessionId: "native-root", approvals: "native", now: NOW, host: "dev", implicit: DEV });
    const child = "cafe0000-1111-4222-8333-444455556666";
    const refused = harness(home, {
      stdin: async () => JSON.stringify({ session_id: child, cwd: "/x", source: "startup" }),
      hookIo: { readProcCmdline: () => ["claude", "--dangerously-skip-permissions"], readProcEnviron: () => ({}), appendFile: () => undefined },
    }, { OPENFLEET_RECORD: recordPath(home, FLEET, "native-root"), CLAUDE_PID: "1" });
    expect(await refused.run("hook", "SessionStart")).toBe(0);
    expect(refused.raw[0]).toBe("OpenFleet: start refused, ceiling refuses approvals: wanted bypass, allowed native\n");
    const prompt = harness(home, { stdin: async () => JSON.stringify({ session_id: child, cwd: "/x", permission_mode: "bypassPermissions", prompt: "go" }) });
    expect(await prompt.run("hook", "UserPromptSubmit")).toBe(2);
    expect(prompt.raw[0]).toBe("OpenFleet refused the start: ceiling refuses approvals: wanted bypass, allowed native\n");
    void PIECE_2;
  });
});
