import type { PluginManifest } from "@logicsrc/plugin-core";

export const agentMailManifest: PluginManifest = {
  id: "agentmail",
  name: "AgentMail",
  version: "0.1.0",
  type: ["communication", "email", "mailbox"],
  default: false,
  capabilities: [
    "mailbox.list",
    "message.list",
    "message.read",
    "message.search",
    "message.compose",
    "message.send",
    "message.flag",
    "message.delete",
    "access.gate"
  ],
  commands: ["mail", "inbox", "compose"],
  env: [
    "AGENTMAIL_DOMAIN",
    "AGENTMAIL_IMAP_HOST",
    "AGENTMAIL_IMAP_PORT",
    "AGENTMAIL_SMTP_HOST",
    "AGENTMAIL_SMTP_PORT"
  ]
};
