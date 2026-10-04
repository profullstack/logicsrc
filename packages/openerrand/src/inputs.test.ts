import { describe, expect, it } from "vitest";
import { type DocumentRecord, generate, inYears, resolveInputs, type VaultReader } from "./inputs.js";
import { ftbExample } from "./testing.js";
import type { Errand } from "./types.js";
import { transform } from "./util.js";

const NOW = new Date("2026-10-04T12:00:00Z");

/** Fictional returns for Jane Doe and her corporation; nothing here is anyone's real data. */
const RECORDS: DocumentRecord[] = [
  { form: "CA 540", field: "first name", value: "Jane", year: 2025, file: "2025/540.pdf", page: 1 },
  { form: "CA 540", field: "last name", value: "Doe", year: 2025, file: "2025/540.pdf", page: 1 },
  { form: "CA 540", field: "street address", value: "1234 Maple St", year: 2025, file: "2025/540.pdf", page: 1 },
  { form: "CA 540", field: "ZIP code", value: "95814-1234", year: 2025, file: "2025/540.pdf", page: 1 },
  { form: "CA 540", field: "street address", value: "99 Old Rd", year: 2023, file: "2023/540.pdf", page: 1 },
  { form: "CA 100S", field: "California corporation number", value: "1234567", year: 2025, file: "2025/100S.pdf", page: 1 },
  { form: "CA 100S", field: "line 20", label: "Net income for tax purposes", value: "48,210.40", year: 2025, file: "2025/100S.pdf", page: 3 },
  { form: "CA 100S", field: "line 15", label: "Net income (loss) for state purposes", value: "51,377", year: 2025, file: "2025/100S.pdf", page: 3 },
  { form: "CA 100S", field: "line 20", label: "Net income for tax purposes", value: "39,875", year: 2024, file: "2024/100S.pdf", page: 3 },
  // The year in progress and a year too old: neither counts.
  { form: "CA 100S", field: "line 20", label: "Net income for tax purposes", value: "1", year: 2026, file: "2026/100S.pdf", page: 3 },
  { form: "CA 100S", field: "line 20", label: "Net income for tax purposes", value: "2", year: 2019, file: "2019/100S.pdf", page: 3 },
];

const extractor = { extract: async () => RECORDS };
const noVault: VaultReader = { describe: () => "none", get: async () => undefined };

function tiny(inputs: Errand["inputs"]): Errand {
  return {
    type: "logicsrc.openerrand",
    version: "0.1",
    name: "t",
    title: "t",
    site: { name: "x", origins: ["https://example.com"], start: ["https://example.com/"] },
    inputs,
    steps: [{ id: "form", kind: "page" }],
    outcomes: [{ name: "ok", kind: "success", text: "ok" }],
  };
}

describe("the FTB example's inputs", () => {
  it("resolves documents, derives, candidates and generated credentials", async () => {
    const inputs = await resolveInputs(ftbExample(), { extractor, vault: noVault, now: NOW, overrides: { email: "jane@example.com", phone: "5555550100" } });
    expect(inputs.get("first_name")).toBe("Jane");
    expect(inputs.get("address_numbers")).toBe("1234");
    expect(inputs.get("zip")).toBe("95814");
    expect(inputs.get("corp_id")).toBe("1234567");
    // Shared secret candidates: line 20 newest first, then line 15; the year in progress and 2019 are out.
    expect(inputs.candidates.map((c) => [c.year, c.field, c.value])).toEqual([
      [2025, "line 20", "48210"],
      [2024, "line 20", "39875"],
      [2025, "line 15", "51377"],
    ]);
    expect(inputs.get("net_income")).toBe("48210");
    expect(inputs.get("tax_year")).toBe("2025");
    expect(inputs.get("username")).toMatch(/^[a-z][a-z0-9]{14}$/);
    expect(inputs.get("password")).toHaveLength(24);
    expect(inputs.values.get("username")?.from).toBe("generate");
  });

  it("--candidate chooses another candidate, and the tax year follows it", async () => {
    const inputs = await resolveInputs(ftbExample(), { extractor, now: NOW, candidate: 2, overrides: { email: "jane@example.com", phone: "5555550100" } });
    expect(inputs.get("net_income")).toBe("39875");
    expect(inputs.get("tax_year")).toBe("2024");
  });

  it("reuses a vault login before generating one", async () => {
    const vault: VaultReader = {
      describe: () => "test",
      get: async (key) => ({ FTB_BUSINESS_USERNAME: "jdoe1", FTB_BUSINESS_SECURITY_ANSWERS: '{"Pet?":"rex"}' })[key],
    };
    const inputs = await resolveInputs(ftbExample(), { extractor, vault, now: NOW, overrides: { email: "jane@example.com", phone: "5555550100" } });
    expect(inputs.get("username")).toBe("jdoe1");
    expect(inputs.values.get("username")).toMatchObject({ from: "vault", origin: "FTB_BUSINESS_USERNAME" });
    expect(inputs.values.get("password")?.from).toBe("generate");
    expect(inputs.qa.get("security")?.answers).toEqual({ "Pet?": "rex" });
  });

  it("masks secrets on the terminal and shows personal values to the principal", async () => {
    const inputs = await resolveInputs(ftbExample(), { extractor, now: NOW, overrides: { email: "jane@example.com", phone: "5555550100" } });
    expect(inputs.display("password")).toBe("••••");
    expect(inputs.display("net_income")).toBe("••••");
    expect(inputs.display("first_name")).toBe("Jane");
  });

  it("stops before the browser when a required input has no value", async () => {
    await expect(resolveInputs(ftbExample(), { extractor, now: NOW })).rejects.toThrow(/no value for Email address/);
  });

  it("checks a value against the input's pattern", async () => {
    await expect(resolveInputs(ftbExample(), { extractor, now: NOW, overrides: { email: "jane@example.com", phone: "555" } })).rejects.toThrow(/phone does not match/);
  });

  it("refuses an --input for a name the errand does not have", async () => {
    await expect(resolveInputs(ftbExample(), { overrides: { nope: "1" } })).rejects.toThrow(/no input named nope/);
  });
});

describe("sources", () => {
  it("tries sources in order: a prompt with nobody at a terminal falls through to the next", async () => {
    const e = tiny({ a: { type: "string", sensitivity: "public", sources: [{ from: "prompt" }, { from: "literal", value: "fixed" }] } });
    expect((await resolveInputs(e, { prompt: async () => null })).get("a")).toBe("fixed");
    expect((await resolveInputs(e, { prompt: async () => "typed" })).get("a")).toBe("typed");
  });

  it("asks for a secret without echo", async () => {
    const asked: boolean[] = [];
    const e = tiny({ pw: { type: "string", sensitivity: "secret", sources: [{ from: "prompt", ask: "Password: " }] } });
    await resolveInputs(e, { prompt: async (_q, o) => (asked.push(o.secret), "x") });
    expect(asked).toEqual([true]);
  });

  it("cuts a value to max_length", async () => {
    const e = tiny({ n: { type: "string", sensitivity: "personal", max_length: 3, sources: [{ from: "literal", value: "Alexandra" }] } });
    expect((await resolveInputs(e)).get("n")).toBe("Ale");
  });

  it("picks the oldest when asked", async () => {
    const e = tiny({ s: { type: "string", sensitivity: "personal", sources: [{ from: "document", form: "CA 540", field: "street address", pick: "oldest" }] } });
    expect((await resolveInputs(e, { extractor, now: NOW })).get("s")).toBe("99 Old Rd");
  });

  it("a document match tests the printed label", async () => {
    const e = tiny({ s: { type: "integer", sensitivity: "secret", sources: [{ from: "document", form: "100S", field: "line 20", match: "state purposes", transform: "whole" }] } });
    expect((await resolveInputs(e, { extractor, now: NOW })).get("s")).toBeUndefined();
  });

  it("detects an input that depends on itself through another", async () => {
    const e = tiny({
      a: { type: "string", sensitivity: "public", sources: [{ from: "derive", input: "b", transform: "trim" }] },
      b: { type: "string", sensitivity: "public", sources: [{ from: "derive", input: "a", transform: "trim" }] },
    });
    await expect(resolveInputs(e)).rejects.toThrow(/depends on itself/);
  });
});

describe("generate", () => {
  it("has at least one of each class and only the specials given", () => {
    let n = 0;
    const random = (max: number) => (n++ * 7) % max;
    for (let i = 0; i < 20; i += 1) {
      const v = generate({ from: "generate", length: 12, classes: ["lower", "upper", "digit", "special"], special: "!#" }, random);
      expect(v).toHaveLength(12);
      expect(v).toMatch(/[a-z]/);
      expect(v).toMatch(/[A-Z]/);
      expect(v).toMatch(/[2-9]/);
      expect(v).toMatch(/[!#]/);
      expect(v).not.toMatch(/[^a-zA-Z0-9!#]/);
    }
  });

  it("starts with a letter when letters are allowed", () => {
    for (let i = 0; i < 50; i += 1) expect(generate({ from: "generate", length: 15, classes: ["lower", "digit"] })).toMatch(/^[a-z]/);
  });
});

describe("transforms and years", () => {
  it("whole keeps whole units with a minus for a loss", () => {
    expect(transform("48,210.99", "whole")).toBe("48210");
    expect(transform("(1,234)", "whole")).toBe("-1234");
    expect(transform("-1,234.5", "whole")).toBe("-1234");
    expect(transform("1234 Maple St, Apt 5", "digits")).toBe("12345");
    expect(transform("95814-1234", "first:5")).toBe("95814");
    expect(transform("123456789", "last:4")).toBe("6789");
  });

  it("counts closed years back and leaves out the year in progress unless asked", () => {
    expect(inYears(2025, { back: 5, current: false }, NOW)).toBe(true);
    expect(inYears(2021, { back: 5, current: false }, NOW)).toBe(true);
    expect(inYears(2020, { back: 5, current: false }, NOW)).toBe(false);
    expect(inYears(2026, { back: 5, current: false }, NOW)).toBe(false);
    expect(inYears(2026, { back: 5, current: true }, NOW)).toBe(true);
  });
});
