import type { FeedDiscoveryResponse, FeedOutputFormat } from "../types.js";
import { renderAtom } from "./atom.js";
import { renderJsonFeed } from "./json-feed.js";
import { renderOpml } from "./opml.js";
import { renderRss } from "./rss.js";

export function renderDiscoveryOutput(response: FeedDiscoveryResponse, format: FeedOutputFormat) {
  if (format === "opml") {
    return renderOpml(response);
  }
  if (format === "rss") {
    return renderRss(response);
  }
  if (format === "atom") {
    return renderAtom(response);
  }
  if (format === "json-feed") {
    return renderJsonFeed(response);
  }
  return JSON.stringify(response, null, 2);
}

export { renderAtom, renderJsonFeed, renderOpml, renderRss };
