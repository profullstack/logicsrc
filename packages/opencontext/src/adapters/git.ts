/**
 * `git://` adapter — read context out of a git revision.
 *
 * The primary form addresses the repository the manifest already lives in:
 *
 *     git://HEAD/context/mission.md
 *     git://v1.2.0/context/policies/refunds.md
 *     git://9f2c1ab/context/policies/refunds.md
 *
 * That is what makes "reconstruct the context available at a previous time"
 * work offline with no server: the history is already in the repository. The
 * remote form `git://github.com/acme/context/policies/refunds.md` is understood
 * for provenance, but reading it requires an explicit local mapping, because
 * silently cloning a URL found in a context file would be a remote fetch the
 * operator never asked for:
 *
 *     adapters:
 *       git:
 *         repos:
 *           github.com/acme/context: ../acme-context
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Adapter, AdapterContext, AdapterResult } from "../types.js";
import { sha256Uri } from "../digest.js";
import { guessContentType, resolveInside } from "./file.js";

const run = promisify(execFile);

const REV_PATTERN = /^[A-Za-z0-9._/-]+$/;

/** ASCII unit separator — safe inside a git --format because it can't appear in a subject line. */
const FIELD_SEP = "\u001F";

export interface GitTarget {
  rev: string;
  path: string;
  /** Set when the URI named a remote repository rather than the local one. */
  repo?: string;
}

/**
 * Parse a `git://` URI.
 *
 * A leading segment that looks like a hostname is read as a remote repository;
 * anything else is a revision in the local repository.
 */
export function parseGitUri(uri: string): GitTarget {
  const withoutScheme = uri.replace(/^git:\/\//, "");
  const segments = withoutScheme.split("/").filter((segment) => segment.length > 0);
  if (segments.length < 2) {
    throw new Error(`Malformed git URI "${uri}". Expected git://<rev>/<path> or git://<host>/<owner>/<repo>/<path>.`);
  }

  const first = segments[0]!;
  if (first.includes(".") && !first.startsWith(".") && segments.length >= 4) {
    return { rev: "HEAD", path: segments.slice(3).join("/"), repo: segments.slice(0, 3).join("/") };
  }

  return { rev: first, path: segments.slice(1).join("/") };
}

export const gitAdapter: Adapter = {
  name: "git",
  schemes: ["git"],
  // Reads the local object database, so it still works offline.
  remote: false,
  async load(uri: string, ctx: AdapterContext): Promise<AdapterResult> {
    const target = parseGitUri(uri);

    let cwd = ctx.dir;
    if (target.repo) {
      const mapping = (ctx.config.repos as Record<string, string> | undefined)?.[target.repo];
      if (!mapping) {
        throw new Error(
          `No local checkout configured for ${target.repo}. Add it under adapters.git.repos in opencontext.yaml, ` +
            `e.g. "${target.repo}: ../acme-context". OpenContext will not clone a repository on its own.`
        );
      }
      cwd = resolveInside(ctx.dir, mapping);
    }

    if (!REV_PATTERN.test(target.rev)) {
      throw new Error(`Refusing to use "${target.rev}" as a git revision: it contains unexpected characters.`);
    }
    if (target.path.split("/").includes("..")) {
      throw new Error(`Refusing to read "${target.path}" from git: paths must not traverse upward.`);
    }

    let stdout: string;
    try {
      // execFile, never a shell: the rev and path come from a context file.
      const result = await run("git", ["show", `${target.rev}:${target.path}`], {
        cwd,
        maxBuffer: 5 * 1024 * 1024,
        windowsHide: true
      });
      stdout = result.stdout;
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr?.trim();
      throw new Error(`git show ${target.rev}:${target.path} failed${stderr ? `: ${stderr}` : ""}`);
    }

    return {
      content: stdout,
      contentType: guessContentType(target.path),
      digest: sha256Uri(stdout),
      retrievedAt: new Date().toISOString(),
      // Committed history is inside the trust boundary of the local repository;
      // a mapped external checkout is only as trusted as whoever wrote it.
      trust: target.repo ? "verified" : "trusted"
    };
  }
};

/** Whether `git` is usable in `dir`. Used to degrade `history` gracefully. */
export async function isGitAvailable(dir: string): Promise<boolean> {
  try {
    await run("git", ["rev-parse", "--git-dir"], { cwd: dir, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export interface GitCommit {
  commit: string;
  date: string;
  author: string;
  subject: string;
}

/**
 * Commits that touched `path`, newest first.
 *
 * Returns an empty list rather than throwing when git is unavailable or the
 * path was never committed, so `history` degrades to the versions declared in
 * the context objects themselves — which is the offline-valid answer.
 */
export async function gitLog(dir: string, path: string, limit = 50): Promise<GitCommit[]> {
  try {
    const { stdout } = await run(
      "git",
      ["log", `--max-count=${limit}`, `--format=%H${FIELD_SEP}%aI${FIELD_SEP}%an${FIELD_SEP}%s`, "--", path],
      { cwd: dir, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
    );
    return stdout
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [commit = "", date = "", author = "", subject = ""] = line.split(FIELD_SEP);
        return { commit, date, author, subject };
      });
  } catch {
    return [];
  }
}

/** Read a path at a revision. Returns null when it did not exist there. */
export async function gitShow(dir: string, rev: string, path: string): Promise<string | null> {
  if (!REV_PATTERN.test(rev)) return null;
  try {
    const { stdout } = await run("git", ["show", `${rev}:${path}`], {
      cwd: dir,
      windowsHide: true,
      maxBuffer: 5 * 1024 * 1024
    });
    return stdout;
  } catch {
    return null;
  }
}
