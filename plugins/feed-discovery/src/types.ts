export type FeedKind =
  | "blog"
  | "news"
  | "podcast"
  | "youtube"
  | "reddit"
  | "github"
  | "torrent"
  | "opml"
  | "rsshub"
  | "unknown";

export type FeedOutputFormat = "json" | "opml" | "rss" | "atom" | "json-feed";

export interface FeedDiscoveryQuery {
  q: string;
  type?: FeedKind | "all";
  limit?: number;
  locale?: string;
  freshnessDays?: number;
  includeDeadFeeds?: boolean;
  includeUnvalidated?: boolean;
  providers?: string[];
}

export interface DiscoveredFeed {
  id?: string;
  title: string;
  description?: string;
  homepageUrl?: string;
  feedUrl: string;
  canonicalFeedUrl?: string;
  kind: FeedKind;
  provider: string;
  language?: string;
  imageUrl?: string;
  lastPublishedAt?: string;
  score: number;
  confidence: number;
  freshnessScore?: number;
  keywordScore?: number;
  providerScore?: number;
  validationScore?: number;
  tags: string[];
  sampleItems?: FeedSampleItem[];
  isValid?: boolean;
}

export interface FeedSampleItem {
  title: string;
  url?: string;
  publishedAt?: string;
  description?: string;
}

export interface FeedDiscoveryProvider {
  id: string;
  name: string;
  enabledByDefault: boolean;
  requiresApiKey: boolean;
  search(query: FeedDiscoveryQuery): Promise<DiscoveredFeed[]>;
}

export interface FeedProviderManifest {
  id: string;
  name: string;
  type: FeedKind | "all";
  requiresApiKey: boolean;
  enabledByDefault: boolean;
  description: string;
}

export interface FeedDiscoveryResponse {
  query: string;
  normalizedQuery: string;
  count: number;
  providerErrors: Array<{ provider: string; error: string }>;
  results: DiscoveredFeed[];
}

export interface FeedDiscoveryConfig {
  cacheTtlSeconds: number;
  maxProviders: number;
  maxProbes: number;
  requestTimeoutMs: number;
  maxBodyBytes: number;
  userAgent: string;
  opmlPaths: string[];
  candidateUrls: string[];
  podcastIndexApiKey?: string;
  podcastIndexApiSecret?: string;
}

export interface ValidationResult {
  ok: boolean;
  feedUrl: string;
  canonicalFeedUrl?: string;
  title?: string;
  description?: string;
  homepageUrl?: string;
  kind: FeedKind;
  language?: string;
  imageUrl?: string;
  lastPublishedAt?: string;
  sampleItems: FeedSampleItem[];
  error?: string;
}

export interface ProbeResult {
  homepageUrl: string;
  feeds: DiscoveredFeed[];
  errors: string[];
}
