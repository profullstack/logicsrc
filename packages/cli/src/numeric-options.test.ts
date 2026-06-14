import { describe, expect, it } from "vitest";
import { parsePositiveInteger } from "./numeric-options.js";

describe("parsePositiveInteger", () => {
  it.each([
    ["1", 1],
    ["25", 25],
    ["100", 100]
  ])("parses %s", (value, expected) => {
    expect(parsePositiveInteger(value)).toBe(expected);
  });

  it.each(["", " ", "nope", "0", "-1", "1.5", "Infinity", "NaN"])(
    "rejects invalid input: %s",
    (value) => {
      expect(() => parsePositiveInteger(value)).toThrow("must be a positive integer");
    }
  );
});
