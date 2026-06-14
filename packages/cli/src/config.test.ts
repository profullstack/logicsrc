import { describe, expect, it } from "vitest";
import { getConfigValue, mergeConfig, setConfigValue, type JsonObject } from "./config.js";

describe("config helpers", () => {
  it("sets and reads nested own properties", () => {
    const config: JsonObject = {};

    setConfigValue("waiting.arcade.defaultGame", "snake", config);

    expect(getConfigValue("waiting.arcade.defaultGame", config)).toBe("snake");
  });

  it.each(["__proto__", "prototype", "constructor"])(
    "rejects unsafe path key: %s",
    (key) => {
      const marker = "logicsrcPrototypePollution";
      const config: JsonObject = {};

      expect(() => setConfigValue(`${key}.${marker}`, "true", config)).toThrow(
        `Unsafe config key: ${key}`
      );
      expect(Object.hasOwn(Object.prototype, marker)).toBe(false);
    }
  );

  it("rejects unsafe keys while merging parsed config", () => {
    const override = JSON.parse(
      '{"__proto__":{"logicsrcPrototypePollution":true}}'
    ) as JsonObject;

    expect(() => mergeConfig({}, override)).toThrow("Unsafe config key: __proto__");
    expect(Object.hasOwn(Object.prototype, "logicsrcPrototypePollution")).toBe(false);
  });

  it("does not read inherited config values", () => {
    const config = Object.create({ inherited: "secret" }) as JsonObject;

    expect(getConfigValue("inherited", config)).toBeUndefined();
  });
});
