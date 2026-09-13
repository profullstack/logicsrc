import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Deps } from "@logicsrc/openfleet/commands";
import { registerFleetCommands } from "./fleet.js";

/** A program shaped like the real one: positional options on, no process.exit. */
function program(): Command {
  const p = new Command();
  p.name("logicsrc").enablePositionalOptions().exitOverride();
  return p;
}

const OPENFLEET_KEYS = ["OPENFLEET_HOME", "OPENFLEET_RECORD", "OPENFLEET_FLEET", "OPENFLEET_MEMBER", "OPENFLEET_SWARM"];

describe("logicsrc fleet", () => {
  let home: string;
  let saved: Record<string, string | undefined>;
  let out: string[];
  let err: string[];
  let deps: Partial<Deps>;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "logicsrc-fleet-"));
    saved = Object.fromEntries(OPENFLEET_KEYS.map((key) => [key, process.env[key]]));
    out = [];
    err = [];
    deps = {
      env: { OPENFLEET_HOME: home, HOME: home },
      now: () => new Date("2026-09-13T06:00:00Z"),
      exec: async () => ({ code: 0, stdout: "", stderr: "" }),
      kill: () => undefined,
      rosters: {},
      stdin: async () => "",
      write: (line) => out.push(line),
      error: (line) => err.push(line),
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
      host: "dev",
      user: "anthony",
    };
  });

  afterEach(() => {
    for (const key of OPENFLEET_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(home, { recursive: true, force: true });
    process.exitCode = 0;
  });

  it("registers the group with the five verbs and the hook verbs", () => {
    const p = program();
    registerFleetCommands(p, deps);
    const fleet = p.commands.find((command) => command.name() === "fleet");
    expect(fleet).toBeDefined();
    expect(fleet!.commands.map((command) => command.name()).sort()).toEqual(["cap", "hook", "hooks", "log", "open", "stop", "tree"]);
    expect(fleet!.description()).toContain("OpenFleet");
  });

  it("opens a fleet, then shows it in the tree and the log, over the injected home", async () => {
    const p = program();
    registerFleetCommands(p, deps);
    await p.parseAsync(["node", "logicsrc", "fleet", "open", "--approvals", "bypass", "--depth", "2", "--json"]);
    expect(process.exitCode).toBe(0);
    expect(JSON.parse(out[0])).toMatchObject({ fleet: "fleet-20260913", sysop: "anthony@dev", ceiling: { approvals: "bypass", depth: 2, hosts: ["dev"] } });
    expect(readFileSync(join(home, "current"), "utf8")).toBe("fleet-20260913\n");

    const tree = program();
    registerFleetCommands(tree, deps);
    await tree.parseAsync(["node", "logicsrc", "fleet", "tree"]);
    expect(out[1]).toBe("fleet-20260913  (fleet, sysop anthony@dev, approvals bypass, depth 2, hosts dev)");

    const log = program();
    registerFleetCommands(log, deps);
    await log.parseAsync(["node", "logicsrc", "fleet", "log", "--json"]);
    expect(JSON.parse(out[2])).toMatchObject({ event: "fleet.open", by: "sysop", fleet: "fleet-20260913", host: "dev" });
  });

  it("refuses the sysop's verbs with exit 4 when the process is an agent", async () => {
    const p = program();
    registerFleetCommands(p, { ...deps, env: { ...deps.env, OPENFLEET_MEMBER: "create-two-0541-1" } });
    await p.parseAsync(["node", "logicsrc", "fleet", "open"]);
    expect(process.exitCode).toBe(4);
    expect(err[0]).toContain("OPENFLEET_MEMBER=create-two-0541-1");
    expect(out).toEqual([]);
  });

  it("inspects the hooks of a settings file given by flag, never the real one", async () => {
    const file = join(home, "settings.json");
    const p = program();
    registerFleetCommands(p, deps);
    await p.parseAsync(["node", "logicsrc", "fleet", "hooks", "status", "--settings-file", file, "--json"]);
    expect(JSON.parse(out[0])).toMatchObject({ file, present: false, installed: false });
  });
});
