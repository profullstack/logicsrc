import type { DiscoveredFeed, FeedDiscoveryQuery } from "./types.js";

const PROVIDER_SCORES: Record<string, number> = {
  "manual-curated": 1,
  podcastindex: 0.9,
  "itunes-podcast": 0.85,
  "opml-directory": 0.75,
  "web-feed-probe": 0.7,
  rsshub: 0.7,
  reddit: 0.65,
  github: 0.65,
  youtube: 0.65,
  unknown: 0.3
};

export function scoreFeed(feed: DiscoveredFeed, query: FeedDiscoveryQuery): DiscoveredFeed {
  const keywordScore = feed.keywordScore ?? calculateKeywordScore(feed, query.q);
  const freshnessScore = feed.freshnessScore ?? calculateFreshnessScore(feed.lastPublishedAt);
  const providerScore = feed.providerScore ?? PROVIDER_SCORES[feed.provider] ?? PROVIDER_SCORES.unknown;
  const validationScore = feed.validationScore ?? (feed.isValid === false ? 0.2 : 1);
  const score = keywordScore * 0.4 + freshnessScore * 0.25 + providerScore * 0.2 + validationScore * 0.15;

  return {
    ...feed,
    score: round(score),
    confidence: round(Math.max(feed.confidence, score * validationScore)),
    freshnessScore: round(freshnessScore),
    keywordScore: round(keywordScore),
    providerScore: round(providerScore),
    validationScore: round(validationScore)
  };
}

export function calculateKeywordScore(feed: DiscoveredFeed, query: string) {
  const terms = normalizeTerms(query);
  if (terms.length === 0) {
    return 0.1;
  }

  const weightedText = [
    [feed.title, 0.35],
    [feed.description, 0.2],
    [feed.homepageUrl, 0.1],
    [feed.feedUrl, 0.05],
    [feed.tags.join(" "), 0.15],
    [feed.sampleItems?.map((item) => item.title).join(" "), 0.15]
  ] as const;

  let score = 0;
  for (const [value, weight] of weightedText) {
    const text = String(value ?? "").toLowerCase();
    if (!text) {
      continue;
    }
    const matches = terms.filter((term) => text.includes(term)).length;
    score += weight * (matches / terms.length);
  }

  return Math.min(1, Math.max(0.05, score));
}

export function calculateFreshnessScore(lastPublishedAt?: string) {
  if (!lastPublishedAt) {
    return 0.1;
  }
  const ageDays = (Date.now() - Date.parse(lastPublishedAt)) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < 0) {
    return 0.1;
  }
  if (ageDays <= 7) {
    return 1;
  }
  if (ageDays <= 30) {
    return 0.8;
  }
  if (ageDays <= 90) {
    return 0.6;
  }
  if (ageDays <= 365) {
    return 0.3;
  }
  return 0.1;
}

function normalizeTerms(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
