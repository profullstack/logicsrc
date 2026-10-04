import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import { registerErrandCommands } from "./errand.js";

/** A program shaped like the real one: positional options on, no process.exit. */
function program(): Command {
  const p = new Command();
  p.name("logicsrc").enablePositionalOptions().exitOverride();
  return p;
}

const example = fileURLToPath(new URL("../../schemas/fixtures/openerrand/ftb-register-business.json", import.meta.url));

describe("logicsrc errand", () => {
  const homes: string[] = [];
  afterEach(() => {
    for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
    process.exitCode = 0;
  });

  it("mounts run, validate and status", () => {
    const p = program();
    registerErrandCommands(p);
    const errand = p.commands.find((c) => c.name() === "errand")!;
    expect(errand.commands.map((c) => c.name()).sort()).toEqual(["run", "status", "validate"]);
  });

  it("validates the spec's worked example through the umbrella", async () => {
    const out: string[] = [];
    const home = mkdtempSync(join(tmpdir(), "logicsrc-errand-cli-"));
    homes.push(home);
    const p = program();
    registerErrandCommands(p, { out: (l) => out.push(l), say: () => undefined, env: { LOGICSRC_ERRAND_HOME: home } });
    await p.parseAsync(["node", "logicsrc", "errand", "validate", example]);
    expect(process.exitCode).toBe(0);
    expect(out.at(-1)).toMatch(/^valid OpenErrand 0\.1/);
  });
});
