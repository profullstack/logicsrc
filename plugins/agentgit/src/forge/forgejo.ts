import type { CheckStatus, MergeMethod, ReviewDecision } from "../domain.js";
import type {
  AddReviewInput,
  CreateBranchInput,
  CreateRepoInput,
  EnsureUserInput,
  ForgeAdapter,
  ForgeBranch,
  ForgePullRequest,
  ForgeRepo,
  ForgeReview,
  ForgeUser,
  MergePullRequestInput,
  MergeResult,
  OpenPullRequestInput
} from "./adapter.js";

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface ForgejoAdapterOptions {
  /** Base URL of the Forgejo instance, e.g. https://git.profullstack.com */
  baseUrl: string;
  /** Admin/personal access token used for server-side operations. */
  token: string;
  fetch?: FetchLike;
}

export class ForgejoApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    body: string
  ) {
    super(`Forgejo ${method} ${path} -> ${status}: ${body.slice(0, 300)}`);
    this.name = "ForgejoApiError";
  }
}

const REVIEW_EVENT: Record<ReviewDecision, string> = {
  approve: "APPROVED",
  request_changes: "REQUEST_CHANGES",
  comment: "COMMENT"
};

const MERGE_DO: Record<MergeMethod, string> = {
  merge: "merge",
  squash: "squash",
  rebase: "rebase"
};

/** Maps a Forgejo combined-status state to our check status vocabulary. */
function mapCheckStatus(state: string): CheckStatus {
  switch (state) {
    case "success":
      return "passing";
    case "pending":
      return "pending";
    default:
      // failure, error, warning
      return "failing";
  }
}

function mapReviewDecision(state: string): ReviewDecision {
  switch (state) {
    case "APPROVED":
      return "approve";
    case "REQUEST_CHANGES":
      return "request_changes";
    default:
      return "comment";
  }
}

/** Forgejo / Gitea REST API (v1) implementation of the ForgeAdapter. */
export class ForgejoAdapter implements ForgeAdapter {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: ForgejoAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    const injected = options.fetch;
    if (injected) {
      this.fetchImpl = injected;
    } else if (typeof globalThis.fetch === "function") {
      this.fetchImpl = globalThis.fetch.bind(globalThis) as unknown as FetchLike;
    } else {
      throw new Error("No fetch implementation available; pass options.fetch");
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `token ${this.token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const text = await response.text();
    if (!response.ok) {
      throw new ForgejoApiError(response.status, method, path, text);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private mapRepo(raw: Record<string, unknown>): ForgeRepo {
    const owner = (raw.owner as Record<string, unknown> | undefined)?.login as string;
    return {
      owner,
      name: raw.name as string,
      defaultBranch: (raw.default_branch as string) ?? "main",
      cloneUrl: raw.clone_url as string,
      htmlUrl: raw.html_url as string,
      private: Boolean(raw.private),
      archived: Boolean(raw.archived)
    };
  }

  async ensureUser(input: EnsureUserInput): Promise<ForgeUser> {
    try {
      await this.request<unknown>("GET", `/users/${encodeURIComponent(input.username)}`);
      return { username: input.username, email: input.email, created: false };
    } catch (error) {
      if (!(error instanceof ForgejoApiError) || error.status !== 404) {
        throw error;
      }
    }

    await this.request<unknown>("POST", "/admin/users", {
      username: input.username,
      email: input.email,
      password: input.password,
      full_name: input.fullName,
      must_change_password: true
    });
    return { username: input.username, email: input.email, created: true };
  }

  async createRepo(input: CreateRepoInput): Promise<ForgeRepo> {
    const raw = await this.request<Record<string, unknown>>("POST", `/admin/users/${encodeURIComponent(input.owner)}/repos`, {
      name: input.name,
      description: input.description,
      private: input.private,
      default_branch: input.defaultBranch ?? "main",
      auto_init: true
    });
    return this.mapRepo(raw);
  }

  async getRepo(owner: string, repo: string): Promise<ForgeRepo> {
    const raw = await this.request<Record<string, unknown>>("GET", `/repos/${owner}/${repo}`);
    return this.mapRepo(raw);
  }

  async listRepos(owner: string): Promise<ForgeRepo[]> {
    const raw = await this.request<Array<Record<string, unknown>>>("GET", `/users/${encodeURIComponent(owner)}/repos`);
    return raw.map((entry) => this.mapRepo(entry));
  }

  async archiveRepo(owner: string, repo: string): Promise<ForgeRepo> {
    const raw = await this.request<Record<string, unknown>>("PATCH", `/repos/${owner}/${repo}`, { archived: true });
    return this.mapRepo(raw);
  }

  async createBranch(input: CreateBranchInput): Promise<ForgeBranch> {
    const raw = await this.request<Record<string, unknown>>("POST", `/repos/${input.owner}/${input.repo}/branches`, {
      new_branch_name: input.newBranch,
      old_branch_name: input.fromBranch
    });
    return {
      name: raw.name as string,
      commitSha: ((raw.commit as Record<string, unknown> | undefined)?.id as string) ?? ""
    };
  }

  async listBranches(owner: string, repo: string): Promise<ForgeBranch[]> {
    const raw = await this.request<Array<Record<string, unknown>>>("GET", `/repos/${owner}/${repo}/branches`);
    return raw.map((entry) => ({
      name: entry.name as string,
      commitSha: ((entry.commit as Record<string, unknown> | undefined)?.id as string) ?? ""
    }));
  }

  private async fetchReviews(owner: string, repo: string, number: number): Promise<ForgeReview[]> {
    const raw = await this.request<Array<Record<string, unknown>>>("GET", `/repos/${owner}/${repo}/pulls/${number}/reviews`);
    return raw
      .filter((entry) => entry.state !== "PENDING")
      .map((entry) => ({
        reviewerLogin: (entry.user as Record<string, unknown> | undefined)?.login as string,
        decision: mapReviewDecision(entry.state as string),
        body: entry.body as string | undefined,
        submittedAt: entry.submitted_at as string | undefined
      }));
  }

  private async fetchChecks(owner: string, repo: string, sha: string): Promise<ForgePullRequest["checks"]> {
    if (!sha) {
      return [];
    }
    const raw = await this.request<{ statuses?: Array<Record<string, unknown>> }>(
      "GET",
      `/repos/${owner}/${repo}/commits/${sha}/status`
    );
    return (raw.statuses ?? []).map((entry) => ({
      name: (entry.context as string) ?? "status",
      status: mapCheckStatus(entry.status as string),
      url: entry.target_url as string | undefined
    }));
  }

  private async mapPullRequest(owner: string, repo: string, raw: Record<string, unknown>): Promise<ForgePullRequest> {
    const number = raw.number as number;
    const headSha = ((raw.head as Record<string, unknown> | undefined)?.sha as string) ?? "";
    const [reviews, checks] = await Promise.all([
      this.fetchReviews(owner, repo, number),
      this.fetchChecks(owner, repo, headSha)
    ]);
    return {
      number,
      title: raw.title as string,
      body: raw.body as string | undefined,
      authorLogin: (raw.user as Record<string, unknown> | undefined)?.login as string,
      sourceBranch: (raw.head as Record<string, unknown> | undefined)?.ref as string,
      targetBranch: (raw.base as Record<string, unknown> | undefined)?.ref as string,
      headSha,
      state: (raw.state as "open" | "closed") ?? "open",
      merged: Boolean(raw.merged),
      reviews,
      checks,
      createdAt: raw.created_at as string | undefined,
      updatedAt: raw.updated_at as string | undefined
    };
  }

  async openPullRequest(input: OpenPullRequestInput): Promise<ForgePullRequest> {
    const raw = await this.request<Record<string, unknown>>("POST", `/repos/${input.owner}/${input.repo}/pulls`, {
      title: input.title,
      body: input.body,
      head: input.sourceBranch,
      base: input.targetBranch
    });
    return this.mapPullRequest(input.owner, input.repo, raw);
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<ForgePullRequest> {
    const raw = await this.request<Record<string, unknown>>("GET", `/repos/${owner}/${repo}/pulls/${number}`);
    return this.mapPullRequest(owner, repo, raw);
  }

  async listPullRequests(owner: string, repo: string, state: "open" | "closed" | "all" = "open"): Promise<ForgePullRequest[]> {
    const raw = await this.request<Array<Record<string, unknown>>>("GET", `/repos/${owner}/${repo}/pulls?state=${state}`);
    return Promise.all(raw.map((entry) => this.mapPullRequest(owner, repo, entry)));
  }

  async addReview(input: AddReviewInput): Promise<ForgeReview> {
    const raw = await this.request<Record<string, unknown>>("POST", `/repos/${input.owner}/${input.repo}/pulls/${input.number}/reviews`, {
      event: REVIEW_EVENT[input.decision],
      body: input.body
    });
    return {
      reviewerLogin: (raw.user as Record<string, unknown> | undefined)?.login as string,
      decision: input.decision,
      body: input.body,
      submittedAt: raw.submitted_at as string | undefined
    };
  }

  async mergePullRequest(input: MergePullRequestInput): Promise<MergeResult> {
    await this.request<unknown>("POST", `/repos/${input.owner}/${input.repo}/pulls/${input.number}/merge`, {
      Do: MERGE_DO[input.method]
    });
    const merged = await this.getPullRequest(input.owner, input.repo, input.number);
    return { merged: merged.merged, mergeSha: merged.headSha };
  }

  async closePullRequest(owner: string, repo: string, number: number): Promise<ForgePullRequest> {
    const raw = await this.request<Record<string, unknown>>("PATCH", `/repos/${owner}/${repo}/pulls/${number}`, {
      state: "closed"
    });
    return this.mapPullRequest(owner, repo, raw);
  }
}
