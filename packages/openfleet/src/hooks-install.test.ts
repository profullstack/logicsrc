import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HOOK_EVENTS, hookCommand, hookSpecs, hooksStatus, installHooks, isOurs, removeHooks, settingsFile } from "./hooks-install.js";
import { cleanup, tempHome } from "./test-helpers.js";

describe("hook commands", () => {
  it("guard every event so a box without logicsrc stays silent, and let only UserPromptSubmit be heard", () => {
    expect(hookCommand("SessionStart")).toBe("command -v logicsrc >/dev/null 2>&1 && logicsrc fleet hook SessionStart; exit 0");
    expect(hookCommand("Stop")).toBe("command -v logicsrc >/dev/null 2>&1 && logicsrc fleet hook Stop; exit 0");
    expect(hookCommand("UserPromptSubmit")).toBe("command -v logicsrc >/dev/null 2>&1 || exit 0; logicsrc fleet hook UserPromptSubmit");
    expect(hookCommand("SessionStart")).not.toContain(">/dev/null 2>&1 && logicsrc fleet hook SessionStart >/dev/null");
    const specs = hookSpecs();
    expect(specs.map((spec) => spec.event)).toEqual([...HOOK_EVENTS]);
    expect(specs.find((spec) => spec.event === "PreToolUse")?.matcher).toBe("Edit|Write|MultiEdit|NotebookEdit");
    expect(specs.find((spec) => spec.event === "SessionEnd")?.timeout).toBe(20);
    expect(specs.filter((spec) => spec.event !== "PreToolUse").every((spec) => spec.matcher === undefined)).toBe(true);
  });

  it("recognises ours by the command text alone", () => {
    expect(isOurs({ type: "command", command: hookCommand("Stop") })).toBe(true);
    expect(isOurs({ type: "command", command: "moshcode herd report x done" })).toBe(false);
    expect(isOurs(null)).toBe(false);
  });

  it("resolves the settings file from HOME or CLAUDE_CONFIG_DIR", () => {
    expect(settingsFile({ HOME: "/home/x" })).toBe("/home/x/.claude/settings.json");
    expect(settingsFile({ HOME: "/home/x", CLAUDE_CONFIG_DIR: "/cfg" })).toBe("/cfg/settings.json");
  });
});

describe("install, status, remove over a settings file", () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = tempHome();
    mkdirSync(join(dir, ".claude"));
    file = join(dir, ".claude", "settings.json");
  });
  afterEach(() => cleanup(dir));

  it("creates the file with five matcher-less groups (PreToolUse with its matcher), 0600, then is idempotent", () => {
    const first = installHooks(file);
    expect(first.ok).toBe(true);
    expect(first.written).toBe(5);
    expect(first.changes.every((change) => change.change === "added")).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const settings = JSON.parse(readFileSync(file, "utf8"));
    for (const event of HOOK_EVENTS) expect(settings.hooks[event].length).toBe(1);
    expect(settings.hooks.Stop[0]).toEqual({ hooks: [{ type: "command", command: hookCommand("Stop") }] });
    expect(settings.hooks.PreToolUse[0]).toEqual({ matcher: "Edit|Write|MultiEdit|NotebookEdit", hooks: [{ type: "command", command: hookCommand("PreToolUse") }] });
    expect(settings.hooks.SessionEnd[0].hooks[0]).toEqual({ type: "command", command: hookCommand("SessionEnd"), timeout: 20 });

    const before = readFileSync(file, "utf8");
    const second = installHooks(file);
    expect(second.written).toBe(0);
    expect(second.changes.every((change) => change.change === "unchanged")).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(before);

    const status = hooksStatus(file);
    expect(status).toMatchObject({ file, present: true, readable: true, installed: true, partial: false });
    expect(status.events.every((event) => event.installed && event.current)).toBe(true);
  });

  it("merges into an existing file, keeps everyone else's hooks and settings, and preserves the mode", () => {
    writeFileSync(
      file,
      JSON.stringify({
        model: "opus",
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "moshcode herd report \"$MOSHCODE_HERD_NAME\" done; exit 0" }] }],
          Notification: [{ hooks: [{ type: "command", command: "say hi" }] }],
        },
      }),
    );
    chmodSync(file, 0o644);
    const result = installHooks(file);
    expect(result.ok).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o644);
    const settings = JSON.parse(readFileSync(file, "utf8"));
    expect(settings.model).toBe("opus");
    expect(settings.hooks.Notification).toEqual([{ hooks: [{ type: "command", command: "say hi" }] }]);
    expect(settings.hooks.Stop.length).toBe(2);
    expect(settings.hooks.Stop[0].hooks[0].command).toContain("moshcode herd report");
    expect(settings.hooks.Stop[1].hooks[0].command).toBe(hookCommand("Stop"));

    const removed = removeHooks(file);
    expect(removed).toMatchObject({ ok: true, removed: 5 });
    const after = JSON.parse(readFileSync(file, "utf8"));
    expect(after).toEqual({
      model: "opus",
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "moshcode herd report \"$MOSHCODE_HERD_NAME\" done; exit 0" }] }],
        Notification: [{ hooks: [{ type: "command", command: "say hi" }] }],
      },
    });
    expect(removeHooks(file)).toMatchObject({ ok: true, removed: 0 });
  });

  it("replaces an older text of ours rather than firing twice, and status says so before", () => {
    writeFileSync(file, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "logicsrc fleet hook Stop >/dev/null 2>&1; exit 0" }] }] } }));
    const status = hooksStatus(file);
    expect(status.partial).toBe(true);
    expect(status.events.find((event) => event.event === "Stop")).toEqual({ event: "Stop", installed: true, current: false });
    const result = installHooks(file);
    expect(result.changes.find((change) => change.event === "Stop")?.change).toBe("updated");
    const settings = JSON.parse(readFileSync(file, "utf8"));
    expect(settings.hooks.Stop).toEqual([{ hooks: [{ type: "command", command: hookCommand("Stop") }] }]);
  });

  it("removes ours from any event, drops empty structure only when it made it, and leaves a missing file missing", () => {
    installHooks(file);
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), hooks: { ...JSON.parse(readFileSync(file, "utf8")).hooks, SubagentStop: [{ hooks: [{ type: "command", command: "logicsrc fleet hook SubagentStop; exit 0" }] }] } }));
    const removed = removeHooks(file);
    expect(removed.removed).toBe(6);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({});
    const missing = join(dir, "nowhere", "settings.json");
    expect(removeHooks(missing)).toMatchObject({ ok: true, removed: 0 });
    expect(existsSync(missing)).toBe(false);
    expect(hooksStatus(missing)).toMatchObject({ present: false, readable: true, installed: false, partial: false });
  });

  it("refuses to merge into a file it cannot parse, and a dry run writes nothing", () => {
    writeFileSync(file, "{ not json");
    const result = installHooks(file);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not valid JSON/);
    expect(readFileSync(file, "utf8")).toBe("{ not json");
    expect(hooksStatus(file).readable).toBe(false);
    writeFileSync(file, "{}");
    const dry = installHooks(file, { dryRun: true });
    expect(dry.written).toBe(5);
    expect(readFileSync(file, "utf8")).toBe("{}");
  });
});
