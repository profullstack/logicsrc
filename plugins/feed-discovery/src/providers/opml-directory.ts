import { readFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import type { DiscoveredFeed, FeedDiscoveryProvider, FeedDiscoveryQuery } from "../types.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text"
});

export class OpmlDirectoryProvider implements FeedDiscoveryProvider {
  id = "opml-directory";
  name = "OPML Directory";
  enabledByDefault = true;
  requiresApiKey = false;

  constructor(private readonly paths: string[] = []) {}

  async search(query: FeedDiscoveryQuery) {
    const feeds: DiscoveredFeed[] = [];
    for (const path of this.paths) {
      const content = await readFile(path, "utf8");
      const parsed = parser.parse(content) as unknown;
      for (const outline of collectOutlines(parsed)) {
        const feedUrl = stringValue(outline.xmlUrl);
        if (!feedUrl) {
          continue;
        }
        const title = stringValue(outline.title) || stringValue(outline.text) || feedUrl;
        const tags = [stringValue(outline.category)].filter((tag): tag is string => Boolean(tag));
        const feed: DiscoveredFeed = {
          title,
          description: stringValue(outline.description),
          homepageUrl: stringValue(outline.htmlUrl),
          feedUrl,
          kind: inferKind(tags.join(" "), query.type),
          provider: this.id,
          score: 0,
          confidence: 0.7,
          tags
        };
        if (matches(feed, query)) {
          feeds.push(feed);
        }
      }
    }
    return feeds;
  }
}

function collectOutlines(value: unknown): Array<Record<string, unknown>> {
  if (!isRecord(value)) {
    return [];
  }
  const current = "xmlUrl" in value ? [value] : [];
  return [
    ...current,
    ...Object.values(value).flatMap((entry) => {
      if (Array.isArray(entry)) {
        return entry.flatMap(collectOutlines);
      }
      return collectOutlines(entry);
    })
  ];
}

function matches(feed: DiscoveredFeed, query: FeedDiscoveryQuery) {
  if (query.type && query.type !== "all" && feed.kind !== query.type) {
    return false;
  }
  const terms = query.q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const haystack = [feed.title, feed.description, feed.homepageUrl, feed.feedUrl, feed.tags.join(" ")].join(" ").toLowerCase();
  return terms.length === 0 || terms.some((term) => haystack.includes(term));
}

function inferKind(tags: string, requested?: FeedDiscoveryQuery["type"]) {
  if (requested && requested !== "all") {
    return requested;
  }
  if (tags.includes("podcast")) {
    return "podcast";
  }
  return "opml";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
