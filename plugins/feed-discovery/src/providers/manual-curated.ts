import type { DiscoveredFeed, FeedDiscoveryProvider, FeedDiscoveryQuery } from "../types.js";

const CURATED_FEEDS: DiscoveredFeed[] = [
  {
    title: "Indie Hackers",
    description: "Stories and discussions from founders building profitable internet businesses.",
    homepageUrl: "https://www.indiehackers.com",
    feedUrl: "https://www.indiehackers.com/feed",
    kind: "blog",
    provider: "manual-curated",
    score: 0,
    confidence: 0.8,
    tags: ["indie", "startup", "microsaas", "saas"]
  },
  {
    title: "Hacker News",
    description: "Technology, startup, software, and open-source discussion.",
    homepageUrl: "https://news.ycombinator.com",
    feedUrl: "https://news.ycombinator.com/rss",
    kind: "news",
    provider: "manual-curated",
    score: 0,
    confidence: 0.75,
    tags: ["startups", "software", "open-source", "technology"]
  },
  {
    title: "GitHub Blog",
    description: "GitHub product, open-source, and developer ecosystem news.",
    homepageUrl: "https://github.blog",
    feedUrl: "https://github.blog/feed/",
    kind: "github",
    provider: "manual-curated",
    score: 0,
    confidence: 0.7,
    tags: ["github", "open-source", "software", "developers"]
  }
];

export class ManualCuratedProvider implements FeedDiscoveryProvider {
  id = "manual-curated";
  name = "Manual Curated";
  enabledByDefault = true;
  requiresApiKey = false;

  async search(query: FeedDiscoveryQuery) {
    const terms = normalize(query.q);
    return CURATED_FEEDS.filter((feed) => {
      if (query.type && query.type !== "all" && feed.kind !== query.type) {
        return false;
      }
      const haystack = normalize([feed.title, feed.description, feed.homepageUrl, feed.feedUrl, feed.tags.join(" ")].join(" "));
      return terms.length === 0 || terms.some((term) => haystack.includes(term));
    }).map((feed) => ({ ...feed, provider: this.id }));
  }
}

function normalize(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
