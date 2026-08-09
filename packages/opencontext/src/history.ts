/**
 * History and diff.
 *
 * Two sources of history exist and they answer different questions. The
 * *declared* history — versions and supersession chains inside the context
 * itself — answers "what did this organization consider true, and when did that
 * change". Git answers "who edited the file". Both are reported, and the
 * declared history is authoritative, because renaming a file should not look
 * like a policy change and editing a typo should not look like a new version.
 */

import type { ContextObject, ContextStore, LoadedObject } from "./types.js";
import { gitLog, isGitAvailable, type GitCommit } from "./adapters/git.js";
import { isSuperseded, resolveSupersession } from "./authority.js";
import { computeLifecycle } from "./lifecycle.js";
import { resolveAsOf } from "./time.js";
import { parseRef } from "./ids.js";

export interface HistoryEntry {
  id: string;
  version: number;
  authority?: string;
  status?: string;
  updated?: string;
  lifecycle: string;
  supersedes?: string[];
  superseded_by?: string;
  file?: string;
}

export interface ObjectHistory {
  id: string;
  entries: HistoryEntry[];
  /** Commits touching the files that back this object, newest first. */
  commits: GitCommit[];
  gitAvailable: boolean;
}

export async function history(store: ContextStore, id: string, options: { at?: string | Date } = {}): Promise<ObjectHistory> {
  const asOf = resolveAsOf(options.at);
  const supersession = resolveSupersession(store.objects, store.byId);

  // Follow the supersession chain backwards so `history policy.refunds` also
  // surfaces the objects it replaced, even when they carry different ids.
  const chain = collectChain(store, id);

  const entries: HistoryEntry[] = chain.map((entry) => ({
    id: entry.object.id,
    version: entry.object.version ?? 1,
    authority: entry.object.authority,
    status: entry.object.status,
    updated: entry.object.updated,
    lifecycle: computeLifecycle(entry.object, {
      asOf,
      manifest: store.manifest,
      superseded: isSuperseded(entry.object, supersession.superseded) ? new Set([entry.object.id]) : new Set()
    }),
    supersedes: entry.object.supersedes,
    superseded_by: entry.object.superseded_by ?? supersession.supersededBy.get(entry.object.id),
    file: entry.file
  }));

  entries.sort((a, b) => (a.updated ?? "").localeCompare(b.updated ?? "") || a.version - b.version);

  const gitAvailable = await isGitAvailable(store.dir);
  const commits: GitCommit[] = [];
  if (gitAvailable) {
    const seen = new Set<string>();
    for (const file of chain.map((entry) => entry.file).filter(Boolean) as string[]) {
      for (const commit of await gitLog(store.dir, file)) {
        if (seen.has(commit.commit)) continue;
        seen.add(commit.commit);
        commits.push(commit);
      }
    }
    commits.sort((a, b) => b.date.localeCompare(a.date));
  }

  return { id, entries, commits, gitAvailable };
}

/** Every version of `id`, plus anything it supersedes, transitively. */
function collectChain(store: ContextStore, id: string): LoadedObject[] {
  const collected = new Map<string, LoadedObject>();
  const queue = [id];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const entry of store.byId.get(current) ?? []) {
      const key = `${entry.object.id}@${entry.object.version ?? 1}`;
      if (collected.has(key)) continue;
      collected.set(key, entry);
      for (const ref of entry.object.supersedes ?? []) {
        const parsed = parseRef(ref);
        if (parsed && !queue.includes(parsed.id)) queue.push(parsed.id);
      }
    }
  }

  return [...collected.values()];
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ObjectDiff {
  id: string;
  status: "added" | "removed" | "changed" | "unchanged";
  changes: FieldChange[];
}

/** Fields whose change is a governance event rather than an edit. */
const SIGNIFICANT_FIELDS = [
  "authority",
  "classification",
  "owner",
  "status",
  "version",
  "durability",
  "trust",
  "expires",
  "valid_from",
  "permissions",
  "supersedes",
  "superseded_by",
  "conflicts_with",
  "content",
  "title",
  "summary",
  "tags",
  "approval"
] as const;

/**
 * Compare two sets of objects.
 *
 * Used both for `diff <from> <to>` across git revisions and for comparing two
 * versions of the same object.
 */
export function diffObjects(before: ContextObject[], after: ContextObject[]): ObjectDiff[] {
  const beforeById = new Map(before.map((object) => [object.id, object]));
  const afterById = new Map(after.map((object) => [object.id, object]));
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])].sort();

  const diffs: ObjectDiff[] = [];

  for (const id of ids) {
    const a = beforeById.get(id);
    const b = afterById.get(id);

    if (!a && b) {
      diffs.push({ id, status: "added", changes: [] });
      continue;
    }
    if (a && !b) {
      diffs.push({ id, status: "removed", changes: [] });
      continue;
    }
    if (!a || !b) continue;

    const changes: FieldChange[] = [];
    for (const field of SIGNIFICANT_FIELDS) {
      const beforeValue = (a as unknown as Record<string, unknown>)[field];
      const afterValue = (b as unknown as Record<string, unknown>)[field];
      if (!deepEqual(beforeValue, afterValue)) {
        changes.push({ field, before: beforeValue, after: afterValue });
      }
    }

    diffs.push({ id, status: changes.length > 0 ? "changed" : "unchanged", changes });
  }

  return diffs;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) result[key] = sortKeys(source[key]);
    return result;
  }
  return value;
}

export function renderDiff(diffs: ObjectDiff[], options: { showUnchanged?: boolean } = {}): string {
  const lines: string[] = [];

  for (const diff of diffs) {
    if (diff.status === "unchanged" && !options.showUnchanged) continue;

    const marker = diff.status === "added" ? "+" : diff.status === "removed" ? "-" : "~";
    lines.push(`${marker} ${diff.id}  (${diff.status})`);

    for (const change of diff.changes) {
      lines.push(`    ${change.field}:`);
      lines.push(`      - ${summarize(change.before)}`);
      lines.push(`      + ${summarize(change.after)}`);
    }
  }

  if (lines.length === 0) lines.push("No changes.");
  return `${lines.join("\n")}\n`;
}

function summarize(value: unknown): string {
  if (value === undefined) return "(absent)";
  if (value === null) return "null";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > 120 ? `${collapsed.slice(0, 117)}…` : collapsed;
}
