import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSecretList, sh1ptProvider } from "./sh1pt.js";

/**
 * These run against a real fake `sh1pt` binary rather than a mocked execFile,
 * so the child-process path — argv, stdin, exit codes — is genuinely exercised.
 * That matters here: the whole point of the adapter is that secret values go
 * over stdin and never appear in argv.
 */
let dir: string;
let binPath: string;
let logPath: string;

/** Write a stub `sh1pt` that records how it was invoked, then prints `stdout`. */
function installFakeSh1pt(body: string): void {
  writeFileSync(
    binPath,
    `#!/usr/bin/env node
const fs = require("fs");
let stdin = "";
process.stdin.on("data", (c) => (stdin += c));
process.stdin.on("end", run);
if (process.stdin.isTTY) run();
function run() {
  const calls = fs.existsSync(${JSON.stringify(logPath)})
    ? JSON.parse(fs.readFileSync(${JSON.stringify(logPath)}, "utf8"))
    : [];
  calls.push({ argv: process.argv.slice(2), stdin });
  fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify(calls));
  ${body}
}
`,
    { mode: 0o755 }
  );
  chmodSync(binPath, 0o755);
}

function calls(): Array<{ argv: string[]; stdin: string }> {
  return existsSync(logPath) ? JSON.parse(readFileSync(logPath, "utf8")) : [];
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sh1pt-test-"));
  binPath = join(dir, "sh1pt");
  logPath = join(dir, "calls.json");
  process.env.SH1PT_BIN = binPath;
});

afterEach(() => {
  delete process.env.SH1PT_BIN;
  rmSync(dir, { recursive: true, force: true });
});

describe("parseSecretList", () => {
  it("reads plain and decorated key lists, and never invents a key", () => {
    expect(parseSecretList("NPM_TOKEN\nDOCKER_PAT\n")).toEqual(["NPM_TOKEN", "DOCKER_PAT"]);
    expect(parseSecretList("  - NPM_TOKEN\n  * DOCKER_PAT\n\n")).toEqual(["NPM_TOKEN", "DOCKER_PAT"]);
    // A value accidentally printed alongside a key has whitespace in it, so it
    // is dropped rather than treated as a key name.
    expect(parseSecretList("NPM_TOKEN = npm_abc123\nDOCKER_PAT\n")).toEqual(["DOCKER_PAT"]);
    expect(parseSecretList("")).toEqual([]);
  });
});

describe("sh1ptProvider", () => {
  it("is declared write-only: sh1pt secret get needs a human, so values cannot be read back", () => {
    expect(sh1ptProvider.capabilities.readValues).toBe(false);
    expect(sh1ptProvider.capabilities.rollback).toBe(false);
    expect(sh1ptProvider.readValues).toBeUndefined();
    expect(sh1ptProvider.capabilities.write).toBe(true);
  });

  it("lists key names and reports values as unreadable", async () => {
    installFakeSh1pt(`process.stdout.write("NPM_TOKEN\\nCLOUDFLARE_TOKEN\\n");`);

    const snapshot = await sh1ptProvider.inspect({ provider: "sh1pt", project: "acme", config: "prod" });

    expect(snapshot.valuesReadable).toBe(false);
    expect(snapshot.keys.map((k) => k.name)).toEqual(["CLOUDFLARE_TOKEN", "NPM_TOKEN"]);
    // Names only — a fingerprint would imply we had seen the value.
    expect(snapshot.keys.every((k) => k.fingerprint === undefined)).toBe(true);
    expect(calls()[0].argv).toEqual(["secret", "list", "--project", "acme", "--env", "prod"]);
  });

  it("passes secret values on stdin and NEVER in argv", async () => {
    installFakeSh1pt("");
    const value = "npm_supersecret_value";

    const results = await sh1ptProvider.write({
      endpoint: { provider: "sh1pt" },
      upserts: { NPM_TOKEN: value },
      deletes: [],
      dryRun: false
    });

    expect(results).toEqual([{ key: "NPM_TOKEN", applied: true }]);
    const call = calls()[0];
    expect(call.argv).toEqual(["secret", "set", "NPM_TOKEN"]);
    // The security property this adapter exists to hold: a value in argv is
    // readable by any process on the box via `ps`.
    expect(call.argv.join(" ")).not.toContain(value);
    expect(call.stdin.trim()).toBe(value);
  });

  it("deletes through `secret rm`", async () => {
    installFakeSh1pt("");

    const results = await sh1ptProvider.write({
      endpoint: { provider: "sh1pt" },
      upserts: {},
      deletes: ["OLD_TOKEN"],
      dryRun: false
    });

    expect(results).toEqual([{ key: "OLD_TOKEN", applied: true }]);
    expect(calls()[0].argv).toEqual(["secret", "rm", "OLD_TOKEN"]);
  });

  it("a dry run touches nothing", async () => {
    installFakeSh1pt("");

    const results = await sh1ptProvider.write({
      endpoint: { provider: "sh1pt" },
      upserts: { A: "1" },
      deletes: ["B"],
      dryRun: true
    });

    expect(results).toEqual([
      { key: "A", applied: false },
      { key: "B", applied: false }
    ]);
    expect(calls()).toEqual([]);
  });

  it("reports a per-key failure instead of aborting the whole run", async () => {
    installFakeSh1pt(`
      if (process.argv[4] === "BAD") { process.stderr.write("vault rejected BAD"); process.exit(1); }
    `);

    const results = await sh1ptProvider.write({
      endpoint: { provider: "sh1pt" },
      upserts: { GOOD: "1", BAD: "2" },
      deletes: [],
      dryRun: false
    });

    expect(results.find((r) => r.key === "GOOD")?.applied).toBe(true);
    const bad = results.find((r) => r.key === "BAD");
    expect(bad?.applied).toBe(false);
    expect(bad?.error).toMatch(/vault rejected BAD/);
  });

  it("rejects a malformed secret name before shelling out", async () => {
    installFakeSh1pt("");

    await expect(
      sh1ptProvider.write({ provider: "sh1pt", endpoint: { provider: "sh1pt" }, upserts: { "not a key": "x" }, deletes: [], dryRun: false } as never)
    ).rejects.toThrow(/not a valid sh1pt secret name/);
    expect(calls()).toEqual([]);
  });

  it("explains how to fix a missing sh1pt CLI", async () => {
    process.env.SH1PT_BIN = join(dir, "does-not-exist");

    await expect(sh1ptProvider.inspect({ provider: "sh1pt" })).rejects.toThrow(/sh1pt CLI was not found on PATH/);
  });
});
