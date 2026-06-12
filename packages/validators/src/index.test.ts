import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertSchemaKind, parseDocument, schemas, validate } from "./index.js";
import { isSchemaKind } from "./schemas.js";

describe("LogicSRC validators", () => {
  it("validates the task fixture", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const file = resolve(testDir, "../../schemas/fixtures/task.yaml");
    const data = parseDocument(readFileSync(file, "utf8"), file);

    expect(validate("task", data).ok).toBe(true);
  });

  it("rejects a task without a DID", () => {
    const result = validate("task", {
      type: "logicsrc.task",
      version: "0.1",
      title: "Missing DID",
      description: "This should fail.",
      board: "/qa",
      status: "open"
    });

    expect(result.ok).toBe(false);
  });
});

describe("isSchemaKind / assertSchemaKind prototype safety", () => {
  it("rejects inherited Object.prototype keys", () => {
    for (const key of ["toString", "constructor", "valueOf", "hasOwnProperty"]) {
      expect(isSchemaKind(key)).toBe(false);
      expect(() => assertSchemaKind(key)).toThrow(/Unknown schema kind/);
    }
  });

  it("still accepts every real schema kind", () => {
    for (const key of Object.keys(schemas)) {
      expect(isSchemaKind(key)).toBe(true);
      expect(assertSchemaKind(key)).toBe(key);
    }
  });
});
