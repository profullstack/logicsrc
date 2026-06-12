import type { DiscoveredFeed, FeedDiscoveryConfig, FeedDiscoveryProvider, FeedDiscoveryQuery } from "../types.js";
import { probeSite } from "../probe-site.js";

export class WebCandidateFeedProbeProvider implements FeedDiscoveryProvider {
  id = "web-feed-probe";
  name = "Web Candidate Feed Probe";
  enabledByDefault = true;
  requiresApiKey = false;

  constructor(private readonly config: FeedDiscoveryConfig) {}

  async search(query: FeedDiscoveryQuery) {
    const candidates = candidateUrls(query, this.config.candidateUrls).slice(0, this.config.maxProbes);
    const feeds: DiscoveredFeed[] = [];

    for (const candidate of candidates) {
      const result = await probeSite(candidate, this.config);
      feeds.push(...result.feeds.map((feed) => ({ ...feed, provider: this.id })));
    }

    return feeds.filter((feed) => !query.type || query.type === "all" || feed.kind === query.type);
  }
}

function candidateUrls(query: FeedDiscoveryQuery, configured: string[]) {
  const candidates = new Set<string>();
  if (/^https?:\/\//i.test(query.q)) {
    candidates.add(query.q);
  }

  for (const entry of configured) {
    const [url, ...keywords] = entry.split("|").map((part) => part.trim());
    if (!/^https?:\/\//i.test(url)) {
      continue;
    }
    if (keywords.length === 0 || keywords.some((keyword) => query.q.toLowerCase().includes(keyword.toLowerCase()))) {
      candidates.add(url);
    }
  }

  return [...candidates];
}
