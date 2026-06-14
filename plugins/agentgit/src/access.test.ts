import { describe, expect, it } from "vitest";
import { DEFAULT_MERGE_POLICY, type Repo } from "./domain.js";
import { gateAccess } from "./access.js";

function repo(overrides: Partial<Repo> = {}): Repo {
  return {
    type: "logicsrc.repo",
    version: "1.0",
    name: "Demo",
    slug: "demo",
    owner_did: "owner.example",
    visibility: "members_only",
    default_branch: "main",
    backend: { provider: "forgejo", url: "https://git.profullstack.com" },
    members: [
      { did: "reader.example", role: "reader" },
      { did: "contributor.example", role: "contributor" },
      { did: "maintainer.example", role: "maintainer" }
    ],
    merge_policy: DEFAULT_MERGE_POLICY,
    ...overrides
  };
}

describe("gateAccess", () => {
  it("treats the owner as an implicit maintainer", () => {
    expect(gateAccess(repo(), "owner.example", "merge")).toEqual({ allowed: true, role: "maintainer" });
  });

  it("denies anonymous access to members_only repos", () => {
    const result = gateAccess(repo(), undefined, "read");
    expect(result.allowed).toBe(false);
  });

  it("allows anonymous read on public repos only", () => {
    expect(gateAccess(repo({ visibility: "public" }), undefined, "read").allowed).toBe(true);
    expect(gateAccess(repo({ visibility: "public" }), undefined, "write").allowed).toBe(false);
  });

  it("denies non-members", () => {
    const result = gateAccess(repo(), "stranger.example", "read");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not a member/);
  });

  it("enforces role capabilities", () => {
    expect(gateAccess(repo(), "reader.example", "write").allowed).toBe(false);
    expect(gateAccess(repo(), "contributor.example", "write").allowed).toBe(true);
    expect(gateAccess(repo(), "contributor.example", "merge").allowed).toBe(false);
    expect(gateAccess(repo(), "maintainer.example", "merge").allowed).toBe(true);
  });
});
