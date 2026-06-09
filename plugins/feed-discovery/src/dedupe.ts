import type { DiscoveredFeed } from "./types.js";
import { canonicalizeUrl } from "./url-safety.js";

export function dedupeFeeds(feeds: DiscoveredFeed[]) {
  const byKey = new Map<string, DiscoveredFeed>();

  for (const feed of feeds) {
    const key = dedupeKey(feed);
    const existing = byKey.get(key);
    if (!existing || feed.score > existing.score || feed.confidence > existing.confidence) {
      byKey.set(key, mergeFeed(existing, feed));
    }
  }

  return [...byKey.values()].sort((a, b) => b.score - a.score || b.confidence - a.confidence);
}

function dedupeKey(feed: DiscoveredFeed) {
  const feedUrl = feed.canonicalFeedUrl || feed.feedUrl;
  try {
    return `feed:${canonicalizeUrl(feedUrl)}`;
  } catch {
    return `feed:${feedUrl.toLowerCase()}`;
  }
}

function mergeFeed(existing: DiscoveredFeed | undefined, next: DiscoveredFeed): DiscoveredFeed {
  if (!existing) {
    return next;
  }

  return {
    ...existing,
    ...next,
    tags: [...new Set([...existing.tags, ...next.tags])],
    sampleItems: next.sampleItems?.length ? next.sampleItems : existing.sampleItems
  };
}
