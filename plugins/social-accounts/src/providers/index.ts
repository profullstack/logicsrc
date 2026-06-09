import type { LogicSrcAccountProviderManifest } from "@logicsrc/account-core";

export const socialAccountProviderManifests: LogicSrcAccountProviderManifest[] = [
  {
    id: "mastodon",
    name: "Mastodon",
    kind: "social",
    authMethods: ["oauth2"],
    capabilities: ["social.profile.read", "social.post.draft", "social.post.publish", "social.mentions.read"],
    defaultScopes: ["read:accounts", "read:statuses", "write:statuses"],
    status: "planned"
  },
  {
    id: "bluesky",
    name: "Bluesky",
    kind: "social",
    authMethods: ["api_key"],
    capabilities: ["social.profile.read", "social.post.draft", "social.post.publish"],
    defaultScopes: ["atproto.session", "atproto.repo.read", "atproto.repo.write"],
    status: "planned"
  },
  {
    id: "github",
    name: "GitHub",
    kind: "social",
    authMethods: ["oauth2", "api_key"],
    capabilities: ["social.profile.read", "social.post.draft", "social.post.publish"],
    defaultScopes: ["read:user", "repo"],
    status: "planned"
  },
  {
    id: "x",
    name: "X / Twitter",
    kind: "social",
    authMethods: ["oauth2", "api_key"],
    capabilities: ["social.profile.read", "social.post.draft", "social.post.publish", "social.mentions.read", "social.analytics.read"],
    defaultScopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    status: "planned"
  },
  {
    id: "reddit",
    name: "Reddit",
    kind: "social",
    authMethods: ["oauth2"],
    capabilities: ["social.profile.read", "social.post.draft", "social.post.publish", "social.comments.read"],
    defaultScopes: ["identity", "read", "submit"],
    status: "planned"
  }
];
