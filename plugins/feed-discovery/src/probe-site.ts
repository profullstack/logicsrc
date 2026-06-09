import * as cheerio from "cheerio";
import { readFeedDiscoveryConfig } from "./config.js";
import { fetchTextWithGuards } from "./http.js";
import type { DiscoveredFeed, FeedDiscoveryConfig, ProbeResult } from "./types.js";
import { canonicalizeUrl } from "./url-safety.js";
import { validateFeed } from "./validate-feed.js";

const COMMON_FEED_PATHS = [
  "/feed",
  "/rss",
  "/rss.xml",
  "/atom.xml",
  "/index.xml",
  "/feed.xml",
  "/blog/feed",
  "/blog/rss.xml",
  "/news/feed",
  "/posts/feed"
];

const FEED_MIME_PATTERN = /(rss|atom|feed\+json|xml)/i;

export async function probeSite(homepageUrl: string, config: Partial<FeedDiscoveryConfig> = {}): Promise<ProbeResult> {
  const resolvedConfig = { ...readFeedDiscoveryConfig(), ...config };
  const errors: string[] = [];
  const candidates = new Set<string>();
  const canonicalHomepage = canonicalizeUrl(homepageUrl);

  try {
    const response = await fetchTextWithGuards(canonicalHomepage, resolvedConfig);
    for (const href of extractAlternateFeedLinks(response.body, response.url || canonicalHomepage)) {
      candidates.add(href);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const homepage = new URL(canonicalHomepage);
  for (const path of COMMON_FEED_PATHS) {
    candidates.add(new URL(path, homepage.origin).toString());
  }

  const feeds: DiscoveredFeed[] = [];
  for (const candidate of [...candidates].slice(0, resolvedConfig.maxProbes)) {
    const validation = await validateFeed(candidate, resolvedConfig);
    if (!validation.ok) {
      if (validation.error) {
        errors.push(`${candidate}: ${validation.error}`);
      }
      continue;
    }

    feeds.push({
      title: validation.title ?? candidate,
      description: validation.description,
      homepageUrl: validation.homepageUrl ?? canonicalHomepage,
      feedUrl: candidate,
      canonicalFeedUrl: validation.canonicalFeedUrl,
      kind: validation.kind,
      provider: "web-feed-probe",
      language: validation.language,
      imageUrl: validation.imageUrl,
      lastPublishedAt: validation.lastPublishedAt,
      score: 0,
      confidence: 0.8,
      tags: [],
      sampleItems: validation.sampleItems,
      isValid: true,
      validationScore: 1
    });
  }

  return {
    homepageUrl: canonicalHomepage,
    feeds,
    errors
  };
}

export function extractAlternateFeedLinks(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $("link[rel~='alternate']").each((_, element) => {
    const type = String($(element).attr("type") ?? "");
    const href = $(element).attr("href");
    if (href && FEED_MIME_PATTERN.test(type)) {
      links.push(canonicalizeUrl(href, baseUrl));
    }
  });

  return [...new Set(links)];
}
