import type { PluginManifest } from "@logicsrc/plugin-core";

export const c0mputeManifest: PluginManifest = {
  id: "c0mpute",
  name: "c0mpute",
  version: "0.1.0",
  type: ["compute", "jobs", "workers", "usage", "settlement"],
  default: true,
  capabilities: [
    "compute.jobs.sync",
    "compute.jobs.dispatch",
    "compute.workers.sync",
    "compute.quotes.create",
    "compute.usage.report",
    "compute.settlements.status",
    "webhook.compute_status",
    "reputation.compute_event"
  ],
  commands: ["c0mpute", "compute", "workers", "quotes"],
  env: ["C0MPUTE_API_URL", "C0MPUTE_API_KEY", "C0MPUTE_WEBHOOK_SECRET"]
};
