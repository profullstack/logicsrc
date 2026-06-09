import { createHash } from "node:crypto";
import type { DiscoveredFeed, FeedDiscoveryConfig, FeedDiscoveryProvider, FeedDiscoveryQuery } from "../types.js";

interface PodcastIndexFeed {
  title?: string;
  description?: string;
  url?: string;
  link?: string;
  image?: string;
  language?: string;
  newestItemPublishTime?: number;
  categories?: Record<string, string>;
}

export class PodcastIndexProvider implements FeedDiscoveryProvider {
  id = "podcastindex";
  name = "PodcastIndex";
  enabledByDefault = false;
  requiresApiKey = true;

  constructor(private readonly config: FeedDiscoveryConfig) {}

  async search(query: FeedDiscoveryQuery) {
    if (!this.config.podcastIndexApiKey || !this.config.podcastIndexApiSecret) {
      return [];
    }
    if (query.type && query.type !== "all" && query.type !== "podcast") {
      return [];
    }

    const authDate = Math.floor(Date.now() / 1000).toString();
    const auth = createHash("sha1")
      .update(this.config.podcastIndexApiKey + this.config.podcastIndexApiSecret + authDate)
      .digest("hex");

    const url = new URL("https://api.podcastindex.org/api/1.0/search/byterm");
    url.searchParams.set("q", query.q);
    url.searchParams.set("max", String(Math.min(query.limit ?? 25, 100)));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": this.config.userAgent,
          "X-Auth-Date": authDate,
          "X-Auth-Key": this.config.podcastIndexApiKey,
          Authorization: auth
        }
      });
      if (!response.ok) {
        throw new Error(`PodcastIndex HTTP ${response.status}`);
      }
      const body = await response.json() as { feeds?: PodcastIndexFeed[] };
      return (body.feeds ?? [])
        .filter((feed) => feed.url)
        .map((feed): DiscoveredFeed => ({
          title: feed.title ?? feed.url ?? "Untitled podcast",
          description: feed.description,
          homepageUrl: feed.link,
          feedUrl: feed.url as string,
          kind: "podcast",
          provider: this.id,
          language: feed.language,
          imageUrl: feed.image,
          lastPublishedAt: feed.newestItemPublishTime ? new Date(feed.newestItemPublishTime * 1000).toISOString() : undefined,
          score: 0,
          confidence: 0.9,
          tags: [...Object.values(feed.categories ?? {}), "podcast"]
        }));
    } finally {
      clearTimeout(timeout);
    }
  }
}
