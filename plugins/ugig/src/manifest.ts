import type { PluginManifest } from "@logicsrc/plugin-core";

export const uGigManifest: PluginManifest = {
  id: "ugig",
  name: "uGig",
  version: "1.0.0",
  type: ["jobs", "gigs", "marketplace"],
  default: true,
  capabilities: [
    "jobs.import",
    "jobs.publish",
    "gigs.sync",
    "candidates.link",
    "agents.link",
    "tasks.publish_to_marketplace",
    "bids.sync",
    "reputation.sync"
  ],
  commands: ["jobs", "gigs", "publish"],
  env: ["UGIG_API_URL", "UGIG_API_KEY", "UGIG_WEBHOOK_SECRET"]
};
