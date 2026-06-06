import { describe, expect, it } from "vitest";
import { createPluginRegistry } from "./index.js";
import type { PluginDefinition } from "./types.js";

const examplePlugin: PluginDefinition = {
  manifest: {
    id: "example",
    name: "Example",
    version: "1.0.0",
    type: ["testing"],
    default: false,
    capabilities: ["tests.run"],
    commands: ["test"],
    env: ["EXAMPLE_TOKEN"]
  }
};

describe("PluginRegistry", () => {
  it("indexes enabled plugins by capability", () => {
    const registry = createPluginRegistry([examplePlugin]);

    expect(registry.byCapability("tests.run")).toHaveLength(1);
    expect(registry.snapshot().capabilities["tests.run"]).toEqual(["example"]);
  });

  it("honors disabled config", () => {
    const registry = createPluginRegistry([examplePlugin], {
      example: { enabled: false }
    });

    expect(registry.enabled()).toHaveLength(0);
  });
});
