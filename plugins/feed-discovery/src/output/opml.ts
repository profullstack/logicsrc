import type { DiscoveredFeed, FeedDiscoveryResponse } from "../types.js";

export function renderOpml(response: FeedDiscoveryResponse) {
  const outlines = response.results.map(renderOutline).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>LogicSRC feed discovery: ${escapeXml(response.query)}</title>
  </head>
  <body>
${outlines}
  </body>
</opml>`;
}

function renderOutline(feed: DiscoveredFeed) {
  return `    <outline text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" type="rss" xmlUrl="${escapeXml(feed.canonicalFeedUrl ?? feed.feedUrl)}"${feed.homepageUrl ? ` htmlUrl="${escapeXml(feed.homepageUrl)}"` : ""} category="${escapeXml(feed.kind)}" />`;
}

export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
