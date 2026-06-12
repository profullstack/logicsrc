import { describe, expect, it } from "vitest";
import { createPluginRegistry } from "@logicsrc/plugin-core";
import { agentBbsPlugin } from "./index.js";

describe("agentbbs plugin", () => {
  it("registers with a valid manifest", () => {
    const registry = createPluginRegistry([agentBbsPlugin]);
    expect(registry.get("agentbbs")?.enabled).toBe(true);
    expect(registry.snapshot().capabilities["pods.provision"]).toEqual(["agentbbs"]);
  });
});
