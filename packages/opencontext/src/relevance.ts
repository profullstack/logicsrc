/**
 * Task relevance ranking.
 *
 * Ranking decides *order* and, when a limit is set, what gets trimmed. It never
 * decides access — by the time anything reaches this module the candidates have
 * already been authorized, so a high-scoring object the consumer may not read
 * does not exist here at all.
 *
 * The scorer is lexical on purpose. Semantic search is a legitimate adapter
 * concern, but requiring an embedding model to resolve context would make
 * resolution non-deterministic and would put a model vendor in the path of a
 * specification whose whole point is that agents are replaceable.
 */

import type { ContextObject, Layer } from "./types.js";

/**
 * Layers that stay in the bundle even when the task does not mention them.
 *
 * Mission and identity are what an agent needs in order to behave like it works
 * here rather than anywhere; dropping them because a ticket did not name them
 * is how a replacement agent loses the organization's voice.
 */
const LAYER_FLOOR: Partial<Record<Layer, number>> = {
  L0: 10,
  L1: 6
};

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "at", "by", "with", "from",
  "is", "are", "was", "were", "be", "been", "it", "its", "this", "that", "these", "those",
  "please", "can", "you", "we", "i", "how", "what", "when", "why", "do", "does", "did"
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export interface RelevanceScore {
  score: number;
  /** Which fields matched, for `--explain`. */
  matched: string[];
}

/**
 * Score one object against a task.
 *
 * With no task every object scores equally and ordering falls back to layer and
 * authority, which keeps `resolve` with no `--task` fully deterministic.
 */
export function scoreRelevance(object: ContextObject, taskTokens: string[]): RelevanceScore {
  const floor = LAYER_FLOOR[object.layer ?? ("L2" as Layer)] ?? 0;
  if (taskTokens.length === 0) return { score: floor, matched: [] };

  let score = floor;
  const matched: string[] = [];

  const add = (field: string, weight: number, haystack: string | undefined): void => {
    if (!haystack) return;
    const text = haystack.toLowerCase();
    let hits = 0;
    for (const token of taskTokens) {
      if (text.includes(token)) hits += 1;
    }
    if (hits > 0) {
      score += hits * weight;
      matched.push(field);
    }
  };

  // `applies_to` is the strongest signal: it is the author saying, explicitly,
  // what this context is for.
  add("applies_to", 6, object.applies_to?.join(" "));
  add("tags", 4, object.tags?.join(" "));
  add("title", 4, object.title);
  add("id", 3, object.id.replace(/[._-]/g, " "));
  add("summary", 2, object.summary);
  add("type", 2, object.type);

  // Content is weighted lowest and capped: a long document should not outrank a
  // precisely-titled one just by containing more words.
  const content = typeof object.content === "string" ? object.content : undefined;
  if (content) {
    const text = content.slice(0, 4000).toLowerCase();
    let hits = 0;
    for (const token of taskTokens) {
      if (text.includes(token)) hits += 1;
    }
    if (hits > 0) {
      score += Math.min(hits, 4);
      matched.push("content");
    }
  }

  return { score, matched };
}

/**
 * Deterministic bundle ordering: layer, then authority, then id.
 *
 * Relevance decides what is *kept*; this decides what a reader sees first.
 * Ordering by layer means a bundle always opens with mission and closes with
 * transient operational state, whatever the task was.
 */
export function compareForBundle(
  a: ContextObject,
  b: ContextObject,
  authorityRankOf: (object: ContextObject) => number
): number {
  const layerA = a.layer ?? "L2";
  const layerB = b.layer ?? "L2";
  if (layerA !== layerB) return layerA < layerB ? -1 : 1;

  const authority = authorityRankOf(a) - authorityRankOf(b);
  if (authority !== 0) return authority;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
