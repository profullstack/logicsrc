# OpenSite

OpenSite is one record about a page or a site: what a careful reader concluded about one URL, or what the site says about itself, in a shape every index agrees on. A chat app, a social network and a search engine each read a page's metadata to draw a card, each a little differently, each caching what it read, none publishing what it got. OpenSite writes the reading down, so a site can say what it is and an index can hand a reading to anyone instead of scraping again. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of the records [nichedb.dev](https://nichedb.dev/c/sites) keeps and the cards [nixamp](https://nixamp.com) serves on its share links, published so any site can declare its own records and any index can read them.

Slug: `opensite`

## The problem

Every link pasted into a chat becomes a card, and the card is drawn from tags the page carries for that purpose: a title, a line, a picture. The tags are read by a dozen consumers with a dozen readings, and every consumer caches its first reading for days. A site that fixes its card cannot tell them. An index that scraped a page well cannot share what it found except as another scrape. And a site that knows exactly what a page is, because it made the page, has no way to say so beyond hoping the scraper guesses right. The result is a web full of readings that nobody publishes and everybody repeats.

## Terms

- A **page** is one URL that answers. A **site** is an origin and what it says about itself.
- A **record** is what is known about one page: the OpenSite reading of it.
- A **descriptor** is the file a site serves about itself at `/.well-known/opensite.json`.
- A **reader** is anything that takes a record from a page by the reading rules below.
- An **index** is a reader that keeps records and offers them back.
- A **consumer** is anything that draws a card from a page: a chat app, a social network, a search engine.
- A record is **declared** when the site published it, and **read** when a reader derived it.

## Two documents

### The record

One JSON object per URL. This is the unit an index stores and a card is drawn from.

```json
{
  "opensite": "0.1",
  "url": "https://nixamp.com/?url=https%3A%2F%2Fserver1.chovy.nixamp.com%3A4321%2Fview%2FJV5m&play=channel%3Aurl-6f4152c1590e",
  "canonical": "https://nixamp.com/?url=https%3A%2F%2Fserver1.chovy.nixamp.com%3A4321%2Fview%2FJV5m&play=channel%3Aurl-6f4152c1590e",
  "site": { "name": "nixamp", "web": "https://nixamp.com" },
  "kind": "stream",
  "title": "Inspiring Founders Podcast",
  "description": "Inspiring Founders Podcast is live on server1. Tune in free on nixamp, no account needed.",
  "image": { "url": "https://d3t3ozftmdmh3i.cloudfront.net/.../44567180.jpg", "width": 3000, "height": 3000, "alt": "Inspiring Founders Podcast" },
  "language": "en",
  "author": { "name": "chovy", "profile": "https://nixamp.com/~chovy/OpenProfile.md" },
  "tags": ["podcast", "live"],
  "feeds": [],
  "published_at": null,
  "modified_at": null,
  "fetched_at": "2026-09-13T04:52:10Z",
  "status": "live",
  "source": "read",
  "cards": {
    "og": { "title": "Inspiring Founders Podcast", "type": "website", "image": "https://d3t3ozftmdmh3i.cloudfront.net/.../44567180.jpg" },
    "twitter": { "card": "summary" }
  },
  "jsonld": []
}
```

| key | required | meaning |
| --- | --- | --- |
| `opensite` | yes | The spec version this record follows. |
| `url` | yes | The address that was asked about, exactly as given. |
| `canonical` | yes | The address the page names as its own (`rel=canonical`, else `og:url`, else `url` after redirects). Records are keyed by this. |
| `site` | yes | `name` and `web` (the origin). From the site's descriptor when it has one, else `og:site_name` and the origin. |
| `kind` | yes | One of `site`, `page`, `article`, `profile`, `product`, `event`, `video`, `audio`, `podcast`, `episode`, `stream`, `feed`, `other`. |
| `title` | yes | What to call it. May be empty when nothing on the page says. |
| `description` | no | One or two lines about it. |
| `image` | no | A picture a card can show: `url` (http or https only), and `width`, `height`, `alt` when known. |
| `language` | no | BCP 47, from `<html lang>` or `og:locale`. |
| `author` | no | `name` and, when the page names one, an [OpenProfile](/docs/openprofile) URL under `profile`. |
| `tags` | no | Short words, lower case. |
| `feeds` | no | RSS, Atom or JSON Feed addresses the page links to. |
| `published_at`, `modified_at` | no | ISO 8601, from JSON-LD, `article:published_time` or the like. `null` when unknown. |
| `fetched_at` | yes | When this reading was taken. |
| `status` | yes | `live`, `gone` (404 or 410), `moved` (a redirect to another origin or path; `canonical` says where) or `blocked` (the site refused the read). |
| `source` | yes | `declared` when the site published this record itself; `read` when an indexer derived it from the page. |
| `cards` | no | What the page's own card tags said, verbatim and unmerged: `og`, `twitter`, and any other prefix, each a flat object. Kept so a consumer can see what a scraper saw. |
| `jsonld` | no | The page's JSON-LD blocks, as parsed, unmodified. |

Anything a reader does not understand is ignored. A record is never bigger than 256 KB; `jsonld` is the first thing cut to fit.

### The descriptor

What a site says about itself as a whole, at `/.well-known/opensite.json`.

```json
{
  "opensite": "0.1",
  "site": {
    "name": "nixamp",
    "web": "https://nixamp.com",
    "description": "Broadcast live radio, TV and film from your own machine.",
    "image": "https://nixamp.com/hero.png",
    "icon": "https://nixamp.com/icons/icon-512.png",
    "language": "en",
    "operator": "https://nixamp.com/~chovy/OpenProfile.md",
    "kinds": ["stream", "page"],
    "feeds": ["https://nixamp.com/feed.xml"],
    "sitemaps": ["https://nixamp.com/sitemap.xml"]
  },
  "index": {
    "allow": true,
    "refresh": 3600,
    "records": "https://nixamp.com/opensite/records.jsonl",
    "contact": "mailto:hi@nixamp.com"
  }
}
```

`site` is what a card falls back to when a page says nothing: its name, a line, a picture. `operator` is who runs it, as an OpenProfile. `kinds` says what kinds of record the site publishes, so an index knows what to expect.

`index.allow` is whether the site wants to be read at all; `false` is honoured like a robots rule. `refresh` is how often, in seconds, a record is worth reading again. `records`, when present, is a JSON Lines file of the site's own records, one per line, which an index may take instead of reading every page. `contact` is where to write about the index.

A single page may also point at its own record with `<link rel="opensite" href="…">` or `Link: <…>; rel="opensite"`. A declared record wins over a read one when both exist and the declared one is fresher.

## Reading a page

This is the part every scraper already does and nobody wrote down. An OpenSite reader takes a record from a page like this, in this order, first answer wins for each key.

1. **Fetch.** `GET` the URL with `Accept: text/html`, a user agent that names the reader and a URL where its policy is published (`OpenSite/0.1 (+https://…)`), following at most five redirects, reading at most 2 MB, within 15 seconds. Send `If-None-Match` and `If-Modified-Since` when a previous reading has them. A response that is not HTML is a record of kind `video`, `audio`, `feed` or `other` by its content type, with no card tags.
2. **Refuse politely.** `robots.txt` applies. A descriptor with `index.allow: false` applies. Either makes a record with `status: blocked` and nothing else.
3. **Canonical.** `<link rel="canonical">`, else `og:url`, else the final URL after redirects. A canonical on another origin is `status: moved`.
4. **Title.** JSON-LD `headline` or `name`, else `og:title`, else `twitter:title`, else `<title>`.
5. **Description.** JSON-LD `description`, else `og:description`, else `twitter:description`, else `<meta name="description">`.
6. **Image.** `og:image` (with `og:image:width`, `og:image:height`, `og:image:alt` when given), else `twitter:image`, else JSON-LD `image`, else the largest `rel="icon"` or `apple-touch-icon`. Only http or https. A relative address is resolved against the page. A reader that fetches the image records its real size.
7. **Kind.** From JSON-LD `@type` (Article, NewsArticle, BlogPosting are `article`; Person is `profile`; Product; Event; VideoObject `video`; AudioObject `audio`; PodcastSeries `podcast`; PodcastEpisode `episode`; BroadcastEvent `stream`; WebSite `site`), else `og:type` (`article`, `profile`, `product`, `video.*` to `video`, `music.*` to `audio`, `website` to `page`), else `page`.
8. **Author.** JSON-LD `author.name` or `article:author`, else `<meta name="author">`. A `rel="me"` or `rel="author"` link to an `OpenProfile.md` is the `profile`.
9. **Dates.** JSON-LD `datePublished` / `dateModified`, else `article:published_time` / `article:modified_time`.
10. **Feeds.** Every `<link rel="alternate">` whose type is RSS, Atom or JSON Feed.
11. **Language.** `<html lang>`, else `og:locale`.
12. **Cards.** Every `<meta property="og:…">`, `<meta name="twitter:…">` and any other `prefix:name` pair, kept verbatim under `cards.<prefix>`.
13. **JSON-LD.** Every `<script type="application/ld+json">` that parses, kept as parsed.

`fetched_at` is now. `source` is `read`. A page that answers 404 or 410 is `status: gone`, keeps its last known `title`, and loses its `image`.

## Publishing a record

An index that holds records offers them back the same way it got them:

- `GET /api/v1/sites?url=<url>` answers the record for that URL, reading the page first when it has none or its reading is older than the site's `refresh`.
- `POST /api/v1/sites` with `{ "url": "…" }` reads the page now and answers the record. This is what a "paste a URL" tool calls.
- `GET /api/v1/sites/<domain>/<path>` answers the record at that address, and `GET /api/v1/sites/<domain>` the site's records, newest first.
- Each record has a page a person can open at `/c/sites/<domain>/<path>` that shows the record, the card tags as read, and the card as each consumer would draw it.

A record an index publishes carries `source` as it was, never rewritten to `declared`.

## How consumers draw a card

The reason a record keeps `cards` verbatim is that the consumers do not agree, and a person checking a card wants to see what each one will do. Observed on 2026-09-13; consumers change, and this table is a reader's guide, not a promise.

| consumer | reads | picture | caches |
| --- | --- | --- | --- |
| X | `twitter:*`, falls back to `og:*` | `summary`: square thumbnail beside the text; `summary_large_image`: wide picture above it; picture under 5 MB | per URL, about a week; no way to flush from outside |
| Slack | `og:*`, then `twitter:*`, then `<title>` and description | shows `og:image` when the page is not itself a media file; under 5 MB | per URL, about 30 days; a changed URL is a new read |
| iMessage | `og:*`, then `<title>`, then `apple-touch-icon` | `og:image`; a square picture is shown as a square, a wide one wide | per URL on the device; not shared between devices |
| Discord | `og:*`, `twitter:*`, `oEmbed`, colour from `theme-color` | `og:image`, or `twitter:card` `summary_large_image` for a wide one | per URL for hours |
| LinkedIn | `og:*` | `og:image`, wants at least 1200 by 627 for a wide card, under 5 MB | per URL about a week; the Post Inspector re-reads on request |
| WhatsApp | `og:*` | `og:image`, reads only the first part of the page, so tags belong at the top of `<head>` | per URL on the device |
| Facebook | `og:*` | `og:image`, wants `og:image:width` and `og:image:height` on first share or the first share has no picture | per URL; the Sharing Debugger re-reads on request |
| Google | JSON-LD, `<title>`, `<meta name="description">` | from JSON-LD `image` | on its own schedule |

Two rules follow from the table. Put the card tags in the first few kilobytes of the page, before anything else in `<head>`. And when a consumer has cached a wrong card, the only certain fix is a URL it has not seen: a query parameter it ignores is enough.

## Conformance

- **Reader.** Follows the reading order above, names itself in its user agent, honours `robots.txt` and `index.allow`, and produces records with every required key.
- **Publisher.** Serves `/.well-known/opensite.json` with `site.name` and `site.web`, and either serves `records` or lets its pages be read.
- **Index.** Is a reader, keys records by `canonical`, offers the four calls under "Publishing a record", and shows each record on a page a person can open.

## Reference implementation

[nichedb.dev](https://nichedb.dev) is an index: `c/sites/<domain>/<path>` holds the records, `/api/v1/sites` is the API, and a paste-a-URL page reads any address and shows what every consumer would draw. [nixamp](https://nixamp.com) publishes a card for every live channel on a share link, which is where this spec came from: a card that read "server1" with no picture, fixed, then cached wrong by the first app it was pasted into.

## Related

- [OpenProfile](/docs/openprofile) for who a page's `author` and a site's `operator` are.
- [OpenAccess](/docs/openaccess) for who may edit a declared record.
- [OpenBroadcast](/docs/openbroadcast) for what a `stream` record points at.
