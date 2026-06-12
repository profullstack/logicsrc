import { describe, expect, it } from "vitest";
import { getConfigValue, setConfigValue } from "./config.js";

describe("CLI config", () => {
  it("rejects prototype-polluting path segments", () => {
    expect(() => setConfigValue("__proto__.polluted", "true", {})).toThrow(/prototype keys/);
    expect(() => getConfigValue("constructor.prototype.polluted", {})).toThrow(/prototype keys/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
