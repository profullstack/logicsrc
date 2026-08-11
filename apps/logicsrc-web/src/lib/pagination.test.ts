import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseBoundedIntegerParam } from "./pagination.ts";

describe("pagination parameters", () => {
  test("uses the fallback for negative, fractional, and malformed values", () => {
    for (const value of [null, "-1", "1.5", "invalid", "9007199254740992"]) {
      assert.equal(parseBoundedIntegerParam(value, 50, 1, 200), 50);
    }
  });

  test("accepts valid values and caps the upper bound", () => {
    assert.equal(parseBoundedIntegerParam(" 1 ", 50, 1, 200), 1);
    assert.equal(parseBoundedIntegerParam("500", 50, 1, 200), 200);
    assert.equal(parseBoundedIntegerParam("0", 0, 0, Number.MAX_SAFE_INTEGER), 0);
  });
});
