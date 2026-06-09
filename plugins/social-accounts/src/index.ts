import { createProviderRegistry } from "@logicsrc/account-core";
import type { PluginDefinition } from "@logicsrc/plugin-core";
import { socialAccountsManifest } from "./manifest.js";
import { socialAccountProviderManifests } from "./providers/index.js";

export const socialAccountsPlugin: PluginDefinition = {
  manifest: socialAccountsManifest,
  configDefaults: {
    enabled: true,
    default_publish_policy: "approval_required",
    credential_broker: "${LOGICSRC_CREDENTIAL_BROKER}"
  },
  routes: [
    { method: "GET", path: "/api/social/providers", capability: "social.providers.list" },
    { method: "GET", path: "/api/social/accounts", capability: "accounts.list" },
    { method: "GET", path: "/api/social/accounts/:id/profile", capability: "social.profile.read" },
    { method: "POST", path: "/api/social/accounts/:id/drafts", capability: "social.post.draft" },
    { method: "POST", path: "/api/social/accounts/:id/posts", capability: "social.post.publish" },
    { method: "GET", path: "/api/social/accounts/:id/mentions", capability: "social.mentions.read" },
    { method: "GET", path: "/api/social/accounts/:id/analytics", capability: "social.analytics.read" }
  ],
  permissions: [
    "accounts:list",
    "accounts:read_metadata",
    "accounts:audit:read",
    "social:profile:read",
    "social:post:draft",
    "social:post:publish",
    "social:mentions:read",
    "social:analytics:read"
  ],
  tuiPanels: [{ id: "social-accounts", title: "Social Accounts" }]
};

const registry = createProviderRegistry(socialAccountProviderManifests);

export function listSocialAccountProviders() {
  return registry.list("social");
}

export { socialAccountsManifest, socialAccountProviderManifests };
