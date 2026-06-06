import type { PluginDefinition } from "@logicsrc/plugin-core";
import { c0mputeManifest } from "./manifest.js";

export const c0mputePlugin: PluginDefinition = {
  manifest: c0mputeManifest,
  configDefaults: {
    enabled: true,
    work_in_progress: true,
    default_compute_provider: true,
    api_url: "${C0MPUTE_API_URL}",
    api_key: "${C0MPUTE_API_KEY}",
    webhook_secret: "${C0MPUTE_WEBHOOK_SECRET}",
    default_board: "/projects/c0mpute"
  },
  routes: [
    { method: "GET", path: "/api/plugins/c0mpute/jobs", capability: "compute.jobs.sync" },
    { method: "POST", path: "/api/plugins/c0mpute/jobs/dispatch", capability: "compute.jobs.dispatch" },
    { method: "GET", path: "/api/plugins/c0mpute/workers", capability: "compute.workers.sync" },
    { method: "POST", path: "/api/plugins/c0mpute/quotes", capability: "compute.quotes.create" },
    { method: "POST", path: "/api/plugins/c0mpute/webhooks/compute-status", capability: "webhook.compute_status" }
  ],
  events: [
    { event: "task.created", capability: "compute.quotes.create" },
    { event: "run.requested", capability: "compute.jobs.dispatch" },
    { event: "usage.reported", capability: "compute.usage.report" },
    { event: "settlement.completed", capability: "reputation.compute_event" }
  ],
  permissions: [
    "compute:jobs:read",
    "compute:jobs:dispatch",
    "compute:workers:read",
    "compute:quotes:create",
    "compute:usage:report",
    "compute:settlements:read",
    "reputation:sync"
  ],
  tuiPanels: [{ id: "c0mpute-status", title: "c0mpute Jobs" }]
};

export { c0mputeManifest };
