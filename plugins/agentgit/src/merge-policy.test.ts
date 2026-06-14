import { describe, expect, it } from "vitest";
import { DEFAULT_MERGE_POLICY, type MergePolicy, type PullRequest } from "./domain.js";
import { evaluateMergePolicy } from "./merge-policy.js";

const basePr: Pick<PullRequest, "status" | "reviews" | "checks"> = {
  status: "open",
  reviews: [{ reviewer_did: "carol.example", decision: "approve", reputation: 10 }],
  checks: [{ name: "ci", status: "passing" }]
};

const human = { did: "alice.example", isAgent: false };
const agent = { did: "bot.example", isAgent: true };

describe("evaluateMergePolicy", () => {
  it("passes a clean PR with the default policy", () => {
    const result = evaluateMergePolicy({ policy: DEFAULT_MERGE_POLICY, pr: basePr, method: "squash", actor: human });
    expect(result).toEqual({ satisfied: true, reasons: [] });
  });

  it("blocks when there are not enough approvals", () => {
    const result = evaluateMergePolicy({
      policy: DEFAULT_MERGE_POLICY,
      pr: { ...basePr, reviews: [] },
      method: "squash",
      actor: human
    });
    expect(result.satisfied).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/approving review/);
  });

  it("ignores approvals below the reputation floor", () => {
    const policy: MergePolicy = { ...DEFAULT_MERGE_POLICY, reviewer_reputation_min: 50 };
    const result = evaluateMergePolicy({ policy, pr: basePr, method: "squash", actor: human });
    expect(result.satisfied).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/reputation >= 50/);
  });

  it("blocks when changes are requested", () => {
    const result = evaluateMergePolicy({
      policy: DEFAULT_MERGE_POLICY,
      pr: { ...basePr, reviews: [{ reviewer_did: "carol.example", decision: "request_changes" }] },
      method: "squash",
      actor: human
    });
    expect(result.satisfied).toBe(false);
    expect(result.reasons).toContain("changes requested by a reviewer");
  });

  it("blocks on non-passing checks when required", () => {
    const result = evaluateMergePolicy({
      policy: DEFAULT_MERGE_POLICY,
      pr: { ...basePr, checks: [{ name: "ci", status: "failing" }] },
      method: "squash",
      actor: human
    });
    expect(result.satisfied).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/checks not passing/);
  });

  it("requires a funded escrow when escrow_required", () => {
    const policy: MergePolicy = { ...DEFAULT_MERGE_POLICY, escrow_required: true };
    expect(evaluateMergePolicy({ policy, pr: basePr, method: "squash", actor: human }).satisfied).toBe(false);
    expect(evaluateMergePolicy({ policy, pr: basePr, method: "squash", actor: human, escrowFunded: true }).satisfied).toBe(true);
  });

  it("rejects disallowed merge methods", () => {
    const result = evaluateMergePolicy({ policy: DEFAULT_MERGE_POLICY, pr: basePr, method: "merge", actor: human });
    expect(result.satisfied).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/not allowed/);
  });

  it("blocks agent merges when allow_agent_merge is false", () => {
    const policy: MergePolicy = { ...DEFAULT_MERGE_POLICY, allow_agent_merge: false };
    expect(evaluateMergePolicy({ policy, pr: basePr, method: "squash", actor: agent }).satisfied).toBe(false);
    expect(evaluateMergePolicy({ policy, pr: basePr, method: "squash", actor: human }).satisfied).toBe(true);
  });

  it("never satisfies an already merged PR", () => {
    const result = evaluateMergePolicy({
      policy: DEFAULT_MERGE_POLICY,
      pr: { ...basePr, status: "merged" },
      method: "squash",
      actor: human
    });
    expect(result.satisfied).toBe(false);
    expect(result.reasons).toContain("pull request is merged");
  });
});
