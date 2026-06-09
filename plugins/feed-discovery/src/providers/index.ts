import type { FeedDiscoveryConfig, FeedDiscoveryProvider, FeedProviderManifest } from "../types.js";
import { ITunesPodcastProvider } from "./itunes-podcast.js";
import { ManualCuratedProvider } from "./manual-curated.js";
import { OpmlDirectoryProvider } from "./opml-directory.js";
import { PodcastIndexProvider } from "./podcastindex.js";
import { WebCandidateFeedProbeProvider } from "./web-feed-probe.js";

export function createDefaultFeedProviders(config: FeedDiscoveryConfig): FeedDiscoveryProvider[] {
  return [
    new ManualCuratedProvider(),
    new OpmlDirectoryProvider(config.opmlPaths),
    new WebCandidateFeedProbeProvider(config),
    new ITunesPodcastProvider(config),
    new PodcastIndexProvider(config)
  ];
}

export function providerManifests(config: FeedDiscoveryConfig): FeedProviderManifest[] {
  return createDefaultFeedProviders(config).map((provider) => ({
    id: provider.id,
    name: provider.name,
    type: provider.id.includes("podcast") || provider.id.includes("itunes") ? "podcast" : "all",
    requiresApiKey: provider.requiresApiKey,
    enabledByDefault: provider.enabledByDefault && (!provider.requiresApiKey || hasProviderKey(provider.id, config)),
    description: describeProvider(provider.id)
  }));
}

function hasProviderKey(id: string, config: FeedDiscoveryConfig) {
  if (id === "podcastindex") {
    return Boolean(config.podcastIndexApiKey && config.podcastIndexApiSecret);
  }
  return true;
}

function describeProvider(id: string) {
  const descriptions: Record<string, string> = {
    "manual-curated": "Searches locally curated high-trust feed sources.",
    "opml-directory": "Searches configured local OPML files.",
    "web-feed-probe": "Probes configured candidate homepages and direct URL queries for feeds.",
    "itunes-podcast": "Searches the public iTunes podcast directory.",
    podcastindex: "Searches PodcastIndex when API credentials are configured."
  };
  return descriptions[id] ?? "Feed discovery provider.";
}
