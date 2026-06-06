import { describe, expect, it } from "vitest";
import { defaultPluginRegistry } from "./registry.js";

describe("CLI registry", () => {
  it("loads open standards plugins only", () => {
    const ids = defaultPluginRegistry().snapshot().plugins.map((plugin: { id: string }) => plugin.id);

    expect(ids).toContain("coinpay");
    expect(ids).toContain("ugig");
    expect(ids).not.toContain("sh1pt");
  });
});
