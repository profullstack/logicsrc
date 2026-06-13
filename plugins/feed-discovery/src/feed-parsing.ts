import { XMLParser } from "fast-xml-parser";
import type { FeedKind, FeedSampleItem, ValidationResult } from "./types.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text",
  cdataPropName: "text",
  removeNSPrefix: true
});

export function parseFeedDocument(feedUrl: string, body: string, contentType = ""): ValidationResult {
  const trimmed = body.trim();
  if (!trimmed) {
    return invalid(feedUrl, "Empty feed body");
  }

  if (contentType.includes("json") || trimmed.startsWith("{")) {
    return parseJsonFeed(feedUrl, trimmed);
  }

  try {
    const document = parser.parse(trimmed) as unknown;
    if (!isRecord(document)) {
      return invalid(feedUrl, "Feed did not parse as an object");
    }

    if (isRecord(document.rss)) {
      return parseRss(feedUrl, document.rss);
    }
    if (isRecord(document.feed)) {
      return parseAtom(feedUrl, document.feed);
    }
    return invalid(feedUrl, "Document is not RSS, Atom, or JSON Feed");
  } catch (error) {
    return invalid(feedUrl, error instanceof Error ? error.message : String(error));
  }
}

function parseJsonFeed(feedUrl: string, body: string): ValidationResult {
  try {
    const document = JSON.parse(body) as unknown;
    if (!isRecord(document) || typeof document.version !== "string" || !document.version.includes("jsonfeed")) {
      return invalid(feedUrl, "JSON document is not JSON Feed");
    }

    const items = asArray(document.items).filter(isRecord);
    const sampleItems = items.slice(0, 5).map((item) => ({
      title: stringValue(item.title) || stringValue(item.url) || "Untitled item",
      url: stringValue(item.url),
      publishedAt: stringValue(item.date_published),
      description: stringValue(item.summary) || stringValue(item.content_text)
    }));

    const title = stringValue(document.title);
    if (!title && sampleItems.length === 0) {
      return invalid(feedUrl, "Feed has no title or items");
    }

    return {
      ok: true,
      feedUrl,
      canonicalFeedUrl: feedUrl,
      title: title || "Untitled JSON Feed",
      description: stringValue(document.description),
      homepageUrl: stringValue(document.home_page_url),
      kind: "blog",
      imageUrl: stringValue(document.icon) || stringValue(document.favicon),
      lastPublishedAt: newestDate(sampleItems.map((item) => item.publishedAt)),
      sampleItems
    };
  } catch (error) {
    return invalid(feedUrl, error instanceof Error ? error.message : String(error));
  }
}

function parseRss(feedUrl: string, rss: Record<string, unknown>): ValidationResult {
  const channel = isRecord(rss.channel) ? rss.channel : rss;
  const items = asArray(channel.item).filter(isRecord);
  const sampleItems = items.slice(0, 5).map((item) => ({
    title: stringValue(item.title) || stringValue(item.guid) || "Untitled item",
    url: linkValue(item.link) || stringValue(item.guid),
    publishedAt: stringValue(item.pubDate) || stringValue(item.published) || stringValue(item.updated),
    description: stringValue(item.description)
  }));

  const title = stringValue(channel.title);
  if (!title && sampleItems.length === 0) {
    return invalid(feedUrl, "RSS feed has no title or items");
  }

  return {
    ok: true,
    feedUrl,
    canonicalFeedUrl: feedUrl,
    title: title || "Untitled RSS Feed",
    description: stringValue(channel.description),
    homepageUrl: linkValue(channel.link),
    kind: detectRssKind(channel, items),
    language: stringValue(channel.language),
    imageUrl: imageValue(channel.image),
    lastPublishedAt: newestDate([stringValue(channel.lastBuildDate), stringValue(channel.pubDate), ...sampleItems.map((item) => item.publishedAt)]),
    sampleItems
  };
}

function parseAtom(feedUrl: string, feed: Record<string, unknown>): ValidationResult {
  const entries = asArray(feed.entry).filter(isRecord);
  const sampleItems = entries.slice(0, 5).map((entry) => ({
    title: stringValue(entry.title) || "Untitled item",
    url: atomLink(entry.link),
    publishedAt: stringValue(entry.published) || stringValue(entry.updated),
    description: stringValue(entry.summary) || stringValue(entry.content)
  }));

  const title = stringValue(feed.title);
  if (!title && sampleItems.length === 0) {
    return invalid(feedUrl, "Atom feed has no title or entries");
  }

  return {
    ok: true,
    feedUrl,
    canonicalFeedUrl: feedUrl,
    title: title || "Untitled Atom Feed",
    description: stringValue(feed.subtitle),
    homepageUrl: atomLink(feed.link),
    kind: "blog",
    language: stringValue(feed.lang),
    lastPublishedAt: newestDate([stringValue(feed.updated), ...sampleItems.map((item) => item.publishedAt)]),
    sampleItems
  };
}

function detectRssKind(channel: Record<string, unknown>, items: Record<string, unknown>[]): FeedKind {
  if (channel.itunes || channel["itunes:author"] || channel.enclosure) {
    return "podcast";
  }
  const hasMediaEnclosure = items.some((item) =>
    asArray(item.enclosure)
      .filter(isRecord)
      .some((enclosure) => {
        const type = stringValue(enclosure.type)?.toLowerCase();
        return type?.startsWith("audio/") || type?.startsWith("video/");
      })
  );
  if (hasMediaEnclosure) {
    return "podcast";
  }
  return "blog";
}

function imageValue(value: unknown) {
  if (isRecord(value)) {
    return stringValue(value.url);
  }
  return undefined;
}

function atomLink(value: unknown) {
  const links = asArray(value).filter(isRecord);
  const alternate = links.find((link) => stringValue(link.rel) === "alternate") ?? links[0];
  return alternate ? stringValue(alternate.href) : stringValue(value);
}

function linkValue(value: unknown) {
  if (isRecord(value)) {
    return stringValue(value.href) || stringValue(value.text);
  }
  return stringValue(value);
}

function stringValue(value: unknown) {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (isRecord(value) && typeof value.text === "string") {
    return value.text.trim() || undefined;
  }
  return undefined;
}

function newestDate(values: Array<string | undefined>) {
  const timestamps = values
    .map((value) => (value ? Date.parse(value) : NaN))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) {
    return undefined;
  }
  return new Date(Math.max(...timestamps)).toISOString();
}

function invalid(feedUrl: string, error: string): ValidationResult {
  return {
    ok: false,
    feedUrl,
    kind: "unknown",
    sampleItems: [],
    error
  };
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value === undefined || value === null ? [] : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
