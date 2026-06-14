import type { MergeMethod, MergePolicy, PullRequest } from "./domain.js";

export interface MergeEvaluationInput {
  policy: MergePolicy;
  pr: Pick<PullRequest, "status" | "reviews" | "checks">;
  method: MergeMethod;
  actor: { did: string; isAgent: boolean };
  /** Whether a funded escrow exists for the linked task; resolved by the caller. */
  escrowFunded?: boolean;
}

export interface MergeEvaluation {
  satisfied: boolean;
  reasons: string[];
}

/**
 * Pure evaluation of a repo's merge policy against a pull request. Returns
 * whether the PR may be merged and, if not, every blocking reason. The actual
 * merge (pr.merge) refuses unless `satisfied` is true.
 */
export function evaluateMergePolicy(input: MergeEvaluationInput): MergeEvaluation {
  const { policy, pr, method, actor, escrowFunded } = input;
  const reasons: string[] = [];

  if (pr.status === "merged" || pr.status === "closed") {
    reasons.push(`pull request is ${pr.status}`);
    return { satisfied: false, reasons };
  }
  if (pr.status === "draft") {
    reasons.push("pull request is a draft");
  }

  if (pr.reviews.some((review) => review.decision === "request_changes")) {
    reasons.push("changes requested by a reviewer");
  }

  const qualifyingApprovals = pr.reviews.filter(
    (review) => review.decision === "approve" && (review.reputation ?? 0) >= policy.reviewer_reputation_min
  ).length;
  if (qualifyingApprovals < policy.min_reviews) {
    reasons.push(
      `needs ${policy.min_reviews} approving review(s) at reputation >= ${policy.reviewer_reputation_min}, has ${qualifyingApprovals}`
    );
  }

  if (policy.require_passing_checks) {
    const notPassing = pr.checks.filter((check) => check.status !== "passing");
    if (notPassing.length > 0) {
      reasons.push(`checks not passing: ${notPassing.map((check) => `${check.name}(${check.status})`).join(", ")}`);
    }
  }

  if (policy.escrow_required && escrowFunded !== true) {
    reasons.push("escrow required but not funded");
  }

  if (!policy.allowed_merge_methods.includes(method)) {
    reasons.push(`merge method "${method}" not allowed (allowed: ${policy.allowed_merge_methods.join(", ")})`);
  }

  if (actor.isAgent && !policy.allow_agent_merge) {
    reasons.push("agent merges are disabled for this repo");
  }

  return { satisfied: reasons.length === 0, reasons };
}
