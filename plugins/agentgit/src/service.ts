import { gateAccess, type Action } from "./access.js";
import type { MergeMethod, PullRequest, Repo, Review } from "./domain.js";
import { evaluateMergePolicy, type MergeEvaluation } from "./merge-policy.js";
import type { ForgeAdapter, ForgePullRequest, ForgeRepo, ForgeUser } from "./forge/adapter.js";

export class AccessDeniedError extends Error {
  constructor(reason: string) {
    super(`access denied: ${reason}`);
    this.name = "AccessDeniedError";
  }
}

export class MergePolicyError extends Error {
  constructor(readonly reasons: string[]) {
    super(`merge policy not satisfied: ${reasons.join("; ")}`);
    this.name = "MergePolicyError";
  }
}

export interface ProvisionMemberInput {
  did: string;
  email: string;
  password: string;
  fullName?: string;
}

export interface AgentGitServiceOptions {
  adapter: ForgeAdapter;
  /** Resolve a DID to a forge login. Default: segment before the first dot. */
  didToLogin?: (did: string) => string;
  /** Resolve a forge login back to a DID. Default: append the operator domain. */
  loginToDid?: (login: string) => string;
  /** Reputation lookup for a reviewer DID. Default: 0. */
  reputationOf?: (did: string) => number | Promise<number>;
  /** Whether a DID belongs to an agent (vs. a human). Default: false. */
  isAgentDid?: (did: string) => boolean | Promise<boolean>;
  /** Whether the PR's linked task has a funded escrow. Default: false. */
  escrowFundedFor?: (pr: PullRequest) => boolean | Promise<boolean>;
}

const defaultDidToLogin = (did: string) => did.split(".")[0];

/**
 * AgentGit application service. Ties the membership gate and merge-policy engine
 * to a backend ForgeAdapter so every operation is DID-gated and every merge is
 * policy-gated. Forge-specific code lives only in the adapter.
 */
export class AgentGitService {
  private readonly adapter: ForgeAdapter;
  private readonly didToLogin: (did: string) => string;
  private readonly loginToDid: (login: string) => string;
  private readonly reputationOf: (did: string) => number | Promise<number>;
  private readonly isAgentDid: (did: string) => boolean | Promise<boolean>;
  private readonly escrowFundedFor: (pr: PullRequest) => boolean | Promise<boolean>;

  constructor(options: AgentGitServiceOptions) {
    this.adapter = options.adapter;
    this.didToLogin = options.didToLogin ?? defaultDidToLogin;
    this.loginToDid = options.loginToDid ?? ((login) => login);
    this.reputationOf = options.reputationOf ?? (() => 0);
    this.isAgentDid = options.isAgentDid ?? (() => false);
    this.escrowFundedFor = options.escrowFundedFor ?? (() => false);
  }

  private coordinates(repo: Repo): { owner: string; name: string } {
    if (repo.slug.includes("/")) {
      const [owner, ...rest] = repo.slug.split("/");
      return { owner, name: rest.join("/") };
    }
    return { owner: this.didToLogin(repo.owner_did), name: repo.slug };
  }

  private gate(repo: Repo, callerDid: string | undefined, action: Action): void {
    const result = gateAccess(repo, callerDid, action);
    if (!result.allowed) {
      throw new AccessDeniedError(result.reason ?? "not permitted");
    }
  }

  /** AgentBBS provisioning hook: ensure a member has a backend git account. */
  async provisionMember(input: ProvisionMemberInput): Promise<ForgeUser> {
    return this.adapter.ensureUser({
      username: this.didToLogin(input.did),
      email: input.email,
      password: input.password,
      fullName: input.fullName
    });
  }

  async createRepo(repo: Repo, callerDid: string | undefined): Promise<ForgeRepo> {
    this.gate(repo, callerDid, "admin");
    const { owner, name } = this.coordinates(repo);
    return this.adapter.createRepo({
      owner,
      name,
      description: repo.description,
      private: repo.visibility !== "public",
      defaultBranch: repo.default_branch
    });
  }

  async listRepos(repo: Repo, callerDid: string | undefined): Promise<ForgeRepo[]> {
    this.gate(repo, callerDid, "read");
    return this.adapter.listRepos(this.coordinates(repo).owner);
  }

  async openPullRequest(
    repo: Repo,
    input: { title: string; body?: string; sourceBranch: string; targetBranch?: string; task?: string },
    callerDid: string
  ): Promise<PullRequest> {
    this.gate(repo, callerDid, "write");
    const { owner, name } = this.coordinates(repo);
    const fpr = await this.adapter.openPullRequest({
      owner,
      repo: name,
      title: input.title,
      body: input.body,
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch ?? repo.default_branch
    });
    return this.toDomainPullRequest(repo, fpr, callerDid, input.task);
  }

  async reviewPullRequest(
    repo: Repo,
    number: number,
    decision: Review["decision"],
    callerDid: string,
    body?: string
  ): Promise<PullRequest> {
    this.gate(repo, callerDid, "review");
    const { owner, name } = this.coordinates(repo);
    await this.adapter.addReview({ owner, repo: name, number, decision, body });
    const fpr = await this.adapter.getPullRequest(owner, name, number);
    return this.toDomainPullRequest(repo, fpr, callerDid);
  }

  async evaluateMerge(
    repo: Repo,
    number: number,
    method: MergeMethod,
    callerDid: string
  ): Promise<{ pr: PullRequest; evaluation: MergeEvaluation }> {
    this.gate(repo, callerDid, "merge");
    const { owner, name } = this.coordinates(repo);
    const fpr = await this.adapter.getPullRequest(owner, name, number);
    const pr = await this.toDomainPullRequest(repo, fpr, callerDid);
    const evaluation = evaluateMergePolicy({
      policy: repo.merge_policy,
      pr,
      method,
      actor: { did: callerDid, isAgent: await this.isAgentDid(callerDid) },
      escrowFunded: await this.escrowFundedFor(pr)
    });
    return { pr, evaluation };
  }

  async mergePullRequest(repo: Repo, number: number, method: MergeMethod, callerDid: string): Promise<PullRequest> {
    const { pr, evaluation } = await this.evaluateMerge(repo, number, method, callerDid);
    if (!evaluation.satisfied) {
      throw new MergePolicyError(evaluation.reasons);
    }
    const { owner, name } = this.coordinates(repo);
    const result = await this.adapter.mergePullRequest({ owner, repo: name, number, method });
    return {
      ...pr,
      status: "merged",
      merge: {
        method,
        merged_by_did: callerDid,
        merge_sha: result.mergeSha,
        policy_satisfied: true,
        merged_at: new Date().toISOString()
      }
    };
  }

  private async toDomainPullRequest(
    repo: Repo,
    fpr: ForgePullRequest,
    fallbackAuthorDid: string,
    task?: string
  ): Promise<PullRequest> {
    const reviews: Review[] = await Promise.all(
      fpr.reviews.map(async (review) => {
        const reviewerDid = this.loginToDid(review.reviewerLogin);
        return {
          reviewer_did: reviewerDid,
          decision: review.decision,
          reputation: await this.reputationOf(reviewerDid),
          summary: review.body,
          created_at: review.submittedAt
        } satisfies Review;
      })
    );

    return {
      type: "logicsrc.pull_request",
      version: "1.0",
      repo: repo.slug,
      number: fpr.number,
      title: fpr.title,
      description: fpr.body,
      author_did: fpr.authorLogin ? this.loginToDid(fpr.authorLogin) : fallbackAuthorDid,
      source_branch: fpr.sourceBranch,
      target_branch: fpr.targetBranch,
      head_sha: fpr.headSha || undefined,
      task,
      status: deriveStatus(fpr, reviews),
      checks: fpr.checks,
      reviews,
      created_at: fpr.createdAt,
      updated_at: fpr.updatedAt
    };
  }
}

function deriveStatus(fpr: ForgePullRequest, reviews: Review[]): PullRequest["status"] {
  if (fpr.merged) {
    return "merged";
  }
  if (fpr.state === "closed") {
    return "closed";
  }
  if (reviews.some((review) => review.decision === "request_changes")) {
    return "changes_requested";
  }
  if (reviews.some((review) => review.decision === "approve")) {
    return "approved";
  }
  return "open";
}
