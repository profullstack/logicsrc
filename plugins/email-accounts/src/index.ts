import { createProviderRegistry } from "@logicsrc/account-core";
import type { PluginDefinition } from "@logicsrc/plugin-core";
import { emailAccountsManifest } from "./manifest.js";
import { emailAccountProviderManifests } from "./providers/index.js";

export const emailAccountsPlugin: PluginDefinition = {
  manifest: emailAccountsManifest,
  configDefaults: {
    enabled: true,
    default_send_policy: "approval_required",
    credential_broker: "${LOGICSRC_CREDENTIAL_BROKER}"
  },
  routes: [
    { method: "GET", path: "/api/email/providers", capability: "email.providers.list" },
    { method: "GET", path: "/api/email/accounts", capability: "accounts.list" },
    { method: "POST", path: "/api/email/accounts/:id/search", capability: "email.search" },
    { method: "GET", path: "/api/email/messages/:messageId", capability: "email.headers.read" },
    { method: "POST", path: "/api/email/accounts/:id/drafts", capability: "email.draft" },
    { method: "POST", path: "/api/email/drafts/:draftId/send", capability: "email.send" },
    { method: "POST", path: "/api/email/messages/:messageId/labels", capability: "email.labels.modify" },
    { method: "DELETE", path: "/api/email/messages/:messageId", capability: "email.delete" }
  ],
  permissions: [
    "accounts:list",
    "accounts:read_metadata",
    "accounts:audit:read",
    "email:headers:read",
    "email:search",
    "email:draft",
    "email:send",
    "email:labels:modify",
    "email:delete"
  ],
  tuiPanels: [{ id: "email-accounts", title: "Email Accounts" }]
};

const registry = createProviderRegistry(emailAccountProviderManifests);

export function listEmailAccountProviders() {
  return registry.list("email");
}

export { emailAccountsManifest, emailAccountProviderManifests };
