# LogicSRC Feed Discovery Plugin

Discover RSS, Atom, JSON Feed, podcast, and feed-like sources by keyword using a provider-based LogicSRC plugin.

## Install

This repository includes the plugin as a normal LogicSRC workspace plugin:

```bash
npm --workspace @logicsrc/plugin-feed-discovery run build
```

Consumers can import the runtime API:

```ts
import { discoverFeeds, renderRss } from "@logicsrc/plugin-feed-discovery";

const result = await discoverFeeds({ q: "microsaas", limit: 25 });
console.log(renderRss(result));
```

## CLI

```bash
logicsrc feeds discover "microsaas" --format json
logicsrc feeds discover "microsaas" --format opml
logicsrc feeds discover "microsaas" --format rss
logicsrc feeds discover "ai agents" --type podcast
logicsrc feeds validate https://example.com/feed.xml
logicsrc feeds probe https://example.com
logicsrc feeds providers
```

Validation is enabled by default. Use `--include-unvalidated` to inspect raw provider candidates without network validation.

## Providers

MVP providers:

- `manual-curated`: local high-trust starter feeds.
- `opml-directory`: local OPML files configured with `LOGICSRC_FEEDS_OPML_PATHS`.
- `web-feed-probe`: probes direct URL queries and configured candidate homepages from `LOGICSRC_FEEDS_CANDIDATE_URLS`.
- `itunes-podcast`: public iTunes podcast search.
- `podcastindex`: optional PodcastIndex search when `PODCASTINDEX_API_KEY` and `PODCASTINDEX_API_SECRET` are set.

Provider failures are isolated and returned as `providerErrors`; one failed provider does not fail the whole discovery request.

## HTTP Reference API

The CommandBoard reference API exposes:

```http
GET /api/feeds/discover?q=microsaas&type=all&limit=50
GET /api/feeds/providers
GET /rss/discover/microsaas.xml
GET /api/rss/discover?q=microsaas
```

BitTorrented can consume the plugin package directly and map its public routes to the same runtime calls:

- `/api/rss/discover?q=:keyword` -> `discoverFeeds()`
- `/rss/discover/:keyword.xml` -> `discoverFeeds()` plus `renderRss()`
- `/rss/discover/:keyword.opml` -> `discoverFeeds()` plus `renderOpml()`

## Configuration

```bash
LOGICSRC_FEEDS_CACHE_TTL_SECONDS=86400
LOGICSRC_FEEDS_MAX_PROVIDERS=10
LOGICSRC_FEEDS_MAX_PROBES=50
LOGICSRC_FEEDS_REQUEST_TIMEOUT_MS=8000
LOGICSRC_FEEDS_MAX_BODY_BYTES=1000000
LOGICSRC_FEEDS_USER_AGENT="LogicSrcFeedDiscovery/0.1"
LOGICSRC_FEEDS_OPML_PATHS="./data/feeds.opml,./data/podcasts.opml"
LOGICSRC_FEEDS_CANDIDATE_URLS="https://example.com|microsaas,https://another.example|ai agents"

PODCASTINDEX_API_KEY=
PODCASTINDEX_API_SECRET=
```

## Security

`validateFeed()` and `probeSite()` use guarded fetches:

- Only `http` and `https` URLs are allowed.
- `localhost`, loopback, private, link-local, carrier-grade NAT, and common metadata targets are blocked.
- DNS-resolved private/internal addresses are blocked.
- Redirects are limited and checked through the same guard.
- Request timeouts and response body size limits are enforced.

## Database

Supabase-compatible schema SQL is included at `src/db/schema.sql`. The current LogicSRC repo has no shared Supabase migration convention, so the plugin ships the schema for host applications to apply.

## Deferred v0.2 Work

- YouTube, Reddit, GitHub, and RSSHub adapters.
- Persistent cache and refresh jobs.
- Atom and JSON Feed public endpoints in host apps.
- Provider health dashboard and admin tooling.
- Paid provider adapters such as RSS.app, Feedly, Inoreader, Twingly, and Listen Notes.
