/**
 * Lexical search over local context.
 *
 * The one rule that makes this different from grep: **results pass
 * authorization before any content is returned**. A search that leaked titles
 * of restricted documents would defeat the scoping model entirely, so the scope
 * filter runs before scoring, not after.
 *
 * Semantic and vector search are legitimate adapter concerns and are explicitly
 * out of core conformance — requiring an embedding model to find a refund policy
 * would put a model vendor in the critical path of a specification whose point
 * is that vendors are replaceable.
 */

import type { ContextStore, EffectiveScope, LoadedObject } from "./types.js";
import { authorize, unrestrictedScope } from "./permissions.js";
import { tokenize } from "./relevance.js";

export interface SearchOptions {
  scope?: EffectiveScope;
  limit?: number;
  /** Restrict to these types, e.g. ["policy", "sop"]. */
  types?: string[];
  tags?: string[];
  layer?: string;
}

export interface SearchHit {
  id: string;
  title?: string;
  type: string;
  layer?: string;
  authority?: string;
  score: number;
  /** Which fields matched, so a reader can tell a title hit from a body hit. */
  matched: string[];
  /** A short excerpt around the first content match. Never returned for unauthorized objects. */
  excerpt?: string;
  file?: string;
}

export function search(store: ContextStore, query: string, options: SearchOptions = {}): SearchHit[] {
  const scope = options.scope ?? unrestrictedScope();
  const tokens = tokenize(query);
  const phrase = query.trim().toLowerCase();
  const hits: SearchHit[] = [];

  for (const entry of store.objects) {
    if (!authorize(entry.object, scope).allowed) continue;
    if (options.types && !options.types.includes(entry.object.type)) continue;
    if (options.layer && entry.object.layer !== options.layer) continue;
    if (options.tags && !options.tags.some((tag) => entry.object.tags?.includes(tag))) continue;

    const hit = scoreEntry(entry, tokens, phrase);
    if (hit) hits.push(hit);
  }

  hits.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id < b.id ? -1 : 1));
  return options.limit === undefined ? hits : hits.slice(0, options.limit);
}

function scoreEntry(entry: LoadedObject, tokens: string[], phrase: string): SearchHit | null {
  const object = entry.object;
  const content = typeof object.content === "string" ? object.content : JSON.stringify(object.content ?? "");

  let score = 0;
  const matched: string[] = [];

  const field = (name: string, weight: number, text: string | undefined): void => {
    if (!text) return;
    const lower = text.toLowerCase();
    let hits = 0;
    for (const token of tokens) if (lower.includes(token)) hits += 1;
    // An exact phrase match is worth more than the same words scattered.
    if (phrase.length > 2 && lower.includes(phrase)) hits += 2;
    if (hits > 0) {
      score += hits * weight;
      matched.push(name);
    }
  };

  field("id", 5, object.id.replace(/[._-]/g, " "));
  field("title", 5, object.title);
  field("tags", 4, object.tags?.join(" "));
  field("summary", 3, object.summary);
  field("type", 2, object.type);
  field("content", 1, content);

  if (score === 0) return null;

  return {
    id: object.id,
    title: object.title,
    type: object.type,
    layer: object.layer,
    authority: object.authority,
    score,
    matched,
    excerpt: matched.includes("content") ? excerptOf(content, tokens, phrase) : undefined,
    file: entry.file
  };
}

function excerptOf(content: string, tokens: string[], phrase: string): string | undefined {
  const lower = content.toLowerCase();
  let index = phrase.length > 2 ? lower.indexOf(phrase) : -1;
  if (index === -1) {
    for (const token of tokens) {
      index = lower.indexOf(token);
      if (index !== -1) break;
    }
  }
  if (index === -1) return undefined;

  const start = Math.max(0, index - 60);
  const end = Math.min(content.length, index + 140);
  const slice = content.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${slice}${end < content.length ? "…" : ""}`;
}
