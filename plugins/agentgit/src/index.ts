import type { PluginDefinition } from "@logicsrc/plugin-core";
import { agentGitManifest } from "./manifest.js";

export const agentGitPlugin: PluginDefinition = {
  manifest: agentGitManifest,
  configDefaults: {
    enabled: false,
    backend_provider: "forgejo",
    forge_url: "${AGENTGIT_FORGE_URL}",
    api_url: "${AGENTGIT_API_URL}",
    api_key: "${AGENTGIT_API_KEY}",
    webhook_secret: "${AGENTGIT_WEBHOOK_SECRET}",
    members_only: true,
    default_merge_policy: {
      min_reviews: 1,
      require_passing_checks: true,
      reviewer_reputation_min: 0,
      escrow_required: false,
      allow_agent_merge: true,
      allowed_merge_methods: ["squash"]
    }
  },
  routes: [
    { method: "POST", path: "/api/plugins/agentgit/repos", capability: "repo.create" },
    { method: "GET", path: "/api/plugins/agentgit/repos", capability: "repo.list" },
    { method: "POST", path: "/api/plugins/agentgit/repos/:repo/pulls", capability: "pr.open" },
    { method: "POST", path: "/api/plugins/agentgit/repos/:repo/pulls/:number/reviews", capability: "pr.review" },
    { method: "POST", path: "/api/plugins/agentgit/repos/:repo/pulls/:number/merge", capability: "pr.merge" },
    { method: "POST", path: "/api/plugins/agentgit/webhooks/push", capability: "webhook.push" },
    { method: "POST", path: "/api/plugins/agentgit/webhooks/pr-status", capability: "webhook.pr_status" }
  ],
  events: [
    { event: "task.claimed", capability: "branch.create" },
    { event: "pull_request.merged", capability: "reputation.merge_event" }
  ],
  permissions: [
    "repos:read",
    "repos:create",
    "pulls:open",
    "pulls:review",
    "pulls:merge"
  ],
  tuiPanels: [{ id: "agentgit-status", title: "AgentGit" }]
};

export { agentGitManifest };

// M1: Forgejo adapter, membership gate, merge-policy engine, and service.
export * from "./domain.js";
export * from "./access.js";
export * from "./merge-policy.js";
export * from "./service.js";
export type {
  ForgeAdapter,
  ForgeRepo,
  ForgeBranch,
  ForgeReview,
  ForgeCheck,
  ForgePullRequest,
  ForgeUser,
  CreateRepoInput,
  CreateBranchInput,
  OpenPullRequestInput,
  AddReviewInput,
  MergePullRequestInput,
  MergeResult,
  EnsureUserInput
} from "./forge/adapter.js";
export { ForgejoAdapter, ForgejoApiError } from "./forge/forgejo.js";
export type { FetchLike, ForgejoAdapterOptions } from "./forge/forgejo.js";
