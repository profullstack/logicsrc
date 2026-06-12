import type { PluginDefinition } from "@logicsrc/plugin-core";
import { agentBbsManifest } from "./manifest.js";

export const agentBbsPlugin: PluginDefinition = {
  manifest: agentBbsManifest,
  configDefaults: {
    enabled: true,
    ssh_host: "${AGENTBBS_SSH_HOST}",
    ssh_port: "${AGENTBBS_SSH_PORT}",
    ssh_key_path: "${AGENTBBS_SSH_KEY_PATH}",
    default_route: "bbs"
  },
  routes: [
    { method: "GET", path: "/api/plugins/agentbbs/status", capability: "bbs.status" },
    { method: "GET", path: "/api/plugins/agentbbs/chat", capability: "chat.read" },
    { method: "POST", path: "/api/plugins/agentbbs/chat", capability: "chat.send" },
    { method: "GET", path: "/api/plugins/agentbbs/pods", capability: "pods.list" },
    { method: "POST", path: "/api/plugins/agentbbs/pods", capability: "pods.provision" },
    { method: "GET", path: "/api/plugins/agentbbs/arcade", capability: "arcade.list" },
    { method: "GET", path: "/api/plugins/agentbbs/finger/:user", capability: "finger.lookup" }
  ],
  events: [{ event: "payment.confirmed", capability: "pods.membership" }],
  permissions: ["bbs:read", "chat:send", "pods:provision"],
  tuiPanels: [{ id: "agentbbs-status", title: "AgentBBS" }]
};

export { agentBbsManifest };
