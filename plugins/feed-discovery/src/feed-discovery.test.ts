import { describe, expect, it } from "vitest";
import { dedupeFeeds } from "./dedupe.js";
import { discoverFeeds } from "./discovery.js";
import { parseFeedDocument } from "./feed-parsing.js";
import { renderDiscoveryOutput } from "./output/index.js";
import { WebCandidateFeedProbeProvider } from "./providers/web-feed-probe.js";
import { extractAlternateFeedLinks } from "./probe-site.js";
import { scoreFeed } from "./scoring.js";
import type { DiscoveredFeed, FeedDiscoveryProvider } from "./types.js";
import { assertSafeHttpUrl } from "./url-safety.js";

const baseFeed: DiscoveredFeed = {
  title: "MicroSaaS Ideas",
  description: "Ideas for indie SaaS founders",
  homepageUrl: "https://example.com",
  feedUrl: "https://example.com/feed.xml",
  kind: "blog",
  provider: "manual-curated",
  score: 0,
  confidence: 0.5,
  tags: ["microsaas", "saas"]
};

describe("feed parsing", () => {
  it("parses RSS feeds with sample items", () => {
    const result = parseFeedDocument("https://example.com/rss.xml", `<?xml version="1.0"?><rss version="2.0"><channel><title>MicroSaaS Ideas</title><link>https://example.com</link><item><title>Launch tiny products</title><link>https://example.com/post</link><pubDate>Tue, 09 Jun 2026 00:00:00 GMT</pubDate></item></channel></rss>`);

    expect(result.ok).toBe(true);
    expect(result.title).toBe("MicroSaaS Ideas");
    expect(result.sampleItems[0]).toMatchObject({ title: "Launch tiny products", url: "https://example.com/post" });
  });

  it("detects podcast RSS feeds from item enclosures", () => {
    const result = parseFeedDocument(
      "https://example.com/podcast.xml",
      `<?xml version="1.0"?><rss version="2.0"><channel><title>Audio Show</title><link>https://example.com</link><item><title>Episode 1</title><enclosure url="https://example.com/episode-1.mp3" type="audio/mpeg" length="12345" /></item></channel></rss>`
    );

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("podcast");
  });

  it("parses Atom and JSON Feed documents", () => {
    const atom = parseFeedDocument("https://example.com/atom.xml", `<feed><title>Atom Feed</title><entry><title>Entry</title><updated>2026-06-09T00:00:00Z</updated></entry></feed>`);
    const json = parseFeedDocument("https://example.com/feed.json", JSON.stringify({ version: "https://jsonfeed.org/version/1.1", title: "JSON Feed", items: [{ title: "Item", url: "https://example.com/item" }] }), "application/feed+json");

    expect(atom.ok).toBe(true);
    expect(json.ok).toBe(true);
  });
});

describe("site probing helpers", () => {
  it("extracts alternate feed links", () => {
    const links = extractAlternateFeedLinks(
      `<html><head><link rel="alternate" type="application/rss+xml" href="/rss.xml"><link rel="alternate" type="text/html" href="/plain"></head></html>`,
      "https://example.com/blog"
    );

    expect(links).toEqual(["https://example.com/rss.xml"]);
  });

  it("blocks private SSRF targets", async () => {
    await expect(assertSafeHttpUrl("http://127.0.0.1/feed")).rejects.toThrow(/Blocked internal/);
    await expect(assertSafeHttpUrl("http://[::]/feed")).rejects.toThrow(/Blocked internal/);
    await expect(assertSafeHttpUrl("http://[::ffff:192.168.1.10]/feed")).rejects.toThrow(/Blocked internal/);
    await expect(assertSafeHttpUrl("http://[::192.168.1.10]/feed")).rejects.toThrow(/Blocked internal/);
    await expect(assertSafeHttpUrl("file:///etc/passwd")).rejects.toThrow(/Unsupported URL protocol/);
  });

  it("ignores malformed configured candidate URLs", async () => {
    const provider = new WebCandidateFeedProbeProvider({
      cacheTtlSeconds: 60,
      maxProviders: 1,
      maxProbes: 1,
      requestTimeoutMs: 10,
      maxBodyBytes: 1024,
      userAgent: "test",
      opmlPaths: [],
      candidateUrls: ["not-a-url|micro"],
      podcastIndexApiKey: undefined,
      podcastIndexApiSecret: undefined
    });

    await expect(provider.search({ q: "micro" })).resolves.toEqual([]);
  });
});

describe("scoring, dedupe, and output", () => {
  it("scores relevant fresh feeds and dedupes canonical URLs", () => {
    const scored = scoreFeed({ ...baseFeed, lastPublishedAt: new Date().toISOString() }, { q: "microsaas" });
    const duplicate = { ...scored, feedUrl: "https://example.com/feed.xml?utm_source=test", score: scored.score - 0.1 };

    expect(scored.score).toBeGreaterThan(0.5);
    expect(dedupeFeeds([duplicate, scored])).toHaveLength(1);
  });

  it("renders JSON, OPML, and RSS outputs", () => {
    const response = { query: "microsaas", normalizedQuery: "microsaas", count: 1, providerErrors: [], results: [scoreFeed(baseFeed, { q: "microsaas" })] };

    expect(JSON.parse(renderDiscoveryOutput(response, "json"))).toMatchObject({ count: 1 });
    expect(renderDiscoveryOutput(response, "opml")).toContain("<opml");
    expect(renderDiscoveryOutput(response, "rss")).toContain("<rss");
  });
});

describe("discovery orchestration", () => {
  it("isolates provider failures", async () => {
    const okProvider: FeedDiscoveryProvider = {
      id: "ok-provider",
      name: "OK",
      enabledByDefault: true,
      requiresApiKey: false,
      async search() {
        return [baseFeed];
      }
    };
    const failingProvider: FeedDiscoveryProvider = {
      id: "broken-provider",
      name: "Broken",
      enabledByDefault: true,
      requiresApiKey: false,
      async search() {
        throw new Error("provider unavailable");
      }
    };

    const response = await discoverFeeds({ q: "microsaas", includeUnvalidated: true }, { providers: [failingProvider, okProvider] });

    expect(response.providerErrors).toEqual([{ provider: "broken-provider", error: "provider unavailable" }]);
    expect(response.results).toHaveLength(1);
  });

  it("enforces the requested freshness window", async () => {
    const provider: FeedDiscoveryProvider = {
      id: "freshness-provider",
      name: "Freshness",
      enabledByDefault: true,
      requiresApiKey: false,
      async search() {
        return [
          { ...baseFeed, feedUrl: "https://example.com/fresh.xml", lastPublishedAt: new Date(Date.now() - 5 * 86_400_000).toISOString() },
          { ...baseFeed, feedUrl: "https://example.com/stale.xml", lastPublishedAt: new Date(Date.now() - 60 * 86_400_000).toISOString() },
          { ...baseFeed, feedUrl: "https://example.com/unknown.xml", lastPublishedAt: undefined },
          { ...baseFeed, feedUrl: "https://example.com/invalid.xml", lastPublishedAt: "not-a-date" },
          { ...baseFeed, feedUrl: "https://example.com/future.xml", lastPublishedAt: new Date(Date.now() + 86_400_000).toISOString() }
        ];
      }
    };

    const response = await discoverFeeds(
      { q: "microsaas", freshnessDays: 30, includeUnvalidated: true },
      { providers: [provider] }
    );

    expect(response.results.map((feed) => feed.feedUrl)).toEqual(["https://example.com/fresh.xml"]);
  });
});
