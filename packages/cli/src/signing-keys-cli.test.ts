import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signingKeysInEnvFile, teamsPullAction, teamsPushAction } from "./teams.js";

const dirs: string[] = [];
const envFile = (body: string) => {
  const d = mkdtempSync(join(tmpdir(), "lsk-sign-"));
  dirs.push(d);
  const p = join(d, ".env");
  writeFileSync(p, body);
  return p;
};
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe("signing keys stay out of team vaults", () => {
  it("finds signing keys by name and by value shape", () => {
    const p = envFile(`API_KEY=abc\nSOLANA_PRIVATE_KEY=xyz\nNOTES=0x${"ab".repeat(32)}\nSESSION_SECRET=${"cd".repeat(32)}\n`);
    expect(signingKeysInEnvFile(p)).toEqual(["NOTES", "SOLANA_PRIVATE_KEY"]);
    expect(signingKeysInEnvFile(join(tmpdir(), "missing-lsk.env"))).toEqual([]);
  });

  it("push refuses a file holding signing keys before touching the network", async () => {
    const p = envFile("EVM_PRIVATE_KEY=0xabc\n");
    await expect(teamsPushAction("acme", "web", "prod", { env: p, format: "json" })).rejects.toThrow(/signing keys: EVM_PRIVATE_KEY/);
  });

  it("pull refuses --include-signing-keys without a terminal", async () => {
    const p = envFile("");
    await expect(teamsPullAction("acme", "web", "prod", { env: p, format: "json", includeSigningKeys: true })).rejects.toThrow(/needs a person at a terminal/);
  });
});
