import type { PluginDefinition } from "@logicsrc/plugin-core";
import { readFeedDiscoveryConfig } from "./config.js";
import { discoverFeeds } from "./discovery.js";
import { feedDiscoveryManifest } from "./manifest.js";
import { probeSite } from "./probe-site.js";
import { providerManifests } from "./providers/index.js";
import { validateFeed } from "./validate-feed.js";

export const feedDiscoveryPlugin: PluginDefinition = {
  manifest: feedDiscoveryManifest,
  configDefaults: {
    enabled: true,
    cache_ttl_seconds: "${LOGICSRC_FEEDS_CACHE_TTL_SECONDS}",
    max_providers: "${LOGICSRC_FEEDS_MAX_PROVIDERS}",
    max_probes: "${LOGICSRC_FEEDS_MAX_PROBES}",
    request_timeout_ms: "${LOGICSRC_FEEDS_REQUEST_TIMEOUT_MS}",
    user_agent: "${LOGICSRC_FEEDS_USER_AGENT}"
  },
  routes: [
    { method: "GET", path: "/api/feeds/discover", capability: "feeds.discover" },
    { method: "GET", path: "/api/feeds/providers", capability: "feeds.providers.list" },
    { method: "GET", path: "/rss/discover/:keyword.xml", capability: "feeds.export.rss" }
  ],
  permissions: ["feeds:discover", "feeds:validate", "feeds:probe", "feeds:export"],
  tuiPanels: [{ id: "feed-discovery-status", title: "Feed Discovery" }]
};

export function listFeedProviders() {
  return providerManifests(readFeedDiscoveryConfig());
}

export { discoverFeeds, feedDiscoveryManifest, probeSite, readFeedDiscoveryConfig, validateFeed };
export type {
  DiscoveredFeed,
  FeedDiscoveryConfig,
  FeedDiscoveryProvider,
  FeedDiscoveryQuery,
  FeedDiscoveryResponse,
  FeedKind,
  FeedOutputFormat,
  FeedProviderManifest,
  FeedSampleItem,
  ProbeResult,
  ValidationResult
} from "./types.js";
export { renderAtom, renderDiscoveryOutput, renderJsonFeed, renderOpml, renderRss } from "./output/index.js";
export { createDefaultFeedProviders, providerManifests } from "./providers/index.js";
