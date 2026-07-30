import { describe, expect, it } from "vitest";
import { splitVaultName, vaultName } from "./teams.js";

// A vault is addressed as <project> <env> on the command line and stored as a
// single `project/env` name server-side. The join is the only thing keeping
// those two halves apart, so it has to reject anything that would make the
// name ambiguous — a wrong split would point a push at the wrong vault.

describe("vaultName", () => {
  it("joins project and env with a slash", () => {
    expect(vaultName("web", "prod")).toBe("web/prod");
  });

  it("keeps distinct envs of one project apart", () => {
    expect(vaultName("web", "staging")).not.toBe(vaultName("web", "prod"));
  });

  it("keeps distinct projects in one env apart", () => {
    expect(vaultName("api", "prod")).not.toBe(vaultName("web", "prod"));
  });

  it("rejects a slash in either half", () => {
    expect(() => vaultName("web/api", "prod")).toThrow(/cannot contain/);
    expect(() => vaultName("web", "prod/eu")).toThrow(/cannot contain/);
  });

  it("rejects empty or blank halves", () => {
    expect(() => vaultName("", "prod")).toThrow(/Missing project/);
    expect(() => vaultName("web", "")).toThrow(/Missing env/);
    expect(() => vaultName("   ", "prod")).toThrow(/Missing project/);
  });
});

describe("splitVaultName", () => {
  it("round-trips a name built by vaultName", () => {
    expect(splitVaultName(vaultName("web", "prod"))).toEqual({ project: "web", env: "prod" });
  });

  it("returns null for legacy single-word names", () => {
    // Vaults created before the split are still listable; they just don't
    // decompose, so `teams vaults` shows the raw name instead of guessing.
    expect(splitVaultName("prod")).toBeNull();
  });

  it("returns null rather than guessing at an ambiguous name", () => {
    expect(splitVaultName("a/b/c")).toBeNull();
    expect(splitVaultName("/prod")).toBeNull();
    expect(splitVaultName("web/")).toBeNull();
  });
});
