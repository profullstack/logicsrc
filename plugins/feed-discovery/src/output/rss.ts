import RSS from "rss";
import type { FeedDiscoveryResponse } from "../types.js";

export function renderRss(response: FeedDiscoveryResponse) {
  const feed = new RSS({
    title: `LogicSRC feed discovery: ${response.query}`,
    description: `Discovered feed sources for ${response.query}`,
    feed_url: `https://bittorrented.com/rss/discover/${encodeURIComponent(response.normalizedQuery)}.xml`,
    site_url: "https://bittorrented.com/rss",
    language: "en"
  });

  for (const result of response.results) {
    feed.item({
      title: result.title,
      description: result.description ?? `Discovered ${result.kind} feed from ${result.provider}`,
      url: result.homepageUrl ?? result.feedUrl,
      guid: result.canonicalFeedUrl ?? result.feedUrl,
      categories: [result.kind, result.provider, ...result.tags],
      date: result.lastPublishedAt ? new Date(result.lastPublishedAt) : new Date()
    });
  }

  return feed.xml({ indent: true });
}
