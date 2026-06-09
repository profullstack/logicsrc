import type { PluginManifest } from "@logicsrc/plugin-core";

export const feedDiscoveryManifest: PluginManifest = {
  id: "feed-discovery",
  name: "Feed Discovery",
  version: "0.1.0",
  type: ["feeds", "rss", "discovery", "content"],
  default: true,
  capabilities: [
    "feeds.discover",
    "feeds.validate",
    "feeds.probe",
    "feeds.export.opml",
    "feeds.export.rss",
    "feeds.providers.list"
  ],
  commands: ["feeds"],
  env: [
    "LOGICSRC_FEEDS_CACHE_TTL_SECONDS",
    "LOGICSRC_FEEDS_MAX_PROVIDERS",
    "LOGICSRC_FEEDS_MAX_PROBES",
    "LOGICSRC_FEEDS_REQUEST_TIMEOUT_MS",
    "LOGICSRC_FEEDS_USER_AGENT",
    "PODCASTINDEX_API_KEY",
    "PODCASTINDEX_API_SECRET"
  ]
};
