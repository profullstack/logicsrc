import type { PluginManifest } from "@logicsrc/plugin-core";

export const sh1ptManifest: PluginManifest = {
  id: "sh1pt",
  name: "sh1pt",
  version: "1.0.0",
  type: ["projects", "actions", "releases", "delivery"],
  default: true,
  capabilities: [
    "projects.sync",
    "actions.import",
    "actions.publish",
    "tasks.create_from_action",
    "releases.sync",
    "deployments.create",
    "deployments.status",
    "artifacts.sync",
    "webhook.delivery_status",
    "reputation.delivery_event"
  ],
  commands: ["sh1pt", "projects", "actions", "deploy", "releases"],
  env: ["SH1PT_API_URL", "SH1PT_API_KEY", "SH1PT_WEBHOOK_SECRET"]
};
