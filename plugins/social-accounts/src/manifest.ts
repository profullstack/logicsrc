import type { PluginManifest } from "@logicsrc/plugin-core";

export const socialAccountsManifest: PluginManifest = {
  id: "social-accounts",
  name: "Social Accounts",
  version: "0.1.0",
  type: ["communication", "accounts", "social"],
  default: true,
  capabilities: [
    "accounts.connect",
    "accounts.list",
    "accounts.read_metadata",
    "accounts.test",
    "accounts.revoke",
    "accounts.sync",
    "accounts.audit.read",
    "social.providers.list",
    "social.profile.read",
    "social.post.draft",
    "social.post.publish",
    "social.media.upload",
    "social.mentions.read",
    "social.analytics.read"
  ],
  commands: ["accounts", "social"],
  env: [
    "MASTODON_CLIENT_ID",
    "MASTODON_CLIENT_SECRET",
    "BLUESKY_APP_PASSWORD",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "X_CLIENT_ID",
    "X_CLIENT_SECRET",
    "REDDIT_CLIENT_ID",
    "REDDIT_CLIENT_SECRET"
  ]
};
