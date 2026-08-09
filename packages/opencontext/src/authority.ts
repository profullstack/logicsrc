/**
 * Supersession, authority precedence, and conflicts.
 *
 * The rule this module exists to enforce: the resolver never quietly guesses.
 * When two canonical objects contradict each other, both survive into the
 * bundle's warnings and the run fails a strict validate — because the failure
 * mode of silently picking one is an agent confidently acting on a policy that
 * half the organization believes was replaced.
 */

import type {
  Authority,
  ContextObject,
  Diagnostic,
  LoadedObject,
  Manifest,
  TieBreaker
} from "./types.js";
import { parseRef } from "./ids.js";
import { parseTimestamp } from "./time.js";
import { precedenceOf, tieBreakersOf } from "./manifest.js";

export interface SupersessionResult {
  /** Ids of objects replaced by something else. */
  superseded: Set<string>;
  /** Keyed by superseded id -> the id that replaced it, for `--explain`. */
  supersededBy: Map<string, string>;
  diagnostics: Diagnostic[];
}

/**
 * Work out what has been replaced.
 *
 * Both directions are honoured: `supersedes` on the newer object, and
 * `superseded_by` on the older one. A reference to something that does not
 * exist is an error rather than a no-op, because a broken chain silently
 * resurrects retired policy.
 */
export function resolveSupersession(objects: LoadedObject[], byId: Map<string, LoadedObject[]>): SupersessionResult {
  const superseded = new Set<string>();
  const supersededBy = new Map<string, string>();
  const diagnostics: Diagnostic[] = [];

  const markSuperseded = (targetId: string, replacementId: string): void => {
    superseded.add(targetId);
    if (!supersededBy.has(targetId)) supersededBy.set(targetId, replacementId);
  };

  for (const entry of objects) {
    const object = entry.object;

    for (const ref of object.supersedes ?? []) {
      const parsed = parseRef(ref);
      if (!parsed) {
        diagnostics.push({
          code: "broken-supersession",
          severity: "error",
          message: `${object.id} supersedes "${ref}", which is not a valid object reference.`,
          id: object.id,
          file: entry.file,
          field: "supersedes",
          remediation: "Use an id, or id@version."
        });
        continue;
      }

      if (parsed.id === object.id && parsed.version === undefined) {
        diagnostics.push({
          code: "supersession-cycle",
          severity: "error",
          message: `${object.id} supersedes itself. Pin the version it replaces, e.g. ${object.id}@${(object.version ?? 2) - 1}.`,
          id: object.id,
          file: entry.file,
          field: "supersedes"
        });
        continue;
      }

      const targets = byId.get(parsed.id);
      if (!targets || targets.length === 0) {
        diagnostics.push({
          code: "broken-supersession",
          severity: "error",
          message: `${object.id} supersedes "${ref}", which does not exist.`,
          id: object.id,
          ids: [object.id, parsed.id],
          file: entry.file,
          field: "supersedes",
          remediation: `Keep the superseded object in the repository — supersession preserves history, deletion destroys it.`
        });
        continue;
      }

      for (const target of targets) {
        if (target === entry) continue;
        if (parsed.version !== undefined && (target.object.version ?? 1) !== parsed.version) continue;
        markSuperseded(keyOf(target.object), object.id);
      }
    }

    if (object.superseded_by) {
      const parsed = parseRef(object.superseded_by);
      if (!parsed || !byId.has(parsed.id)) {
        diagnostics.push({
          code: "broken-supersession",
          severity: "error",
          message: `${object.id} declares superseded_by "${object.superseded_by}", which does not exist.`,
          id: object.id,
          file: entry.file,
          field: "superseded_by"
        });
      } else {
        markSuperseded(keyOf(object), parsed.id);
      }
    }
  }

  // Deliberately *not* done here: implicitly superseding older versions of the
  // same id because a higher-numbered one exists.
  //
  // It would be convenient, and it would be the resolver quietly guessing. Two
  // active canonical versions of one policy is a real governance failure — a
  // rewrite landed without anyone declaring what it replaced — and inferring
  // the supersession would hide it, making `multiple-active-versions` and
  // `duplicate-canonical` impossible to ever detect. Instead resolution still
  // returns one winner (the version tie breaker), the loser is reported as
  // outranked, and validation raises the missing link. Supersession is
  // something an author states, not something a tool assumes.
  return { superseded, supersededBy, diagnostics };
}

/**
 * The key a superseded object is tracked by.
 *
 * Always `id@version`, and an object that declares no version is version 1 —
 * the same assumption the version tie breaker makes. Emitting a bare id here
 * would be ambiguous with the "supersede every version" marker that
 * `isSuperseded` looks for, so superseding an unversioned object would also
 * hide every later version of it.
 */
export function keyOf(object: ContextObject): string {
  return `${object.id}@${object.version ?? 1}`;
}

/**
 * True when this specific version has been superseded, or when every version of
 * the id has been (which a bare id in the set signifies).
 */
export function isSuperseded(object: ContextObject, superseded: ReadonlySet<string>): boolean {
  return superseded.has(keyOf(object)) || superseded.has(object.id);
}

export function authorityRank(authority: Authority | undefined, precedence: Authority[]): number {
  const index = precedence.indexOf(authority ?? "reference");
  // Anything unranked sorts last rather than first: an unknown level must never
  // outrank a known one.
  return index === -1 ? precedence.length : index;
}

/**
 * Order two candidates: authority first, then the configured tie breakers.
 *
 * Returns a negative number when `a` wins. Ordering is total because `id` is
 * always appended as the final tie breaker, so resolution is reproducible.
 */
export function compareCandidates(a: ContextObject, b: ContextObject, manifest: Manifest): number {
  const precedence = precedenceOf(manifest);
  const byAuthority = authorityRank(a.authority, precedence) - authorityRank(b.authority, precedence);
  if (byAuthority !== 0) return byAuthority;

  for (const breaker of tieBreakersOf(manifest)) {
    const result = compareBy(breaker, a, b);
    if (result !== 0) return result;
  }
  return 0;
}

function compareBy(breaker: TieBreaker, a: ContextObject, b: ContextObject): number {
  switch (breaker) {
    case "version":
      return (b.version ?? 1) - (a.version ?? 1);
    case "updated":
      return timeOf(b.updated) - timeOf(a.updated);
    case "created":
      return timeOf(b.created) - timeOf(a.created);
    case "confidence":
      return (b.confidence ?? 1) - (a.confidence ?? 1);
    case "id":
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    default:
      return 0;
  }
}

function timeOf(value: string | undefined): number {
  return parseTimestamp(value)?.getTime() ?? 0;
}

export interface ConflictResult {
  diagnostics: Diagnostic[];
  /** Ids involved in a conflict that authority could not settle. */
  unresolved: Set<string>;
}

/**
 * Detect conflicts among active objects.
 *
 * Three kinds are reported:
 *   - a declared `conflicts_with` between equal-authority objects, which the
 *     resolver cannot settle and must surface (`conflict-ambiguous`);
 *   - a declared conflict that authority *does* settle, still reported so the
 *     losing side is visible (`conflict-declared`);
 *   - more than one active canonical object for the same id, which means two
 *     files both claim to be the organization's single source of truth
 *     (`duplicate-canonical`).
 */
export function detectConflicts(
  active: LoadedObject[],
  manifest: Manifest
): ConflictResult {
  const diagnostics: Diagnostic[] = [];
  const unresolved = new Set<string>();
  const byId = new Map<string, LoadedObject[]>();

  for (const entry of active) {
    const list = byId.get(entry.object.id);
    if (list) list.push(entry);
    else byId.set(entry.object.id, [entry]);
  }

  for (const [id, entries] of byId) {
    if (entries.length < 2) continue;

    const canonical = entries.filter((entry) => entry.object.authority === "canonical");
    if (canonical.length > 1) {
      diagnostics.push({
        code: "duplicate-canonical",
        severity: "error",
        message: `${canonical.length} active canonical objects share the id "${id}" (${canonical
          .map((entry) => entry.file ?? "inline")
          .join(", ")}). Canonical means exactly one source of truth.`,
        id,
        ids: canonical.map((entry) => entry.file ?? id),
        file: canonical[0]?.file,
        remediation: "Supersede the older one, or lower its authority to reference."
      });
      unresolved.add(id);
    }

    diagnostics.push({
      code: "multiple-active-versions",
      severity: canonical.length > 1 ? "error" : "warning",
      message: `${entries.length} active versions of "${id}" (versions ${entries
        .map((entry) => entry.object.version ?? 1)
        .join(", ")}). Default resolution will use one and exclude the rest.`,
      id,
      file: entries[0]?.file,
      remediation: `Add supersedes: [${id}@${entries[0]?.object.version ?? 1}] to the newer object.`
    });
  }

  const activeIds = new Set(active.map((entry) => entry.object.id));

  // Deduplicate by the unordered pair, not by id ordering. A conflict is very
  // often declared on one side only, so skipping whenever the declaring id
  // sorts later would silently drop it — a canonical conflict disappearing on
  // alphabetical luck is exactly the failure this check exists to prevent.
  const reportedPairs = new Set<string>();

  for (const entry of active) {
    for (const ref of entry.object.conflicts_with ?? []) {
      const parsed = parseRef(ref);
      if (!parsed) continue;
      if (!activeIds.has(parsed.id)) continue;
      if (parsed.id === entry.object.id) continue;

      const pairKey = [entry.object.id, parsed.id].sort().join(" ");
      if (reportedPairs.has(pairKey)) continue;
      reportedPairs.add(pairKey);

      const other = active.find((candidate) => candidate.object.id === parsed.id);
      if (!other) continue;

      const order = compareCandidates(entry.object, other.object, manifest);
      const sameAuthority = entry.object.authority === other.object.authority;

      if (sameAuthority) {
        diagnostics.push({
          code: "conflict-ambiguous",
          severity: "error",
          message: `${entry.object.id} and ${other.object.id} declare a conflict and both are ${entry.object.authority}. Authority cannot settle it.`,
          id: entry.object.id,
          ids: [entry.object.id, other.object.id],
          file: entry.file,
          remediation: "Raise one object's authority, supersede one of them, or reconcile the two."
        });
        unresolved.add(entry.object.id);
        unresolved.add(other.object.id);
      } else {
        const winner = order < 0 ? entry.object : other.object;
        const loser = order < 0 ? other.object : entry.object;
        diagnostics.push({
          code: "conflict-declared",
          severity: "warning",
          message: `${entry.object.id} conflicts with ${other.object.id}; ${winner.id} (${winner.authority}) outranks ${loser.id} (${loser.authority}).`,
          id: entry.object.id,
          ids: [entry.object.id, other.object.id],
          file: entry.file,
          remediation: `Supersede ${loser.id} if it is genuinely obsolete.`
        });
      }
    }
  }

  return { diagnostics, unresolved };
}
