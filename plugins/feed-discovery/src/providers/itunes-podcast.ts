import type { DiscoveredFeed, FeedDiscoveryConfig, FeedDiscoveryProvider, FeedDiscoveryQuery } from "../types.js";

interface ITunesPodcast {
  collectionName?: string;
  artistName?: string;
  feedUrl?: string;
  collectionViewUrl?: string;
  artworkUrl600?: string;
  primaryGenreName?: string;
  releaseDate?: string;
}

export class ITunesPodcastProvider implements FeedDiscoveryProvider {
  id = "itunes-podcast";
  name = "iTunes Podcast Search";
  enabledByDefault = true;
  requiresApiKey = false;

  constructor(private readonly config: Pick<FeedDiscoveryConfig, "requestTimeoutMs" | "userAgent">) {}

  async search(query: FeedDiscoveryQuery) {
    if (query.type && query.type !== "all" && query.type !== "podcast") {
      return [];
    }

    const url = new URL("https://itunes.apple.com/search");
    url.searchParams.set("term", query.q);
    url.searchParams.set("entity", "podcast");
    url.searchParams.set("limit", String(Math.min(query.limit ?? 25, 50)));
    if (query.locale) {
      url.searchParams.set("country", query.locale.toUpperCase());
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "user-agent": this.config.userAgent }
      });
      if (!response.ok) {
        throw new Error(`iTunes HTTP ${response.status}`);
      }
      const body = await response.json() as { results?: ITunesPodcast[] };
      return (body.results ?? [])
        .filter((item) => item.feedUrl)
        .map((item): DiscoveredFeed => ({
          title: item.collectionName ?? item.feedUrl ?? "Untitled podcast",
          description: item.artistName,
          homepageUrl: item.collectionViewUrl,
          feedUrl: item.feedUrl as string,
          kind: "podcast",
          provider: this.id,
          imageUrl: item.artworkUrl600,
          lastPublishedAt: item.releaseDate,
          score: 0,
          confidence: 0.85,
          tags: [item.primaryGenreName, "podcast"].filter((tag): tag is string => Boolean(tag))
        }));
    } finally {
      clearTimeout(timeout);
    }
  }
}
