import type { FeedDiscoveryResponse } from "../types.js";
import { escapeXml } from "./opml.js";

export function renderAtom(response: FeedDiscoveryResponse) {
  const updated = new Date().toISOString();
  const entries = response.results
    .map((result) => {
      const id = result.canonicalFeedUrl ?? result.feedUrl;
      return `  <entry>
    <id>${escapeXml(id)}</id>
    <title>${escapeXml(result.title)}</title>
    <link href="${escapeXml(result.homepageUrl ?? result.feedUrl)}" />
    <updated>${escapeXml(result.lastPublishedAt ?? updated)}</updated>
    <summary>${escapeXml(result.description ?? `Discovered ${result.kind} feed from ${result.provider}`)}</summary>
  </entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>logicsrc:feed-discovery:${escapeXml(response.normalizedQuery)}</id>
  <title>LogicSRC feed discovery: ${escapeXml(response.query)}</title>
  <updated>${updated}</updated>
${entries}
</feed>`;
}
