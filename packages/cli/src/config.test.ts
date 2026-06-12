import { describe, expect, it } from "vitest";
import { getConfigValue, setConfigValue } from "./config.js";

describe("CLI config", () => {
  it("rejects empty config path segments", () => {
    expect(() => getConfigValue("waiting..arcade", {})).toThrow(/empty segments/);
    expect(() => setConfigValue("waiting..arcade", "true", {})).toThrow(/empty segments/);
  });
});
