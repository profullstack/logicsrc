import { readFeedDiscoveryConfig } from "./config.js";
import { parseFeedDocument } from "./feed-parsing.js";
import { fetchTextWithGuards } from "./http.js";
import type { FeedDiscoveryConfig, ValidationResult } from "./types.js";
import { canonicalizeUrl } from "./url-safety.js";

export async function validateFeed(feedUrl: string, config: Partial<FeedDiscoveryConfig> = {}): Promise<ValidationResult> {
  const resolvedConfig = { ...readFeedDiscoveryConfig(), ...config };
  try {
    const response = await fetchTextWithGuards(feedUrl, resolvedConfig);
    const canonicalFeedUrl = canonicalizeUrl(response.url || feedUrl);
    const parsed = parseFeedDocument(canonicalFeedUrl, response.body, response.contentType);
    return {
      ...parsed,
      feedUrl,
      canonicalFeedUrl
    };
  } catch (error) {
    return {
      ok: false,
      feedUrl,
      kind: "unknown",
      sampleItems: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
