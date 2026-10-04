import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveInputs } from "./inputs.js";
import { credentialValues, fileDownloads, renderCard, writeCredentials } from "./outputs.js";
import { ftbExample, tempDir } from "./testing.js";
import type { Errand } from "./types.js";
import { fileVault, parseEnv, parseTarget, serializeEnv, teamsVault, type LogicsrcExec, type Vault } from "./vault.js";

const OVERRIDES = { email: "jane@example.com", phone: "5555550100", first_name: "Jane", last_name: "Doe", street: "1234 Maple St", zip: "95814", corp_id: "1234567", net_income: "48210", tax_year: "2025" };

describe("hand-off cards", () => {
  it("renders built-ins and keeps the card to public values", async () => {
    const e = ftbExample();
    const inputs = await resolveInputs(e, { overrides: OVERRIDES });
    const card = renderCard(e, "pin-letter", inputs, { expires_on: "2026-10-25" }, () => 0);
    expect(card.id).toMatch(/^pin-letter\/[a-z2-9]{6}$/);
    expect(card.steps[1]).toBe("Activate before 2026-10-25: the PIN expires 21 days after registration.");
    expect(JSON.stringify(card)).not.toMatch(/jane|5555550100|48210|Maple/i);
  });

  it("refuses a card that names a personal or secret input, whatever the validator said", async () => {
    const e: Errand = { ...ftbExample(), handoffs: { "pin-letter": { title: "PIN for {{first_name}}", steps: ["x"] } } };
    const inputs = await resolveInputs(e, { overrides: OVERRIDES });
    expect(() => renderCard(e, "pin-letter", inputs, {}, () => 0)).toThrow(/personal/);
  });
});

describe("credentials", () => {
  it("renders the keys only for the outcome named in when", async () => {
    const e = ftbExample();
    const inputs = await resolveInputs(e, { overrides: OVERRIDES });
    const values = credentialValues(e, e.outcomes.find((o) => o.name === "registered")!, inputs);
    expect(Object.keys(values).sort()).toEqual(["FTB_BUSINESS_EMAIL", "FTB_BUSINESS_PASSWORD", "FTB_BUSINESS_SECURITY_ANSWERS", "FTB_BUSINESS_USERNAME"]);
    expect(values.FTB_BUSINESS_PASSWORD).toBe(inputs.get("password"));
    expect(credentialValues(e, e.outcomes.find((o) => o.name === "rejected")!, inputs)).toEqual({});
  });

  it("falls back to the 0600 file when the vault is read-only or the write fails, and says so", async () => {
    const dir = tempDir();
    const fallback = fileVault(join(dir, "creds.env"));
    const readOnly: Vault = { describe: () => "OpenCreds", get: async () => undefined };
    const r1 = await writeCredentials({ A: "1" }, readOnly, fallback);
    expect(r1.warning).toMatch(/read-only/);
    expect(statSync(join(dir, "creds.env")).mode & 0o777).toBe(0o600);
    const broken: Vault = { ...readOnly, write: async () => Promise.reject(new Error("offline")) };
    const r2 = await writeCredentials({ B: "2" }, broken, fallback);
    expect(r2.warning).toMatch(/offline/);
    expect(parseEnv(readFileSync(join(dir, "creds.env"), "utf8"))).toEqual({ A: "1", B: "2" });
  });
});

describe("vaults", () => {
  it("round-trips values with quotes, specials and JSON", () => {
    const values = { P: "a#b$c*d@e!f", Q: '{"Pet?":"rex"}', R: "plain", S: "back\\slash" };
    expect(parseEnv(serializeEnv(values))).toEqual(values);
  });

  it("parses targets", () => {
    expect(parseTarget("teams:profullstack/ftb/prod")).toEqual({ kind: "teams", team: "profullstack", project: "ftb", env: "prod" });
    expect(parseTarget("opencreds")).toEqual({ kind: "opencreds" });
    expect(() => parseTarget("s3://x")).toThrow(/expected/);
  });

  it("a teams write pulls, merges and pushes, never dropping a key already there", async () => {
    let remote: Record<string, string> = { OTHER_KEY: "keep me", FTB_BUSINESS_EMAIL: "old@example.com" };
    const calls: string[] = [];
    const exec: LogicsrcExec = (args) => {
      calls.push(args.slice(0, 5).join(" "));
      const file = args[args.indexOf("--env") + 1]!;
      if (args[1] === "pull") writeFileSync(file, serializeEnv(remote));
      if (args[1] === "push") remote = parseEnv(readFileSync(file, "utf8"));
      return { status: 0, stdout: "", stderr: "" };
    };
    const vault = teamsVault({ kind: "teams", team: "profullstack", project: "ftb", env: "prod" }, exec);
    expect(await vault.get("OTHER_KEY")).toBe("keep me");
    await vault.write!({ FTB_BUSINESS_EMAIL: "jane@example.com", FTB_BUSINESS_PASSWORD: "x#y" });
    expect(remote).toEqual({ OTHER_KEY: "keep me", FTB_BUSINESS_EMAIL: "jane@example.com", FTB_BUSINESS_PASSWORD: "x#y" });
    expect(calls).toEqual(["teams pull profullstack ftb prod", "teams pull profullstack ftb prod", "teams push profullstack ftb prod"]);
  });

  it("a failed push is an error the caller turns into the file fallback", async () => {
    const exec: LogicsrcExec = (args) => (args[1] === "push" ? { status: 1, stdout: "", stderr: "not logged in" } : { status: 0, stdout: "", stderr: "" });
    const vault = teamsVault({ kind: "teams", team: "t", project: "p", env: "e" }, exec);
    await expect(vault.write!({ A: "1" })).rejects.toThrow(/not logged in/);
  });
});

describe("downloads", () => {
  it("checks the type, files it, and never overwrites different bytes", async () => {
    const e: Errand = {
      ...ftbExample(),
      outputs: { downloads: [{ match: { type: "application/pdf", url: "transcript" }, to: "{{dir}}/{{tax_year}}/transcript.pdf", when: "registered" }] },
      inputs: { ...ftbExample().inputs, dir: { type: "string", sensitivity: "public", sources: [{ from: "literal", value: tempDir() }] } },
    };
    const inputs = await resolveInputs(e, { overrides: OVERRIDES });
    const dl = tempDir();
    writeFileSync(join(dl, "a"), "%PDF-1.7 fake");
    const outcome = e.outcomes.find((o) => o.name === "registered")!;
    const files = [{ url: "https://webapp.ftb.ca.gov/transcript?id=1", filename: "t.pdf", path: join(dl, "a") }];
    const [to] = fileDownloads(e, outcome, inputs, files);
    expect(to).toMatch(/2025\/transcript\.pdf$/);
    // Same bytes again: fine. Different bytes: refused.
    expect(fileDownloads(e, outcome, inputs, files)).toEqual([to]);
    writeFileSync(join(dl, "b"), "%PDF-1.7 different");
    expect(() => fileDownloads(e, outcome, inputs, [{ ...files[0]!, path: join(dl, "b") }])).toThrow(/different bytes/);
    writeFileSync(join(dl, "c"), "<html>not a pdf</html>");
    expect(() => fileDownloads(e, outcome, inputs, [{ ...files[0]!, path: join(dl, "c") }])).toThrow(/is not application\/pdf/);
  });
});
