import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flattenMembers, flattenSwarms, fold, renderTree } from "./fold.js";
import { append, writeRecord } from "./store.js";
import { DEV, FLEET, PLANNER, ROOT, cleanup, seedWorkedExampleToEnd, tempHome } from "./test-helpers.js";
import type { RosterRow } from "./types.js";

describe("fold: the worked example", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
    seedWorkedExampleToEnd(home);
  });
  afterEach(() => cleanup(home));

  it("builds the implicit fleet, the root, the planner's swarm of one and the two-piece swarm", async () => {
    const tree = await fold(home, {}, { implicit: DEV, host: "dev" });
    expect(tree.fleets.length).toBe(1);
    const fleet = tree.fleets[0];
    expect(fleet).toMatchObject({ fleet: FLEET, sysop: FLEET, implicit: true, ceiling: { depth: 1, hosts: ["dev"] }, swarms: [] });
    expect(fleet.roots.length).toBe(1);
    const root = fleet.roots[0];
    expect(root).toMatchObject({ member: "460a4502", engine: "claude-code", depth: 0, state: "working", approvals: "bypass", host: "dev" });
    expect(root.alive).toBeUndefined();
    expect(root.swarms.map((swarm) => swarm.swarm)).toEqual(["460a4502-1", "create-two-0541"]);

    const planner = root.swarms[0];
    expect(planner).toMatchObject({ by: "460a4502", state: "done", ceiling: {} });
    expect(planner.members.map((member) => [member.member, member.session, member.engine, member.state])).toEqual([[PLANNER, "4242", "claude-p", "done"]]);

    const swarm = root.swarms[1];
    expect(swarm).toMatchObject({ task: "create two ...", by: "460a4502", ceiling: { fan_out: 4, until: "2026-09-13T06:11:01Z" } });
    expect(swarm.state).toBeUndefined();
    expect(swarm.members.map((member) => ({ member: member.member, session: member.session, title: member.title, engine: member.engine, state: member.state, approvals: member.approvals, owns: member.owns, depth: member.depth }))).toEqual([
      { member: "create-two-0541-1", session: "172ffd83", title: "create hello.sh bash", engine: "claude-code", state: "done", approvals: "bypass", owns: ["hello.sh"], depth: 1 },
      { member: "create-two-0541-2", session: "create-two-0541-2", title: "create bye.sh bash", engine: "moshcode/claude", state: "working", approvals: "bypass", owns: ["bye.sh"], depth: 1 },
    ]);
    expect(swarm.members[0].summary).toBe("Created hello.sh, mode -rwxrwxr-x, prints hello.");
    expect(flattenMembers(tree).map((entry) => entry.member.member)).toEqual(["460a4502", PLANNER, "create-two-0541-1", "create-two-0541-2"]);
    expect(flattenSwarms(tree).map((entry) => entry.swarm.swarm)).toEqual(["460a4502-1", "create-two-0541"]);
  });

  it("renders the landing page's tree", async () => {
    const tree = await fold(home, {}, { implicit: DEV, host: "dev" });
    const text = renderTree(tree, { host: "dev" });
    const lines = text.split("\n");
    expect(lines[0]).toBe("anthony@dev  (implicit fleet, sysop anthony@dev, depth 1, hosts dev)");
    expect(lines[1]).toMatch(/^└─ 460a4502 +claude-code +working {2}\[bypass\]$/);
    expect(lines[2]).toMatch(/^ {3}├─ swarm 460a4502-1 +claude -p "Split the task below into at most 4 \.\.\." +1 member +done$/);
    expect(lines[3]).toMatch(/^ {3}│ {2}└─ 9f1c2d3e-0000-4000-8000-000000000001 \(4242\) +claude-p +done {2}\[bypass\]$/);
    expect(lines[4]).toMatch(/^ {3}└─ swarm create-two-0541 +"create two \.\.\." +2\/4 members +until 06:11$/);
    expect(lines[5]).toMatch(/^ {6}├─ create-two-0541-1 \(172ffd83\) +create hello.sh bash +claude-code +done {2}\[bypass\] {2}owns hello.sh$/);
    expect(lines[6]).toMatch(/^ {6}└─ create-two-0541-2 +create bye.sh bash +moshcode\/claude +working {2}\[bypass\] {2}owns bye.sh$/);
    expect(lines.length).toBe(7);
    expect(renderTree({ fleets: [] })).toBe("(no fleets)");
  });

  it("joins the rosters: liveness for recorded members, a name for a root, and recordless sessions as roster roots", async () => {
    const claude = async (): Promise<RosterRow[]> => [
      { engine: "claude-code", id: "460a4502", sessionId: "460a4502-aaaa-bbbb-cccc-dddddddddddd", name: "ultracode mode documentation", state: "working", approvals: "bypass" },
      { engine: "claude-code", id: "b9fc0f52", sessionId: "b9fc0f52-322b-452e-8523-77945ab1d777", name: "meta card screenshots stream", state: "working", approvals: "native" },
    ];
    const moshcode = async (): Promise<RosterRow[]> => [];
    const tree = await fold(home, { claude, moshcode }, { implicit: DEV, host: "dev" });
    const fleet = tree.fleets[0];
    const root = fleet.roots.find((node) => node.member === "460a4502")!;
    expect(root.alive).toBe(true);
    expect(root.title).toBe("ultracode mode documentation");
    const rosterOnly = fleet.roots.find((node) => node.member === "b9fc0f52")!;
    expect(rosterOnly).toMatchObject({ roster: true, alive: true, state: "working", approvals: "native", title: "meta card screenshots stream", depth: 0, engine: "claude-code" });
    // moshcode's roster was readable and lists nothing: the pane is gone.
    const pane = root.swarms[1].members.find((node) => node.member === "create-two-0541-2")!;
    expect(pane.alive).toBe(false);
    // 172ffd83 claimed its record and is not in the roster: gone too. The planner ended, so liveness is moot but reported.
    expect(root.swarms[1].members[0].alive).toBe(false);
    const text = renderTree(tree, { host: "dev" });
    expect(text).toMatch(/^├─ 460a4502 +ultracode mode documentation +claude-code +working {2}\[bypass\]$/m);
    expect(text).toMatch(/^└─ b9fc0f52 \(b9fc0f52-322b-452e-8523-77945ab1d777\) +meta card screenshots stream +claude-code +working {2}\[roster\]$/m);
    expect(text).toMatch(/create-two-0541-2 +create bye.sh bash +moshcode\/claude +working {2}\[bypass\] {2}\[gone\]/);
  });

  it("ignores a roster that cannot be read, and reads only one fleet when asked", async () => {
    const tree = await fold(home, { claude: async () => null, moshcode: async () => { throw new Error("no manifest"); } }, { implicit: DEV, host: "dev", fleet: FLEET });
    expect(tree.fleets[0].roots[0].alive).toBeUndefined();
    const none = await fold(home, {}, { implicit: DEV, host: "dev", fleet: "other" });
    expect(none.fleets).toEqual([{ fleet: "other", sysop: FLEET, implicit: true, ceiling: { depth: 1, hosts: ["dev"] }, roots: [], swarms: [], spend: {} }]);
  });
});

describe("fold: opened fleets, nesting, spend and orphans", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
  });
  afterEach(() => cleanup(home));

  it("puts a sysop-started swarm at the fleet level, nests by parent_swarm, sums spend against budget, marks orphans", async () => {
    const fleet = "team-20260913";
    append(home, fleet, { at: "2026-09-13T05:00:00Z", event: "fleet.open", by: "sysop", fleet, sysop: "https://anthony.example/profile.md", ceiling: { approvals: "bypass", depth: 3, hosts: ["dev"], budget: "20 USD" } }, { host: "dev" });
    append(home, fleet, { at: "2026-09-13T05:01:00Z", event: "swarm.spawn", by: "sysop", swarm: "hand-0501", task: "by hand", ceiling: { fan_out: 2 }, pieces: [{ member: "hand-0501-1", title: "one" }] }, { host: "dev" });
    append(home, fleet, { at: "2026-09-13T05:02:00Z", event: "member.start", by: "hand-0501-1", member: "hand-0501-1", session: "h1", swarm: "hand-0501", depth: 0, engine: "moshcode/codex", approvals: "native" }, { host: "dev" });
    append(home, fleet, { at: "2026-09-13T05:03:00Z", event: "swarm.spawn", by: "hand-0501-1", swarm: "inner-0503", parent_swarm: "hand-0501", task: "nested", ceiling: {}, pieces: [{ member: "inner-0503-1" }] }, { host: "dev" });
    append(home, fleet, { at: "2026-09-13T05:04:00Z", event: "member.start", by: "inner-0503-1", member: "inner-0503-1", session: "i1", swarm: "inner-0503", parent: "hand-0501-1", depth: 1, engine: "moshcode/kimi", approvals: "native" }, { host: "dev" });
    append(home, fleet, { at: "2026-09-13T05:05:00Z", event: "member.spend", by: "inner-0503-1", member: "inner-0503-1", amount: "3 USD", total: "3 USD" }, { host: "dev" });
    append(home, fleet, { at: "2026-09-13T05:06:00Z", event: "member.spend", by: "inner-0503-1", member: "inner-0503-1", amount: "2 USD", total: "5 USD" }, { host: "dev" });
    append(home, fleet, { at: "2026-09-13T05:06:00Z", event: "member.spend", by: "hand-0501-1", member: "hand-0501-1", amount: "1000 tokens", total: "1000 tokens" }, { host: "dev" });
    writeRecord(home, { ...ROOT, fleet, sysop: "https://anthony.example/profile.md", member: "stray", orphan: true, approvals: "native", ceiling: { approvals: "native", depth: 1, hosts: ["dev"] } });

    const tree = await fold(home, {}, { implicit: DEV, host: "dev" });
    const node = tree.fleets[0];
    expect(node).toMatchObject({ fleet, sysop: "https://anthony.example/profile.md", implicit: false, ceiling: { approvals: "bypass", depth: 3, hosts: ["dev"], budget: "20 USD" } });
    expect(node.roots.map((root) => [root.member, root.state, root.orphan])).toEqual([["stray", "unclaimed", true]]);
    expect(node.swarms.length).toBe(1);
    const hand = node.swarms[0];
    expect(hand).toMatchObject({ swarm: "hand-0501", by: "sysop", spend: { USD: 5, tokens: 1000 } });
    expect(hand.members.length).toBe(1);
    expect(hand.swarms.map((swarm) => swarm.swarm)).toEqual(["inner-0503"]);
    expect(hand.swarms[0].members[0]).toMatchObject({ member: "inner-0503-1", spend: "5 USD", depth: 1, parent: "hand-0501-1" });
    expect(node.spend).toEqual({ USD: 5, tokens: 1000 });

    const text = renderTree(tree, { host: "dev" });
    expect(text.split("\n")[0]).toBe("team-20260913  (fleet, sysop https://anthony.example/profile.md, approvals bypass, depth 3, hosts dev, budget 20 USD, spent 5/20 USD)");
    expect(text).toMatch(/└─ swarm hand-0501 +"by hand" +1\/2 members +1000 tokens, 5 USD/);
    expect(text).toMatch(/├─ stray +claude-code +unclaimed {2}\[orphan\]/);
    expect(text).toMatch(/└─ inner-0503-1 \(i1\) +moshcode\/kimi +working {2}5 USD/);
  });
});
