import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startMember } from "./context.js";
import { contextLine, exportLines, ownJobDir, ownsPath, runHook, summaryOf, type HookIo } from "./hooks.js";
import { append, endOf, findEvents, readLedger, readRecord, readSession, recordPath, writeCurrent } from "./store.js";
import { DEV, FLEET, PIECE_1, cleanup, envFor, seedWorkedExample, tempHome } from "./test-helpers.js";
import type { Env } from "./store.js";

const SESSION = "68aca9c1-1111-4222-8333-444455556666";
const NOW = new Date("2026-09-13T05:41:12Z");

interface Fake {
  io: HookIo;
  appended: Array<[string, string]>;
  envFile: string;
}

function fake(home: string, env: Env = {}, opts: { environ?: Record<string, string>; cmdline?: string[] } = {}): Fake {
  const envFile = join(home, "env.sh");
  const appended: Array<[string, string]> = [];
  const io: HookIo = {
    env: envFor(home, { CLAUDE_PID: "4242", CLAUDE_ENV_FILE: envFile, CLAUDE_CODE_ENTRYPOINT: "cli", ...env }),
    now: () => NOW,
    host: "dev",
    implicit: DEV,
    readProcEnviron: () => opts.environ ?? { PATH: "/usr/bin" },
    readProcCmdline: () => opts.cmdline ?? ["claude"],
    appendFile: (path, text) => appended.push([path, text]),
  };
  return { io, appended, envFile };
}

const payload = (extra: Record<string, unknown>) => JSON.stringify({ session_id: SESSION, cwd: "/home/anthony/work", transcript_path: "/t.jsonl", ...extra });

describe("helpers", () => {
  it("knows its own job dir, the SUMMARY section, the export lines and the context line", () => {
    expect(ownJobDir({ CLAUDE_JOB_DIR: "/home/a/.claude/jobs/68aca9c1" }, SESSION)).toBe("/home/a/.claude/jobs/68aca9c1");
    expect(ownJobDir({ CLAUDE_JOB_DIR: "/home/a/.claude/jobs/172ffd83" }, SESSION)).toBeNull();
    expect(ownJobDir({}, SESSION)).toBeNull();
    expect(summaryOf("Did things.\n\nSUMMARY:\nCreated hello.sh.\nDone.")).toBe("SUMMARY:\nCreated hello.sh.\nDone.");
    expect(summaryOf("x".repeat(600))?.length).toBe(500);
    expect(summaryOf("")).toBeUndefined();
    expect(summaryOf(null)).toBeUndefined();
    expect(exportLines("/h", { record: null, recordPath: "/h/fleets/f/members/m.json", member: "m", fleet: "f", swarm: "s w", last_message: null })).toBe(
      "export OPENFLEET_HOME='/h'\nexport OPENFLEET_RECORD='/h/fleets/f/members/m.json'\nexport OPENFLEET_FLEET='f'\nexport OPENFLEET_MEMBER='m'\nexport OPENFLEET_SWARM='s w'\n",
    );
    expect(contextLine(PIECE_1)).toBe("OpenFleet: you are member create-two-0541-1 of fleet anthony@dev, piece create hello.sh bash, owns hello.sh");
    expect(contextLine({ openfleet: "0.1", fleet: "f", sysop: "s", member: "m" })).toBe("OpenFleet: you are member m of fleet f");
  });

  it("matches piece.owns as files, directories and globs", () => {
    expect(ownsPath(["hello.sh"], "hello.sh")).toBe(true);
    expect(ownsPath(["hello.sh"], "bye.sh")).toBe(false);
    expect(ownsPath(["src/"], "src/a/b.ts")).toBe(true);
    expect(ownsPath(["src"], "srcs/a.ts")).toBe(false);
    expect(ownsPath(["*.md"], "README.md")).toBe(true);
    expect(ownsPath(["*.md"], "docs/x.md")).toBe(false);
    expect(ownsPath(["docs/**/*.md"], "docs/a/b/c.md")).toBe(true);
    expect(ownsPath(["./packages/openfleet/"], "packages/openfleet/src/x.ts")).toBe(true);
  });
});

describe("SessionStart", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
  });
  afterEach(() => cleanup(home));

  it("writes a root record for a hand-started session, exports the variables, and prints the context line", () => {
    const { io, appended, envFile } = fake(home, {}, { cmdline: ["claude", "--permission-mode", "bypassPermissions"] });
    const result = runHook("SessionStart", payload({ source: "startup" }), io);
    expect(result).toEqual({ exit: 0, stdout: `OpenFleet: you are member ${SESSION} of fleet anthony@dev\n`, stderr: "" });
    const record = readRecord(recordPath(home, FLEET, SESSION));
    expect(record).toMatchObject({ member: SESSION, depth: 0, engine: "claude-code", host: "dev", cwd: "/home/anthony/work", approvals: "bypass", ceiling: { approvals: "bypass", depth: 1, hosts: ["dev"] } });
    expect(record).not.toHaveProperty("orphan");
    expect(appended).toEqual([[envFile, `export OPENFLEET_HOME='${home}'\nexport OPENFLEET_RECORD='${recordPath(home, FLEET, SESSION)}'\nexport OPENFLEET_FLEET='anthony@dev'\nexport OPENFLEET_MEMBER='${SESSION}'\n`]]);
    const session = readSession(home, SESSION);
    expect(session).toMatchObject({ member: SESSION, fleet: FLEET, swarm: null, last_message: null, kind: "root", approvals: "bypass" });
    expect(readLedger(home, FLEET)).toEqual([]);
  });

  it("re-exports for a resume of a known session and writes nothing new", () => {
    const { io } = fake(home);
    runHook("SessionStart", payload({ source: "startup" }), io);
    const second = fake(home);
    const result = runHook("SessionStart", payload({ source: "resume" }), second.io);
    expect(result.stdout).toContain(`you are member ${SESSION}`);
    expect(second.appended.length).toBe(1);
    expect(second.appended[0][1]).toContain("OPENFLEET_MEMBER");
  });

  it("skips a subagent and a payload without a session id", () => {
    const { io, appended } = fake(home);
    expect(runHook("SessionStart", payload({ source: "startup", agent_id: "sub-1" }), io)).toEqual({ exit: 0, stdout: "", stderr: "" });
    expect(runHook("SessionStart", "{}", io)).toEqual({ exit: 0, stdout: "", stderr: "" });
    expect(appended).toEqual([]);
    expect(existsSync(join(home, "fleets"))).toBe(false);
  });

  it("claims the record OPENFLEET_RECORD names and tells the member its piece", () => {
    seedWorkedExample(home);
    const { io, appended } = fake(home, { OPENFLEET_RECORD: recordPath(home, FLEET, "create-two-0541-1") });
    const result = runHook("SessionStart", payload({ source: "startup" }), io);
    expect(result.stdout).toBe("OpenFleet: you are member create-two-0541-1 of fleet anthony@dev, piece create hello.sh bash, owns hello.sh\n");
    expect(appended[0][1]).toContain("export OPENFLEET_SWARM='create-two-0541'");
    expect(appended[0][1]).toContain("export OPENFLEET_MEMBER='create-two-0541-1'");
    expect(readSession(home, SESSION)).toMatchObject({ member: "create-two-0541-1", swarm: "create-two-0541", kind: "claim" });
  });

  it("derives under a claimed record, and reports a refusal without a record", () => {
    seedWorkedExample(home);
    const derived = fake(home, { OPENFLEET_RECORD: recordPath(home, FLEET, "460a4502"), CLAUDE_CODE_ENTRYPOINT: "sdk-cli" }, { cmdline: ["claude", "-p", "plan it"] });
    const result = runHook("SessionStart", payload({ source: "startup" }), derived.io);
    expect(result.stdout).toBe(`OpenFleet: you are member ${SESSION} of fleet anthony@dev\n`);
    const record = readRecord(recordPath(home, FLEET, SESSION));
    expect(record).toMatchObject({ parent: "460a4502", swarm: "460a4502-2", task: "claude -p plan it", depth: 1, engine: "claude-p", session: "4242", approvals: "native" });
    expect(findEvents(readLedger(home, FLEET), "swarm.spawn", { swarm: "460a4502-2" })[0]).toMatchObject({ by: "460a4502", pieces: [{ member: SESSION }] });

    // Now claim that derived record as a child, and start something beneath it: depth 2 is refused.
    startMember(home, record!, { sessionId: SESSION, approvals: "native", now: NOW, host: "dev", implicit: DEV });
    const grandchild = "deadbeef-0000-4000-8000-000000000002";
    const refused = fake(home, { OPENFLEET_RECORD: recordPath(home, FLEET, SESSION) });
    const out = runHook("SessionStart", payload({ source: "startup", session_id: grandchild }), refused.io);
    expect(out.stdout).toBe("OpenFleet: start refused, ceiling refuses depth: wanted 2, allowed 1\n");
    expect(refused.appended).toEqual([]);
    expect(existsSync(recordPath(home, FLEET, grandchild))).toBe(false);
    expect(readSession(home, grandchild)?.refused).toEqual({ key: "depth", reason: "ceiling refuses depth: wanted 2, allowed 1" });
    expect(readFileSync(join(home, "hooks.log"), "utf8")).toContain("refused");
    const blocked = runHook("UserPromptSubmit", payload({ session_id: grandchild, permission_mode: "auto", prompt: "hi" }), refused.io);
    expect(blocked).toEqual({ exit: 2, stdout: "", stderr: "OpenFleet refused the start: ceiling refuses depth: wanted 2, allowed 1\n" });
  });

  it("marks an orphan when the invoking environment carried a child marker", () => {
    const { io } = fake(home, {}, { environ: { CLAUDE_JOB_DIR: "/home/anthony/.claude/jobs/172ffd83", CLAUDE_CODE_CHILD_SESSION: "1" }, cmdline: ["claude", "--dangerously-skip-permissions"] });
    runHook("SessionStart", payload({ source: "startup" }), io);
    const record = readRecord(recordPath(home, FLEET, SESSION));
    expect(record).toMatchObject({ orphan: true, approvals: "bypass", ceiling: { approvals: "native", depth: 1, hosts: ["dev"] } });
  });

  it("names a background job by its job id and reads approvals from state.json respawnFlags, with no orphan test", () => {
    const jobId = SESSION.slice(0, 8);
    const jobDir = join(home, "jobs", jobId);
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(join(jobDir, "state.json"), JSON.stringify({ respawnFlags: ["--agent", "claude", "--permission-mode", "bypassPermissions"], tokens: 801101, children: [{ id: "179", href: "https://github.com/profullstack/logicsrc/pull/179", kind: "pr" }] }));
    const { io } = fake(home, { CLAUDE_JOB_DIR: jobDir }, { environ: { CLAUDE_JOB_DIR: "/somewhere/else" } });
    const result = runHook("SessionStart", payload({ source: "startup" }), io);
    expect(result.stdout).toBe(`OpenFleet: you are member ${jobId} of fleet anthony@dev\n`);
    const record = readRecord(recordPath(home, FLEET, jobId));
    expect(record).toMatchObject({ member: jobId, engine: "claude-code", approvals: "bypass", depth: 0 });
    expect(record).not.toHaveProperty("orphan");
    expect(record).not.toHaveProperty("session");
  });
});

describe("UserPromptSubmit", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
  });
  afterEach(() => cleanup(home));

  it("writes member.start once, with approvals from the permission mode the engine reports", () => {
    const { io } = fake(home);
    runHook("SessionStart", payload({ source: "startup" }), io);
    expect(runHook("UserPromptSubmit", payload({ permission_mode: "bypassPermissions", prompt: "go" }), fake(home).io)).toEqual({ exit: 0, stdout: "", stderr: "" });
    const starts = findEvents(readLedger(home, FLEET), "member.start", { member: SESSION });
    expect(starts.length).toBe(1);
    expect(starts[0]).toMatchObject({ by: SESSION, session: SESSION, depth: 0, engine: "claude-code", cwd: "/home/anthony/work", approvals: "bypass" });
    runHook("UserPromptSubmit", payload({ permission_mode: "auto", prompt: "again" }), fake(home).io);
    expect(findEvents(readLedger(home, FLEET), "member.start", { member: SESSION }).length).toBe(1);
    expect(readSession(home, SESSION)?.approvals).toBe("bypass");
  });

  it("refuses the first prompt with exit 2 and ceiling.refuse when bypass runs under a native fleet", () => {
    append(home, "team-20260913", { event: "fleet.open", by: "sysop", fleet: "team-20260913", sysop: FLEET, ceiling: { depth: 2, hosts: ["dev"] } }, { host: "dev" });
    writeCurrent(home, "team-20260913");
    runHook("SessionStart", payload({ source: "startup" }), fake(home).io);
    const result = runHook("UserPromptSubmit", payload({ permission_mode: "bypassPermissions", prompt: "go" }), fake(home).io);
    expect(result).toEqual({ exit: 2, stdout: "", stderr: "OpenFleet refused the start: ceiling refuses approvals: wanted bypass, allowed native\n" });
    const lines = readLedger(home, "team-20260913");
    expect(findEvents(lines, "ceiling.refuse")[0]).toMatchObject({ by: "sysop", member: SESSION, action: "start", key: "approvals", wanted: "bypass", allowed: "native" });
    expect(findEvents(lines, "member.start")).toEqual([]);
    // Every later prompt of that session is refused the same way.
    expect(runHook("UserPromptSubmit", payload({ permission_mode: "bypassPermissions", prompt: "still" }), fake(home).io).exit).toBe(2);
  });

  it("does nothing for a session it never saw, or a subagent", () => {
    expect(runHook("UserPromptSubmit", payload({ permission_mode: "auto" }), fake(home).io)).toEqual({ exit: 0, stdout: "", stderr: "" });
    runHook("SessionStart", payload({ source: "startup" }), fake(home).io);
    expect(runHook("UserPromptSubmit", payload({ permission_mode: "auto", agent_id: "x" }), fake(home).io).exit).toBe(0);
    expect(findEvents(readLedger(home, FLEET), "member.start")).toEqual([]);
  });
});

describe("PreToolUse", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
    seedWorkedExample(home);
    runHook("SessionStart", payload({ source: "startup" }), fake(home, { OPENFLEET_RECORD: recordPath(home, FLEET, "create-two-0541-1") }).io);
  });
  afterEach(() => cleanup(home));

  it("denies an edit outside piece.owns, resolved against the record's cwd, and says nothing inside it", () => {
    const io = fake(home).io;
    const cwd = PIECE_1.cwd!;
    expect(runHook("PreToolUse", payload({ tool_name: "Write", tool_input: { file_path: join(cwd, "hello.sh") } }), io)).toEqual({ exit: 0, stdout: "", stderr: "" });
    expect(runHook("PreToolUse", payload({ tool_name: "Edit", tool_input: { file_path: "hello.sh" } }), io).stdout).toBe("");
    const denied = runHook("PreToolUse", payload({ tool_name: "Write", tool_input: { file_path: join(cwd, "bye.sh") } }), io);
    expect(denied.exit).toBe(0);
    expect(JSON.parse(denied.stdout)).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "outside piece.owns: bye.sh (member create-two-0541-1 owns hello.sh)" },
    });
    const away = runHook("PreToolUse", payload({ tool_name: "Write", tool_input: { file_path: "/etc/passwd" } }), io);
    expect(JSON.parse(away.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
    expect(runHook("PreToolUse", payload({ tool_name: "Bash", tool_input: { command: "rm bye.sh" } }), io).stdout).toBe("");
  });

  it("says nothing for a member with no piece", () => {
    const other = "aaaaaaaa-0000-4000-8000-000000000000";
    runHook("SessionStart", payload({ source: "startup", session_id: other }), fake(home).io);
    expect(runHook("PreToolUse", payload({ session_id: other, tool_name: "Write", tool_input: { file_path: "/anywhere" } }), fake(home).io).stdout).toBe("");
  });
});

describe("Stop and SessionEnd", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
  });
  afterEach(() => cleanup(home));

  function bgJob(): { jobDir: string; jobId: string } {
    const jobId = SESSION.slice(0, 8);
    const jobDir = join(home, "jobs", jobId);
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(join(jobDir, "state.json"), JSON.stringify({ respawnFlags: [], tokens: 801101, children: [{ id: "179", href: "https://github.com/profullstack/logicsrc/pull/179", kind: "pr" }, { id: "x", kind: "note" }] }));
    return { jobDir, jobId };
  }

  it("a background job ends done at its first idle Stop, with the SUMMARY section, links and total", () => {
    const { jobDir, jobId } = bgJob();
    const env = { CLAUDE_JOB_DIR: jobDir };
    runHook("SessionStart", payload({ source: "startup" }), fake(home, env).io);
    runHook("UserPromptSubmit", payload({ permission_mode: "auto" }), fake(home, env).io);
    const busy = runHook("Stop", payload({ last_assistant_message: "working on it", background_tasks: [{ id: "t" }] }), fake(home, env).io);
    expect(busy.exit).toBe(0);
    expect(findEvents(readLedger(home, FLEET), "member.end")).toEqual([]);
    expect(readSession(home, SESSION)?.last_message).toBe("working on it");
    runHook("Stop", payload({ last_assistant_message: "All done.\n\nSUMMARY: created hello.sh and opened a PR.", background_tasks: [] }), fake(home, env).io);
    const ends = findEvents(readLedger(home, FLEET), "member.end", { member: jobId });
    expect(ends.length).toBe(1);
    expect(ends[0]).toMatchObject({ by: jobId, state: "done", summary: "SUMMARY: created hello.sh and opened a PR.", total: "801101 tokens", links: ["https://github.com/profullstack/logicsrc/pull/179"] });
    runHook("Stop", payload({ last_assistant_message: "later turn", background_tasks: [] }), fake(home, env).io);
    expect(findEvents(readLedger(home, FLEET), "member.end", { member: jobId }).length).toBe(1);
  });

  it("an interactive or -p session only stores its message at Stop and ends at SessionEnd, for a real exit", () => {
    runHook("SessionStart", payload({ source: "startup" }), fake(home).io);
    runHook("UserPromptSubmit", payload({ permission_mode: "auto" }), fake(home).io);
    runHook("Stop", payload({ last_assistant_message: "ok", background_tasks: [] }), fake(home).io);
    expect(findEvents(readLedger(home, FLEET), "member.end")).toEqual([]);
    expect(runHook("SessionEnd", payload({ reason: "clear" }), fake(home).io).exit).toBe(0);
    expect(findEvents(readLedger(home, FLEET), "member.end")).toEqual([]);
    runHook("SessionEnd", payload({ reason: "other" }), fake(home).io);
    const ends = findEvents(readLedger(home, FLEET), "member.end", { member: SESSION });
    expect(ends.length).toBe(1);
    expect(ends[0]).toMatchObject({ by: SESSION, state: "done", summary: "ok" });
    expect(ends[0]).not.toHaveProperty("total");
    runHook("SessionEnd", payload({ reason: "prompt_input_exit" }), fake(home).io);
    expect(findEvents(readLedger(home, FLEET), "member.end", { member: SESSION }).length).toBe(1);
  });

  it("ends a derived swarm of one with the member", () => {
    seedWorkedExample(home);
    const env = { OPENFLEET_RECORD: recordPath(home, FLEET, "460a4502"), CLAUDE_CODE_ENTRYPOINT: "sdk-cli" };
    runHook("SessionStart", payload({ source: "startup" }), fake(home, env).io);
    runHook("UserPromptSubmit", payload({ permission_mode: "bypassPermissions" }), fake(home, env).io);
    runHook("Stop", payload({ last_assistant_message: "the plan", background_tasks: [] }), fake(home, env).io);
    runHook("SessionEnd", payload({ reason: "other" }), fake(home, env).io);
    const lines = readLedger(home, FLEET);
    expect(findEvents(lines, "member.end", { member: SESSION })[0]).toMatchObject({ state: "done", summary: "the plan" });
    expect(findEvents(lines, "swarm.end", { swarm: "460a4502-2" })[0]).toMatchObject({ by: SESSION, state: "done", summary: "the plan" });
  });

  it("supersedes a lost line a sysop tool wrote with the engine's own end, at SessionEnd and at a job's idle Stop", () => {
    runHook("SessionStart", payload({ source: "startup" }), fake(home).io);
    runHook("UserPromptSubmit", payload({ permission_mode: "auto" }), fake(home).io);
    runHook("Stop", payload({ last_assistant_message: "finished", background_tasks: [] }), fake(home).io);
    append(home, FLEET, { event: "member.end", by: "sysop", member: SESSION, state: "lost" }, { now: NOW, host: "dev" });
    runHook("SessionEnd", payload({ reason: "other" }), fake(home).io);
    const ends = findEvents(readLedger(home, FLEET), "member.end", { member: SESSION });
    expect(ends.map((line) => line.state)).toEqual(["lost", "done"]);
    expect(ends[1]).toMatchObject({ by: SESSION, summary: "finished" });
    expect(endOf(readLedger(home, FLEET), SESSION)?.state).toBe("done");

    const { jobDir, jobId } = bgJob();
    const env = { CLAUDE_JOB_DIR: jobDir };
    const job = "68aca9c1-2222-4222-8333-444455556666";
    runHook("SessionStart", payload({ source: "startup", session_id: job }), fake(home, env).io);
    runHook("UserPromptSubmit", payload({ session_id: job, permission_mode: "auto" }), fake(home, env).io);
    append(home, FLEET, { event: "member.end", by: "sysop", member: jobId, state: "lost" }, { now: NOW, host: "dev" });
    runHook("Stop", payload({ session_id: job, last_assistant_message: "SUMMARY: shipped.", background_tasks: [] }), fake(home, env).io);
    expect(endOf(readLedger(home, FLEET), jobId)).toMatchObject({ state: "done", summary: "SUMMARY: shipped.", total: "801101 tokens" });
    // A real end that already stands is never followed by another.
    runHook("Stop", payload({ session_id: job, last_assistant_message: "again", background_tasks: [] }), fake(home, env).io);
    expect(findEvents(readLedger(home, FLEET), "member.end", { member: jobId }).length).toBe(2);
  });

  it("corrects a derived record's guessed approvals with the permission mode the engine reports", () => {
    seedWorkedExample(home);
    // The command line said nothing about permissions, so SessionStart guessed native; the engine then says bypass.
    const env = { OPENFLEET_RECORD: recordPath(home, FLEET, "460a4502"), CLAUDE_CODE_ENTRYPOINT: "sdk-cli" };
    runHook("SessionStart", payload({ source: "startup" }), fake(home, env, { cmdline: ["claude", "-p", "plan it"] }).io);
    expect(readRecord(recordPath(home, FLEET, SESSION))?.approvals).toBe("native");
    expect(runHook("UserPromptSubmit", payload({ permission_mode: "bypassPermissions" }), fake(home, env).io).exit).toBe(0);
    expect(readRecord(recordPath(home, FLEET, SESSION))?.approvals).toBe("bypass");
    expect(findEvents(readLedger(home, FLEET), "member.start", { member: SESSION })[0]?.approvals).toBe("bypass");
    expect(readSession(home, SESSION)?.approvals).toBe("bypass");
  });
});

describe("never failing the engine", () => {
  let home: string;
  beforeEach(() => {
    home = tempHome();
  });
  afterEach(() => cleanup(home));

  it("logs a bad payload, an unknown event and a handler that throws, and exits 0", () => {
    const { io } = fake(home);
    expect(runHook("SessionStart", "{{{", io)).toEqual({ exit: 0, stdout: "", stderr: "" });
    expect(runHook("Notification", payload({}), io)).toEqual({ exit: 0, stdout: "", stderr: "" });
    const broken: HookIo = { ...io, readProcCmdline: () => { throw new Error("proc exploded"); } };
    expect(runHook("SessionStart", payload({ source: "startup" }), broken)).toEqual({ exit: 0, stdout: "", stderr: "" });
    const log = readFileSync(join(home, "hooks.log"), "utf8");
    expect(log).toContain("bad payload");
    expect(log).toContain("Notification: no such hook");
    expect(log).toContain("proc exploded");
  });
});
