import { describe, expect, it } from "vitest";
import { defaultPluginRegistry } from "./registry.js";

describe("CLI registry", () => {
  it("loads default v1 plugins", () => {
    const ids = defaultPluginRegistry().snapshot().plugins.map((plugin: { id: string }) => plugin.id);

    expect(ids).toContain("coinpay");
    expect(ids).toContain("ugig");
    expect(ids).toContain("sh1pt");
  });
});
