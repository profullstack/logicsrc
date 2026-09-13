import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { selectNpm } = require("../../../scripts/install-npm.cjs") as {
  selectNpm: (nodeVersion: string, packageManager: string) => string | null;
};

describe("installer npm compatibility", () => {
  it.each(["18.20.8", "20.16.0", "21.7.3", "22.8.0"])("preserves the host npm on Node %s", (version) => {
    expect(selectNpm(version, "npm@11.11.0")).toBeNull();
  });

  it.each(["20.17.0", "20.19.0", "22.9.0", "23.0.0", "24.18.1", "25.0.0"])(
    "selects the tested npm on Node %s", (version) => {
      expect(selectNpm(version, "npm@11.11.0")).toBe("npm@11.11.0");
    }
  );

  it("does not assume compatibility for a different package manager or npm major", () => {
    expect(selectNpm("24.18.1", "pnpm@11.11.0")).toBeNull();
    expect(selectNpm("24.18.1", "npm@12.0.0")).toBeNull();
    expect(selectNpm("unknown", "npm@11.11.0")).toBeNull();
  });
});
