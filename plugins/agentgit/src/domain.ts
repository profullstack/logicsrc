// Domain types for AgentGit, mirroring the LogicSRC repo and pull-request
// schemas (packages/schemas/schemas/logicsrc-{repo,pull-request}.schema.json).

export type MemberRole = "maintainer" | "contributor" | "reviewer" | "reader";
export type MergeMethod = "merge" | "squash" | "rebase";
export type Visibility = "members_only" | "private" | "public";
export type ReviewDecision = "approve" | "request_changes" | "comment";
export type CheckStatus = "pending" | "passing" | "failing";
export type PullRequestStatus =
  | "draft"
  | "open"
  | "approved"
  | "changes_requested"
  | "merged"
  | "closed";

export interface MergePolicy {
  min_reviews: number;
  require_passing_checks: boolean;
  reviewer_reputation_min: number;
  escrow_required: boolean;
  allow_agent_merge: boolean;
  allowed_merge_methods: MergeMethod[];
}

export const DEFAULT_MERGE_POLICY: MergePolicy = {
  min_reviews: 1,
  require_passing_checks: true,
  reviewer_reputation_min: 0,
  escrow_required: false,
  allow_agent_merge: true,
  allowed_merge_methods: ["squash"]
};

export interface RepoMember {
  did: string;
  role: MemberRole;
}

export interface Repo {
  type: "logicsrc.repo";
  version: string;
  name: string;
  slug: string;
  description?: string;
  owner_did: string;
  board?: string;
  visibility: Visibility;
  default_branch: string;
  backend: {
    provider: "forgejo" | "github" | "git";
    url: string;
    external_id?: string;
  };
  members: RepoMember[];
  merge_policy: MergePolicy;
  created_at?: string;
}

export interface Review {
  reviewer_did: string;
  decision: ReviewDecision;
  reputation?: number;
  summary?: string;
  created_at?: string;
}

export interface Check {
  name: string;
  status: CheckStatus;
  url?: string;
}

export interface PullRequest {
  type: "logicsrc.pull_request";
  version: string;
  repo: string;
  number?: number;
  title: string;
  description?: string;
  author_did: string;
  source_branch: string;
  target_branch: string;
  head_sha?: string;
  task?: string;
  status: PullRequestStatus;
  checks: Check[];
  reviews: Review[];
  merge?: {
    method: MergeMethod;
    merged_by_did: string;
    merge_sha?: string;
    policy_satisfied: boolean;
    merged_at?: string;
  };
  created_at?: string;
  updated_at?: string;
}
