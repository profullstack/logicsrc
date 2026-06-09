import type { FeedDiscoveryConfig } from "./types.js";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BODY_BYTES = 1_000_000;

export function readFeedDiscoveryConfig(env: NodeJS.ProcessEnv = process.env): FeedDiscoveryConfig {
  return {
    cacheTtlSeconds: readNumber(env.LOGICSRC_FEEDS_CACHE_TTL_SECONDS, 86_400),
    maxProviders: readNumber(env.LOGICSRC_FEEDS_MAX_PROVIDERS, 10),
    maxProbes: readNumber(env.LOGICSRC_FEEDS_MAX_PROBES, 50),
    requestTimeoutMs: readNumber(env.LOGICSRC_FEEDS_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxBodyBytes: readNumber(env.LOGICSRC_FEEDS_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES),
    userAgent: env.LOGICSRC_FEEDS_USER_AGENT || "LogicSrcFeedDiscovery/0.1",
    opmlPaths: splitList(env.LOGICSRC_FEEDS_OPML_PATHS),
    candidateUrls: splitList(env.LOGICSRC_FEEDS_CANDIDATE_URLS),
    podcastIndexApiKey: env.PODCASTINDEX_API_KEY,
    podcastIndexApiSecret: env.PODCASTINDEX_API_SECRET
  };
}

function readNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
