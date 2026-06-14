import type { PluginDefinition } from "@logicsrc/plugin-core";
import { agentMailManifest } from "./manifest.js";

export const agentMailPlugin: PluginDefinition = {
  manifest: agentMailManifest,
  configDefaults: {
    enabled: false,
    members_only: true,
    paid_only: true,
    domain: "${AGENTMAIL_DOMAIN}",
    imap_host: "${AGENTMAIL_IMAP_HOST}",
    imap_port: "${AGENTMAIL_IMAP_PORT}",
    smtp_host: "${AGENTMAIL_SMTP_HOST}",
    smtp_port: "${AGENTMAIL_SMTP_PORT}",
    backend_provider: "mailu"
  },
  routes: [
    { method: "GET", path: "/api/plugins/agentmail/mailboxes", capability: "mailbox.list" },
    { method: "GET", path: "/api/plugins/agentmail/mailboxes/:mailbox/messages", capability: "message.list" },
    { method: "GET", path: "/api/plugins/agentmail/mailboxes/:mailbox/messages/:uid", capability: "message.read" },
    { method: "GET", path: "/api/plugins/agentmail/search", capability: "message.search" },
    { method: "POST", path: "/api/plugins/agentmail/messages", capability: "message.send" },
    { method: "PATCH", path: "/api/plugins/agentmail/mailboxes/:mailbox/messages/:uid", capability: "message.flag" },
    { method: "DELETE", path: "/api/plugins/agentmail/mailboxes/:mailbox/messages/:uid", capability: "message.delete" }
  ],
  permissions: ["mail:read", "mail:search", "mail:compose", "mail:send", "mail:flag", "mail:delete"],
  tuiPanels: [{ id: "agentmail-inbox", title: "Mail" }]
};

export { agentMailManifest };

// Domain, access, ports, service, and transports.
export * from "./domain.js";
export * from "./access.js";
export * from "./ports.js";
export * from "./service.js";
export { InMemoryMailTransport } from "./transports/memory.js";
export type { SeedMessage } from "./transports/memory.js";
export { createMailuTransport, resolveMailuConfig } from "./transports/mailu.js";
export type { MailuConfig, ImapDriver, SmtpDriver, CreateMailuTransportOptions } from "./transports/mailu.js";
