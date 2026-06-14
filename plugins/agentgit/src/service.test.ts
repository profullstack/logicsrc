import { describe, expect, it } from "vitest";
import { DEFAULT_MERGE_POLICY, type Repo } from "./domain.js";
import { AccessDeniedError, AgentGitService, MergePolicyError } from "./service.js";
import type {
  ForgeAdapter,
  ForgePullRequest,
  ForgeRepo,
  ForgeUser,
  MergeResult
} from "./forge/adapter.js";

function fakePr(overrides: Partial<ForgePullRequest> = {}): ForgePullRequest {
  return {
    number: 1,
    title: "PR",
    authorLogin: "contributor",
    sourceBranch: "feature",
    targetBranch: "main",
    headSha: "abc",
    state: "open",
    merged: false,
    reviews: [{ reviewerLogin: "maintainer", decision: "approve" }],
    checks: [{ name: "ci", status: "passing" }],
    ...overrides
  };
}

class FakeAdapter implements ForgeAdapter {
  pr: ForgePullRequest = fakePr();
  merged = false;
  ensuredUsers: string[] = [];

  async ensureUser(input: { username: string; email: string }): Promise<ForgeUser> {
    this.ensuredUsers.push(input.username);
    return { username: input.username, email: input.email, created: true };
  }
  async createRepo(input: { owner: string; name: string }): Promise<ForgeRepo> {
    return { owner: input.owner, name: input.name, defaultBranch: "main", cloneUrl: "c", htmlUrl: "h", private: true, archived: false };
  }
  async getRepo(owner: string, name: string): Promise<ForgeRepo> {
    return { owner, name, defaultBranch: "main", cloneUrl: "c", htmlUrl: "h", private: true, archived: false };
  }
  async listRepos(): Promise<ForgeRepo[]> {
    return [];
  }
  async archiveRepo(owner: string, name: string): Promise<ForgeRepo> {
    return this.getRepo(owner, name);
  }
  async createBranch() {
    return { name: "feature", commitSha: "abc" };
  }
  async listBranches() {
    return [];
  }
  async openPullRequest(): Promise<ForgePullRequest> {
    return this.pr;
  }
  async getPullRequest(): Promise<ForgePullRequest> {
    return this.pr;
  }
  async listPullRequests(): Promise<ForgePullRequest[]> {
    return [this.pr];
  }
  async addReview() {
    return { reviewerLogin: "maintainer", decision: "approve" as const };
  }
  async mergePullRequest(): Promise<MergeResult> {
    this.merged = true;
    return { merged: true, mergeSha: "deadbeef" };
  }
  async closePullRequest(): Promise<ForgePullRequest> {
    return this.pr;
  }
}

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
      { did: "contributor.example", role: "contributor" },
      { did: "maintainer.example", role: "maintainer" }
    ],
    merge_policy: DEFAULT_MERGE_POLICY,
    ...overrides
  };
}

describe("AgentGitService", () => {
  it("provisions a member account keyed to the DID login", async () => {
    const adapter = new FakeAdapter();
    const service = new AgentGitService({ adapter });
    await service.provisionMember({ did: "newbie.example", email: "n@x.com", password: "pw" });
    expect(adapter.ensuredUsers).toEqual(["newbie"]);
  });

  it("denies repo creation by a non-owner", async () => {
    const service = new AgentGitService({ adapter: new FakeAdapter() });
    await expect(service.createRepo(repo(), "contributor.example")).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("lets the owner create a repo", async () => {
    const service = new AgentGitService({ adapter: new FakeAdapter() });
    const created = await service.createRepo(repo(), "owner.example");
    expect(created.name).toBe("demo");
  });

  it("denies opening a PR for a reader-less stranger", async () => {
    const service = new AgentGitService({ adapter: new FakeAdapter() });
    await expect(
      service.openPullRequest(repo(), { title: "x", sourceBranch: "f" }, "stranger.example")
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("merges when the policy is satisfied", async () => {
    const adapter = new FakeAdapter();
    const service = new AgentGitService({ adapter });
    const merged = await service.mergePullRequest(repo(), 1, "squash", "maintainer.example");
    expect(adapter.merged).toBe(true);
    expect(merged.status).toBe("merged");
    expect(merged.merge?.policy_satisfied).toBe(true);
  });

  it("refuses to merge when checks fail and never calls the backend merge", async () => {
    const adapter = new FakeAdapter();
    adapter.pr = fakePr({ checks: [{ name: "ci", status: "failing" }] });
    const service = new AgentGitService({ adapter });
    await expect(service.mergePullRequest(repo(), 1, "squash", "maintainer.example")).rejects.toBeInstanceOf(MergePolicyError);
    expect(adapter.merged).toBe(false);
  });

  it("denies merge by a contributor (role lacks merge)", async () => {
    const service = new AgentGitService({ adapter: new FakeAdapter() });
    await expect(service.mergePullRequest(repo(), 1, "squash", "contributor.example")).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
