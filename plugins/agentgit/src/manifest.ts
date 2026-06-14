import type { PluginManifest } from "@logicsrc/plugin-core";

export const agentGitManifest: PluginManifest = {
  id: "agentgit",
  name: "AgentGit",
  version: "0.1.0",
  type: ["scm", "collaboration", "review"],
  default: false,
  capabilities: [
    "repo.create",
    "repo.list",
    "repo.get",
    "repo.archive",
    "branch.create",
    "branch.list",
    "pr.open",
    "pr.list",
    "pr.get",
    "pr.review",
    "pr.merge",
    "pr.close",
    "merge.evaluate",
    "access.gate",
    "webhook.push",
    "webhook.pr_status",
    "reputation.merge_event",
    "audit.log"
  ],
  commands: ["repo", "pr", "clone", "review", "merge"],
  env: ["AGENTGIT_API_URL", "AGENTGIT_FORGE_URL", "AGENTGIT_API_KEY", "AGENTGIT_WEBHOOK_SECRET"]
};
