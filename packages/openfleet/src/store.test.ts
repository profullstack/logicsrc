import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RecordExistsError,
  append,
  claimedBy,
  endOf,
  hasEvent,
  home,
  implicitFleet,
  ledgerPaths,
  listFleets,
  readCurrent,
  readLedger,
  readRecord,
  readRecords,
  readSession,
  recordPath,
  swarmEndState,
  writeCurrent,
  writeRecord,
  writeSession,
} from "./store.js";
import { FLEET, ROOT, cleanup, snapshotEnv, tempHome } from "./test-helpers.js";

describe("home and the implicit fleet", () => {
  let restore: () => void;
  beforeEach(() => {
    restore = snapshotEnv();
  });
  afterEach(() => restore());

  it("is $OPENFLEET_HOME, else ~/.openfleet", () => {
    expect(home({ OPENFLEET_HOME: "/x/fleet" })).toBe("/x/fleet");
    expect(home({ HOME: "/home/someone" })).toBe("/home/someone/.openfleet");
    expect(home({ OPENFLEET_HOME: "  ", HOME: "/home/someone" })).toBe("/home/someone/.openfleet");
  });

  it("names the implicit fleet <user>@<host> with depth 1, that host, and no approvals", () => {
    const fleet = implicitFleet({ user: "anthony", host: "dev" });
    expect(fleet.id).toBe("anthony@dev");
    expect(fleet.sysop).toBe("anthony@dev");
    expect(fleet.ceiling).toEqual({ depth: 1, hosts: ["dev"] });
    expect("approvals" in fleet.ceiling).toBe(false);
  });
});

describe("the record", () => {
  let dir: string;
  beforeEach(() => {
    dir = tempHome();
  });
  afterEach(() => cleanup(dir));

  it("writes once under fleets/<fleet>/members/<member>.json, 0600 in 0700 dirs, and reads back with unknown keys kept", () => {
    const path = writeRecord(dir, { ...ROOT, extra: { kept: true } });
    expect(path).toBe(recordPath(dir, FLEET, "460a4502"));
    expect(path).toBe(join(dir, "fleets", FLEET, "members", "460a4502.json"));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, "fleets", FLEET, "members")).mode & 0o777).toBe(0o700);
    expect(readRecord(path)).toEqual({ ...ROOT, extra: { kept: true } });
  });

  it("refuses to overwrite: a record never changes after it is written", () => {
    writeRecord(dir, ROOT);
    expect(() => writeRecord(dir, { ...ROOT, approvals: "native" })).toThrow(RecordExistsError);
    expect(readRecord(recordPath(dir, FLEET, ROOT.member))?.approvals).toBe("bypass");
  });

  it("returns null for a missing record, a non-JSON file, or an object without fleet and member", () => {
    expect(readRecord(join(dir, "nope.json"))).toBeNull();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "bad.json"), "{not json");
    writeFileSync(join(dir, "thin.json"), JSON.stringify({ openfleet: "0.1" }));
    expect(readRecord(join(dir, "bad.json"))).toBeNull();
    expect(readRecord(join(dir, "thin.json"))).toBeNull();
  });

  it("lists every record of a fleet by member id, and every fleet with a directory", () => {
    writeRecord(dir, ROOT);
    writeRecord(dir, { ...ROOT, member: "b" });
    expect([...readRecords(dir, FLEET).keys()].sort()).toEqual(["460a4502", "b"]);
    expect(listFleets(dir)).toEqual([FLEET]);
    expect(listFleets(join(dir, "missing"))).toEqual([]);
  });
});

describe("the ledger", () => {
  let dir: string;
  beforeEach(() => {
    dir = tempHome();
  });
  afterEach(() => cleanup(dir));

  it("appends one JSON line with at, event, fleet, host and by, in that order, at mode 0600", () => {
    const line = append(dir, FLEET, { event: "fleet.open", by: "sysop", sysop: FLEET, ceiling: { depth: 2 } }, { now: new Date("2026-09-13T05:41:01.500Z"), host: "dev" });
    expect(line).toEqual({ at: "2026-09-13T05:41:01Z", event: "fleet.open", fleet: FLEET, host: "dev", by: "sysop", sysop: FLEET, ceiling: { depth: 2 } });
    const path = join(dir, "fleets", FLEET, "ledger.jsonl");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path, "utf8")).toBe(`${JSON.stringify(line)}\n`);
    expect(Object.keys(JSON.parse(readFileSync(path, "utf8")))).toEqual(["at", "event", "fleet", "host", "by", "sysop", "ceiling"]);
  });

  it("refuses a line with no by or no event: who did it is never guessed", () => {
    expect(() => append(dir, FLEET, { event: "member.end", by: "" })).toThrow(/by/);
    expect(() => append(dir, FLEET, { event: "", by: "sysop" })).toThrow(/event/);
  });

  it("merges every ledger*.jsonl under a fleet, sorted by at, keeping file order on ties and skipping bad lines", () => {
    append(dir, FLEET, { at: "2026-09-13T05:41:12Z", event: "member.start", by: "a", member: "a" }, { host: "dev" });
    append(dir, FLEET, { at: "2026-09-13T05:41:36Z", event: "member.end", by: "a", member: "a", state: "done" }, { host: "dev" });
    const remote = join(dir, "fleets", FLEET, "ledger.netcup.jsonl");
    writeFileSync(
      remote,
      [
        JSON.stringify({ at: "2026-09-13T05:41:20Z", event: "member.start", fleet: FLEET, host: "netcup", by: "b", member: "b" }),
        "this is not json",
        JSON.stringify({ at: "2026-09-13T05:41:36Z", event: "member.end", fleet: FLEET, host: "netcup", by: "b", member: "b", state: "done" }),
        "",
      ].join("\n"),
    );
    expect(ledgerPaths(dir, FLEET).map((path) => path.split("/").pop())).toEqual(["ledger.jsonl", "ledger.netcup.jsonl"]);
    const lines = readLedger(dir, FLEET);
    expect(lines.map((line) => `${line.at} ${line.event} ${line.by}`)).toEqual([
      "2026-09-13T05:41:12Z member.start a",
      "2026-09-13T05:41:20Z member.start b",
      "2026-09-13T05:41:36Z member.end a",
      "2026-09-13T05:41:36Z member.end b",
    ]);
    expect(readLedger(dir, "no-such-fleet")).toEqual([]);
  });

  it("answers claimed, ended and hasEvent from the lines", () => {
    append(dir, FLEET, { at: "2026-09-13T05:41:12Z", event: "member.start", by: "a", member: "a", session: "s1" }, { host: "dev" });
    const lines = readLedger(dir, FLEET);
    expect(claimedBy(lines, "a")?.session).toBe("s1");
    expect(claimedBy(lines, "b")).toBeNull();
    expect(hasEvent(lines, "member.start", { member: "a" })).toBe(true);
    expect(hasEvent(lines, "member.end", { member: "a" })).toBe(false);
    expect(endOf(lines, "a")).toBeNull();
  });

  it("counts the first end line, except lost, which a real end supersedes", () => {
    append(dir, FLEET, { at: "2026-09-13T05:42:00Z", event: "member.end", by: "sysop", member: "a", state: "lost" }, { host: "dev" });
    expect(endOf(readLedger(dir, FLEET), "a")?.state).toBe("lost");
    append(dir, FLEET, { at: "2026-09-13T05:43:00Z", event: "member.end", by: "a", member: "a", state: "done" }, { host: "dev" });
    expect(endOf(readLedger(dir, FLEET), "a")?.state).toBe("done");
    append(dir, FLEET, { at: "2026-09-13T05:44:00Z", event: "member.end", by: "sysop", member: "a", state: "stopped" }, { host: "dev" });
    expect(endOf(readLedger(dir, FLEET), "a")?.state).toBe("done");
  });

  it("derives a swarm's end state: done when all done, else the first of failed, stopped, budget, timeout", () => {
    const end = (state: string) => ({ at: "", event: "member.end", fleet: FLEET, host: "dev", by: "x", state });
    expect(swarmEndState([end("done"), end("done")])).toBe("done");
    expect(swarmEndState([end("done"), end("timeout"), end("stopped")])).toBe("stopped");
    expect(swarmEndState([end("budget"), end("failed")])).toBe("failed");
    expect(swarmEndState([end("done"), end("timeout")])).toBe("timeout");
    expect(swarmEndState([end("done"), null])).toBeNull();
    expect(swarmEndState([end("lost")])).toBe("failed");
  });

  it("keeps current and the per-session file under the home", () => {
    expect(readCurrent(dir)).toBeNull();
    writeCurrent(dir, "fleet-20260913");
    expect(readCurrent(dir)).toBe("fleet-20260913");
    expect(readSession(dir, "abc")).toBeNull();
    writeSession(dir, "abc", { record: null, recordPath: null, member: null, fleet: FLEET, swarm: null, last_message: "hi" });
    expect(readSession(dir, "abc")?.last_message).toBe("hi");
    expect(existsSync(join(dir, "sessions", "abc.json"))).toBe(true);
    expect(statSync(join(dir, "sessions", "abc.json")).mode & 0o777).toBe(0o600);
  });
});
