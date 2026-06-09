import type { PluginManifest } from "@logicsrc/plugin-core";

export const agentStackManifest: PluginManifest = {
  id: "agentstack",
  name: "AgentStack",
  version: "0.1.0",
  type: ["agents", "tasks", "coordination"],
  default: false,
  capabilities: [
    "agents.register",
    "agents.delegate",
    "tasks.create",
    "tasks.assign",
    "tasks.update",
    "tasks.publish",
    "reputation.sync",
    "payments.link",
    "escrow.link"
  ],
  commands: ["agents", "tasks", "delegate"],
  env: ["AGENTSTACK_API_URL", "AGENTSTACK_API_KEY", "COINPAY_API_BASE_URL"]
};
