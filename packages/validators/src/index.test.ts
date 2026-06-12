import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDocument, validate } from "./index.js";

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

  it("validates the AgentAd ad fixture", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const file = resolve(testDir, "../../schemas/fixtures/agentad-ad.yaml");
    const data = parseDocument(readFileSync(file, "utf8"), file);

    expect(validate("agentad-ad", data).ok).toBe(true);
  });

  it("rejects an AgentAd ad that is not disclosed as sponsored", () => {
    const result = validate("agentad-ad", {
      type: "agentad.ad",
      version: "0.1",
      id: "undisclosed",
      advertiser_did: "acme.coinpay",
      format: "text",
      title: "Buy now",
      url: "https://example.com",
      disclosure: { sponsored: false, label: "Sponsored" }
    });

    expect(result.ok).toBe(false);
  });
});
