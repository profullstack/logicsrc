import type { CheckStatus, MergeMethod, ReviewDecision } from "../domain.js";

// Forge-shaped types: what a backend forge actually returns, before mapping to
// LogicSRC domain objects (reviewers are forge logins, not DIDs). The service
// layer resolves logins -> DIDs and reputation.

export interface ForgeRepo {
  owner: string;
  name: string;
  defaultBranch: string;
  cloneUrl: string;
  htmlUrl: string;
  private: boolean;
  archived: boolean;
}

export interface ForgeBranch {
  name: string;
  commitSha: string;
}

export interface ForgeReview {
  reviewerLogin: string;
  decision: ReviewDecision;
  body?: string;
  submittedAt?: string;
}

export interface ForgeCheck {
  name: string;
  status: CheckStatus;
  url?: string;
}

export interface ForgePullRequest {
  number: number;
  title: string;
  body?: string;
  authorLogin: string;
  sourceBranch: string;
  targetBranch: string;
  headSha: string;
  state: "open" | "closed";
  merged: boolean;
  reviews: ForgeReview[];
  checks: ForgeCheck[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateRepoInput {
  owner: string;
  name: string;
  description?: string;
  private: boolean;
  defaultBranch?: string;
}

export interface CreateBranchInput {
  owner: string;
  repo: string;
  newBranch: string;
  fromBranch: string;
}

export interface OpenPullRequestInput {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  sourceBranch: string;
  targetBranch: string;
}

export interface AddReviewInput {
  owner: string;
  repo: string;
  number: number;
  decision: ReviewDecision;
  body?: string;
}

export interface MergePullRequestInput {
  owner: string;
  repo: string;
  number: number;
  method: MergeMethod;
}

export interface MergeResult {
  merged: boolean;
  mergeSha?: string;
}

export interface EnsureUserInput {
  username: string;
  email: string;
  /** Initial password; accounts are provisioned with must-change-password. */
  password: string;
  fullName?: string;
}

export interface ForgeUser {
  username: string;
  email: string;
  created: boolean;
}

/**
 * Backend-forge contract. The only forge-specific surface in AgentGit —
 * swapping Forgejo for GitHub or bare git is an implementation of this
 * interface, not a change to the AgentGit contract.
 */
export interface ForgeAdapter {
  ensureUser(input: EnsureUserInput): Promise<ForgeUser>;
  createRepo(input: CreateRepoInput): Promise<ForgeRepo>;
  getRepo(owner: string, repo: string): Promise<ForgeRepo>;
  listRepos(owner: string): Promise<ForgeRepo[]>;
  archiveRepo(owner: string, repo: string): Promise<ForgeRepo>;
  createBranch(input: CreateBranchInput): Promise<ForgeBranch>;
  listBranches(owner: string, repo: string): Promise<ForgeBranch[]>;
  openPullRequest(input: OpenPullRequestInput): Promise<ForgePullRequest>;
  getPullRequest(owner: string, repo: string, number: number): Promise<ForgePullRequest>;
  listPullRequests(owner: string, repo: string, state?: "open" | "closed" | "all"): Promise<ForgePullRequest[]>;
  addReview(input: AddReviewInput): Promise<ForgeReview>;
  mergePullRequest(input: MergePullRequestInput): Promise<MergeResult>;
  closePullRequest(owner: string, repo: string, number: number): Promise<ForgePullRequest>;
}
