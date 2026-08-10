import { afterEach, describe, expect, it, vi } from "vitest";
import { httpAdapter } from "./http.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("http adapter response limits", () => {
  it("enforces the byte limit for multibyte responses without a content-length header", async () => {
    const content = "é".repeat(3 * 1024 * 1024);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(content)));

    await expect(
      httpAdapter.load("https://example.com/context.md", {
        dir: process.cwd(),
        offline: false,
        config: {}
      })
    ).rejects.toThrow(/response exceeds the 5242880 byte limit/);
  });

  it("decodes responses within the byte limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("café")));

    await expect(
      httpAdapter.load("https://example.com/context.md", {
        dir: process.cwd(),
        offline: false,
        config: {}
      })
    ).resolves.toMatchObject({ content: "café", trust: "untrusted" });
  });
});
