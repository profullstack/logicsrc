import type { PluginDefinition } from "@logicsrc/plugin-core";
import { sh1ptManifest } from "./manifest.js";

export const sh1ptPlugin: PluginDefinition = {
  manifest: sh1ptManifest,
  configDefaults: {
    enabled: true,
    default_project_provider: true,
    api_url: "${SH1PT_API_URL}",
    api_key: "${SH1PT_API_KEY}",
    webhook_secret: "${SH1PT_WEBHOOK_SECRET}",
    default_board: "/projects/sh1pt"
  },
  routes: [
    { method: "GET", path: "/api/plugins/sh1pt/projects", capability: "projects.sync" },
    { method: "GET", path: "/api/plugins/sh1pt/actions", capability: "actions.import" },
    { method: "POST", path: "/api/plugins/sh1pt/actions/publish", capability: "actions.publish" },
    { method: "POST", path: "/api/plugins/sh1pt/deployments", capability: "deployments.create" },
    { method: "POST", path: "/api/plugins/sh1pt/webhooks/delivery-status", capability: "webhook.delivery_status" }
  ],
  events: [
    { event: "task.created", capability: "tasks.create_from_action" },
    { event: "task.approved", capability: "reputation.delivery_event" },
    { event: "artifact.created", capability: "artifacts.sync" },
    { event: "deployment.completed", capability: "releases.sync" }
  ],
  permissions: [
    "projects:read",
    "projects:sync",
    "actions:read",
    "actions:publish",
    "deployments:create",
    "deployments:read",
    "artifacts:sync",
    "reputation:sync"
  ],
  tuiPanels: [{ id: "sh1pt-status", title: "sh1pt Projects" }]
};

export { sh1ptManifest };
