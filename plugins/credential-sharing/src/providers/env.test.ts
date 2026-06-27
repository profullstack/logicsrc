import { describe, expect, it } from "vitest";
import { parseEnv, applyEnv } from "./env.js";

describe("env provider parsing", () => {
  it("parses plain, quoted, and exported lines and ignores comments", () => {
    const body = ["# comment", "A=1", 'B="two words"', "export C=three", "", "D='quoted'"].join("\n");
    expect(parseEnv(body)).toEqual({ A: "1", B: "two words", C: "three", D: "quoted" });
  });

  it("decodes escaped newlines inside double quotes", () => {
    expect(parseEnv('KEY="line1\\nline2"')).toEqual({ KEY: "line1\nline2" });
  });
});

describe("env provider merge", () => {
  it("updates existing keys in place and appends new ones", () => {
    const body = "# header\nA=1\nB=2\n";
    const next = applyEnv(body, { A: "10", C: "3" }, []);
    expect(next).toBe("# header\nA=10\nB=2\nC=3\n");
  });

  it("removes deleted keys but preserves comments", () => {
    const body = "# header\nA=1\nB=2\n";
    expect(applyEnv(body, {}, ["B"])).toBe("# header\nA=1\n");
  });

  it("quotes values that need it", () => {
    expect(applyEnv("", { A: "two words" }, [])).toBe('A="two words"\n');
  });
});
