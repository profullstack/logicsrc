import type { FeedDiscoveryResponse } from "../types.js";

export function renderJsonFeed(response: FeedDiscoveryResponse) {
  return JSON.stringify(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: `LogicSRC feed discovery: ${response.query}`,
      home_page_url: "https://bittorrented.com/rss",
      feed_url: `https://bittorrented.com/json-feed/discover/${encodeURIComponent(response.normalizedQuery)}.json`,
      items: response.results.map((result) => ({
        id: result.canonicalFeedUrl ?? result.feedUrl,
        url: result.homepageUrl ?? result.feedUrl,
        title: result.title,
        summary: result.description ?? `Discovered ${result.kind} feed from ${result.provider}`,
        date_published: result.lastPublishedAt,
        tags: [result.kind, result.provider, ...result.tags]
      }))
    },
    null,
    2
  );
}
