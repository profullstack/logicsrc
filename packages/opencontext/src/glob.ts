/**
 * A small, predictable glob.
 *
 * Deliberately not a general-purpose implementation: collections address files
 * in a repository, and the patterns people actually write are `./context/**`,
 * `./context/policies/*.md`, and `./sops/**\/*.yaml`. Keeping the surface small
 * keeps expansion deterministic, which matters because collection order feeds
 * resolution order.
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/** Extensions a collection picks up when the pattern does not name one. */
export const CONTEXT_EXTENSIONS = [".md", ".markdown", ".yaml", ".yml", ".json"] as const;

/** Never descended into. Context lives in the repository, not in its build output. */
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", ".hg", ".svn", "dist", "build", ".cache", ".claude"]);

const MAX_DEPTH = 24;

export interface GlobResult {
  /** Paths relative to the root, POSIX-separated, sorted. */
  files: string[];
  /** The static directory prefix of the pattern, relative to the root. */
  base: string;
}

export function expandGlob(root: string, pattern: string): GlobResult {
  const normalized = normalizePattern(pattern);
  const base = staticPrefix(normalized);
  const regex = globToRegExp(normalized);
  const hasExplicitExtension = /\.[a-z0-9]+$/i.test(normalized.split("/").at(-1) ?? "");

  const baseDir = resolve(root, base);
  const files: string[] = [];

  walk(baseDir, root, 0, (relPath) => {
    if (!regex.test(relPath)) return;
    if (!hasExplicitExtension && !CONTEXT_EXTENSIONS.some((ext) => relPath.toLowerCase().endsWith(ext))) return;
    files.push(relPath);
  });

  files.sort();
  return { files, base };
}

function walk(dir: string, root: string, depth: number, visit: (relPath: string) => void): void {
  if (depth > MAX_DEPTH) return;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // A collection pointing at a directory that does not exist is reported by
    // the loader, which has the manifest context to say which one.
    return;
  }

  // Sorted so two runs on the same tree produce the same order.
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      walk(full, root, depth + 1, visit);
      continue;
    }

    if (entry.isSymbolicLink()) {
      // Follow only to regular files that stay inside the root.
      try {
        const target = statSync(full);
        if (!target.isFile()) continue;
        if (relative(resolve(root), resolve(full)).startsWith("..")) continue;
      } catch {
        continue;
      }
    } else if (!entry.isFile()) {
      continue;
    }

    visit(toPosix(relative(root, full)));
  }
}

export function normalizePattern(pattern: string): string {
  return toPosix(pattern)
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "");
}

/** The longest leading run of wildcard-free segments. */
export function staticPrefix(pattern: string): string {
  const segments = pattern.split("/");
  const stable: string[] = [];
  for (const segment of segments) {
    if (/[*?[\]]/.test(segment)) break;
    stable.push(segment);
  }
  // Drop a trailing filename so `context/policies/*.md` bases at `context/policies`.
  if (stable.length === segments.length && stable.length > 0) stable.pop();
  return stable.join("/");
}

/**
 * Translate a glob to an anchored regular expression.
 *
 * `**` crosses directory boundaries; `*` and `?` never do, so `policies/*.md`
 * cannot silently reach `policies/archive/old.md`.
 */
export function globToRegExp(pattern: string): RegExp {
  let source = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;

    if (char === "*") {
      const isDouble = pattern[index + 1] === "*";
      if (isDouble) {
        const followedBySlash = pattern[index + 2] === "/";
        if (followedBySlash) {
          // `**/` matches zero or more directories, so `a/**/b.md` also matches `a/b.md`.
          source += "(?:[^/]+/)*";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }

  return new RegExp(`^${source}$`);
}

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}
