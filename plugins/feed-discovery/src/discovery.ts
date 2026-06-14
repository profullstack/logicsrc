import slugify from "slugify";
import { readFeedDiscoveryConfig } from "./config.js";
import { dedupeFeeds } from "./dedupe.js";
import { createDefaultFeedProviders } from "./providers/index.js";
import { scoreFeed } from "./scoring.js";
import type { DiscoveredFeed, FeedDiscoveryConfig, FeedDiscoveryProvider, FeedDiscoveryQuery, FeedDiscoveryResponse } from "./types.js";
import { canonicalizeUrl } from "./url-safety.js";
import { validateFeed } from "./validate-feed.js";

export async function discoverFeeds(query: FeedDiscoveryQuery, options: { providers?: FeedDiscoveryProvider[]; config?: Partial<FeedDiscoveryConfig> } = {}): Promise<FeedDiscoveryResponse> {
  const config = { ...readFeedDiscoveryConfig(), ...options.config };
  const normalizedQuery = normalizeQuery(query.q);
  const resolvedQuery: FeedDiscoveryQuery = {
    ...query,
    q: query.q.trim(),
    type: query.type ?? "all",
    limit: clampLimit(query.limit),
    freshnessDays: normalizeFreshnessDays(query.freshnessDays),
    includeUnvalidated: query.includeUnvalidated ?? false,
    includeDeadFeeds: query.includeDeadFeeds ?? false
  };

  const providers = (options.providers ?? createDefaultFeedProviders(config))
    .filter((provider) => provider.enabledByDefault || provider.id === "podcastindex")
    .filter((provider) => !resolvedQuery.providers?.length || resolvedQuery.providers.includes(provider.id))
    .slice(0, config.maxProviders);

  const settled = await Promise.all(providers.map(async (provider) => {
    try {
      return {
        provider: provider.id,
        results: await provider.search(resolvedQuery),
        error: undefined
      };
    } catch (error) {
      return {
        provider: provider.id,
        results: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }));

  const providerErrors: FeedDiscoveryResponse["providerErrors"] = [];
  const candidates: DiscoveredFeed[] = [];

  for (const result of settled) {
    if (result.error) {
      providerErrors.push({ provider: result.provider, error: result.error });
      continue;
    }
    candidates.push(...result.results.map((feed) => ({ ...feed, provider: feed.provider || result.provider })));
  }

  const validated = await validateCandidates(candidates.slice(0, Math.max((resolvedQuery.limit ?? 25) * 2, 25)), resolvedQuery, config);
  const scored = validated
    .filter((feed) => !resolvedQuery.type || resolvedQuery.type === "all" || feed.kind === resolvedQuery.type)
    .filter((feed) => isWithinFreshnessWindow(feed.lastPublishedAt, resolvedQuery.freshnessDays))
    .map((feed) => scoreFeed(feed, resolvedQuery));
  const results = dedupeFeeds(scored).slice(0, resolvedQuery.limit ?? 25);

  return {
    query: query.q,
    normalizedQuery,
    count: results.length,
    providerErrors,
    results
  };
}

async function validateCandidates(candidates: DiscoveredFeed[], query: FeedDiscoveryQuery, config: FeedDiscoveryConfig) {
  if (query.includeUnvalidated) {
    return candidates.map((feed) => ({
      ...feed,
      canonicalFeedUrl: safeCanonical(feed.feedUrl),
      isValid: feed.isValid ?? false,
      validationScore: feed.validationScore ?? 0.4
    }));
  }

  const feeds: DiscoveredFeed[] = [];
  for (const candidate of candidates) {
    const validation = await validateFeed(candidate.feedUrl, config);
    if (!validation.ok && !query.includeDeadFeeds) {
      continue;
    }
    feeds.push({
      ...candidate,
      title: validation.title ?? candidate.title,
      description: validation.description ?? candidate.description,
      homepageUrl: validation.homepageUrl ?? candidate.homepageUrl,
      canonicalFeedUrl: validation.canonicalFeedUrl ?? safeCanonical(candidate.feedUrl),
      kind: validation.ok && validation.kind !== "unknown" ? validation.kind : candidate.kind,
      language: validation.language ?? candidate.language,
      imageUrl: validation.imageUrl ?? candidate.imageUrl,
      lastPublishedAt: validation.lastPublishedAt ?? candidate.lastPublishedAt,
      sampleItems: validation.sampleItems.length ? validation.sampleItems : candidate.sampleItems,
      isValid: validation.ok,
      validationScore: validation.ok ? 1 : 0.2
    });
  }
  return feeds;
}

function normalizeQuery(query: string) {
  return slugify(query.trim().toLowerCase(), { lower: true, strict: true }) || "feeds";
}

function clampLimit(limit: number | undefined) {
  if (!limit) {
    return 25;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

function normalizeFreshnessDays(freshnessDays: number | undefined) {
  return typeof freshnessDays === "number" && Number.isFinite(freshnessDays) && freshnessDays > 0
    ? freshnessDays
    : undefined;
}

function isWithinFreshnessWindow(lastPublishedAt: string | undefined, freshnessDays: number | undefined) {
  if (freshnessDays === undefined) {
    return true;
  }
  if (!lastPublishedAt) {
    return false;
  }
  const ageMs = Date.now() - Date.parse(lastPublishedAt);
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= freshnessDays * 86_400_000;
}

function safeCanonical(url: string) {
  try {
    return canonicalizeUrl(url);
  } catch {
    return url;
  }
}
