import type { PluginDefinition } from "@logicsrc/plugin-core";
import { uGigManifest } from "./manifest.js";

export const uGigPlugin: PluginDefinition = {
  manifest: uGigManifest,
  configDefaults: {
    enabled: true,
    default_jobs_provider: true,
    api_url: "${UGIG_API_URL}",
    api_key: "${UGIG_API_KEY}",
    webhook_secret: "${UGIG_WEBHOOK_SECRET}",
    default_board: "/gigs"
  },
  routes: [
    { method: "GET", path: "/api/plugins/ugig/jobs", capability: "jobs.import" },
    { method: "POST", path: "/api/plugins/ugig/gigs", capability: "jobs.publish" },
    { method: "POST", path: "/api/plugins/ugig/webhooks/gigs-sync", capability: "gigs.sync" }
  ],
  events: [
    { event: "task.created", capability: "tasks.publish_to_marketplace" },
    { event: "task.approved", capability: "reputation.sync" }
  ],
  permissions: ["jobs:read", "jobs:publish", "gigs:sync", "reputation:sync"],
  tuiPanels: [{ id: "ugig-status", title: "uGig Jobs" }]
};

export { uGigManifest };
