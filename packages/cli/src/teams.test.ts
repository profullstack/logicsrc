import { describe, expect, it } from "vitest";
import { splitVaultName, vaultName, VAULT_SEP } from "./teams.js";

// A vault is addressed as <project> <env> on the command line and stored as a
// single name server-side. Two things have to hold: the join must survive the
// server's own validation, and it must split back unambiguously — a wrong split
// would point a push at the wrong vault.
//
// The server slugifies vault names through /^[a-z0-9][a-z0-9-]{0,62}$/. The
// first cut of this used "/" as the separator, which that regex rejects, so
// every push failed with a 422 the unit tests never saw. SERVER_SLUG below is
// that regex, asserted directly, so the separator can't drift out of the
// allowed character set again without a test failing.
const SERVER_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

describe("vaultName", () => {
  it("joins project and env with the separator", () => {
    expect(vaultName("web", "prod")).toBe(`web${VAULT_SEP}prod`);
  });

  it("produces a name the server will accept", () => {
    expect(vaultName("web", "prod")).toMatch(SERVER_SLUG);
    expect(vaultName("food-delivery-multivendor-enatega-multivendor-backend", "prod")).toMatch(SERVER_SLUG);
  });

  it("never uses a separator the server rejects", () => {
    // The regression that shipped: "/" is not in [a-z0-9-].
    expect(VAULT_SEP).toMatch(/^[a-z0-9-]+$/);
    expect(vaultName("web", "prod")).not.toContain("/");
  });

  it("keeps distinct envs of one project apart", () => {
    expect(vaultName("web", "staging")).not.toBe(vaultName("web", "prod"));
  });

  it("keeps distinct projects in one env apart", () => {
    expect(vaultName("api", "prod")).not.toBe(vaultName("web", "prod"));
  });

  it("keeps a dashed project distinct from a dashed env", () => {
    // "a-b" + "c" and "a" + "b-c" must not collide — the reason the separator
    // is a double dash rather than a single one.
    expect(vaultName("a-b", "c")).not.toBe(vaultName("a", "b-c"));
  });

  it("rejects the separator inside either half", () => {
    expect(() => vaultName(`web${VAULT_SEP}api`, "prod")).toThrow(/cannot contain/);
    expect(() => vaultName("web", `prod${VAULT_SEP}eu`)).toThrow(/cannot contain/);
  });

  it("rejects characters the server would refuse", () => {
    expect(() => vaultName("web/api", "prod")).toThrow(/not a valid vault name/);
    expect(() => vaultName("Web", "prod")).toThrow(/not a valid vault name/);
    expect(() => vaultName("web_api", "prod")).toThrow(/not a valid vault name/);
    expect(() => vaultName("-web", "prod")).toThrow(/not a valid vault name/);
  });

  it("rejects a combined name past the server's 63-character limit", () => {
    expect(() => vaultName("a".repeat(60), "prod")).toThrow(/at most 63/);
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

  it("round-trips halves that contain single dashes", () => {
    expect(splitVaultName(vaultName("playground-encryptfiles-web", "prod")))
      .toEqual({ project: "playground-encryptfiles-web", env: "prod" });
  });

  it("returns null for legacy single-word names", () => {
    // Vaults created before the split are still listable; they just don't
    // decompose, so `teams vaults` shows the raw name instead of guessing.
    expect(splitVaultName("prod")).toBeNull();
    expect(splitVaultName("web-prod")).toBeNull();
  });

  it("returns null rather than guessing at an ambiguous name", () => {
    expect(splitVaultName(`a${VAULT_SEP}b${VAULT_SEP}c`)).toBeNull();
    expect(splitVaultName(`${VAULT_SEP}prod`)).toBeNull();
    expect(splitVaultName(`web${VAULT_SEP}`)).toBeNull();
  });
});
