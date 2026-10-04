import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import { type Deps, registerErrandCommands } from "./commands.js";
import { FakeDriver, ftbExamplePath, tempDir } from "./testing.js";

function setup(over: Partial<Deps> = {}) {
  const home = tempDir();
  const out: string[] = [];
  const say: string[] = [];
  const p = new Command();
  p.name("logicsrc").enablePositionalOptions().exitOverride();
  registerErrandCommands(p.command("errand"), {
    env: { LOGICSRC_ERRAND_HOME: home, HOME: home },
    out: (l) => out.push(l),
    say: (l) => say.push(l),
    interactive: false,
    now: () => new Date("2026-10-04T12:00:00Z"),
    ...over,
  });
  return { p, home, out, say };
}

afterEach(() => {
  process.exitCode = 0;
});

describe("logicsrc errand validate", () => {
  it("accepts the spec's worked example and shows every gate and input", async () => {
    const { p, out } = setup();
    await p.parseAsync(["node", "logicsrc", "errand", "validate", ftbExamplePath()]);
    expect(process.exitCode).toBe(0);
    const text = out.join("\n");
    expect(text).toContain("declare (declaration): Ticking this box is the representative stating");
    expect(text).toContain("net_income [secret, shared-secret]");
    expect(text).toMatch(/valid OpenErrand 0\.1 {2}sha256 [0-9a-f]{64}/);
  });

  it("rejects a file the validator rejects, with the reason", async () => {
    const { p, home, say } = setup();
    const bad = JSON.parse(readFileSync(ftbExamplePath(), "utf8"));
    bad.steps.push({ id: "cap", kind: "captcha", match: { selector: ".g-recaptcha" }, solver: "allowed" });
    writeFileSync(join(home, "bad.json"), JSON.stringify(bad));
    await p.parseAsync(["node", "logicsrc", "errand", "validate", join(home, "bad.json")]);
    expect(process.exitCode).toBe(2);
    expect(say.join("\n")).toMatch(/captcha solver is never allowed on a tax site/);
  });
});

describe("logicsrc errand run", () => {
  it("refuses an --input the errand does not have, before any browser", async () => {
    let opened = false;
    const { p, say } = setup({ openDriver: async () => ((opened = true), new FakeDriver({}, () => "")) });
    await p.parseAsync(["node", "logicsrc", "errand", "run", ftbExamplePath(), "--input", "nope=1"]);
    expect(process.exitCode).toBe(2);
    expect(say.join("\n")).toMatch(/no input named nope/);
    expect(opened).toBe(false);
  });

  it("stops before the browser when a required input has no value and nobody is at a terminal", async () => {
    let opened = false;
    const { p, say } = setup({ openDriver: async () => ((opened = true), new FakeDriver({}, () => "")) });
    await p.parseAsync(["node", "logicsrc", "errand", "run", ftbExamplePath()]);
    expect(process.exitCode).toBe(3);
    expect(say.join("\n")).toMatch(/no value for Email address/);
    expect(opened).toBe(false);
  });

  it("shows a changed file and does not run it without --yes", async () => {
    const { p, home, say } = setup({ openDriver: async () => new FakeDriver({}, () => "") });
    const copy = join(home, "errand.json");
    writeFileSync(copy, readFileSync(ftbExamplePath(), "utf8"));
    const args = ["node", "logicsrc", "errand", "run", copy, "--dry-run", "--input", "email=jane@example.com", "--input", "phone=5555550100"];
    for (const name of ["first_name=Jane", "last_name=Doe", "street=1234 Maple St", "zip=95814", "corp_id=1234567", "net_income=48210", "tax_year=2025"]) args.push("--input", name);
    await p.parseAsync(args);
    const edited = JSON.parse(readFileSync(copy, "utf8"));
    edited.title = "Register a MyFTB business account (edited)";
    writeFileSync(copy, JSON.stringify(edited));
    say.length = 0;
    await p.parseAsync(args);
    expect(say.join("\n")).toMatch(/this file changed since its last run/);
    expect(say.join("\n")).toContain("Not run.");
    expect(process.exitCode).toBe(3);
  });
});

describe("logicsrc errand status", () => {
  it("says when nothing has run", async () => {
    const { p, out } = setup();
    await p.parseAsync(["node", "logicsrc", "errand", "status"]);
    expect(out).toEqual(["No errands run yet."]);
  });
});
