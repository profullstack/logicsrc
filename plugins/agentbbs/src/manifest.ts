import type { PluginManifest } from "@logicsrc/plugin-core";

export const agentBbsManifest: PluginManifest = {
  id: "agentbbs",
  name: "AgentBBS",
  version: "1.0.0",
  type: ["community", "chat", "hosting"],
  default: false,
  capabilities: [
    "bbs.status",
    "chat.send",
    "chat.read",
    "pods.list",
    "pods.provision",
    "pods.membership",
    "arcade.list",
    "ascii.stream",
    "finger.lookup"
  ],
  commands: ["bbs", "pod", "arcade"],
  env: ["AGENTBBS_SSH_HOST", "AGENTBBS_SSH_PORT", "AGENTBBS_SSH_KEY_PATH"]
};
