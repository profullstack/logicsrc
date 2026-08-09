/**
 * `file://` adapter, and the resolver for bare relative paths.
 *
 * This adapter is the one that runs on every local project, so it is also the
 * one that has to be careful: a context repository may be authored by someone
 * who is not the person running the resolver, and `../../../.ssh/id_rsa` is a
 * perfectly ordinary-looking string in a YAML file. Every path is resolved and
 * then checked to be inside the manifest directory before anything is read.
 */

import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Adapter, AdapterContext, AdapterResult } from "../types.js";
import { sha256Uri } from "../digest.js";

export class PathTraversalError extends Error {
  readonly uri: string;

  constructor(uri: string, resolved: string, root: string) {
    super(
      `Refusing to read "${uri}": it resolves to ${resolved}, which is outside the context root ${root}. ` +
        `Context sources must stay inside the directory containing opencontext.yaml.`
    );
    this.name = "PathTraversalError";
    this.uri = uri;
  }
}

/**
 * Turn a `file://` URI or a relative path into an absolute path inside `root`.
 *
 * Throws rather than clamping: silently rewriting an escaping path would hide
 * a misconfigured or hostile context repository.
 */
export function resolveInside(root: string, target: string): string {
  const raw = target.startsWith("file:") ? fileUriToPath(target) : target;

  // An absolute path is allowed only when it is already inside the root, so an
  // authored `/etc/passwd` fails the same way `../../etc/passwd` does.
  const absolute = isAbsolute(raw) ? resolve(raw) : resolve(root, raw);
  const rootResolved = resolve(root);
  const rel = relative(rootResolved, absolute);

  if (rel === "") return absolute;
  if (rel.startsWith("..") || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new PathTraversalError(target, absolute, rootResolved);
  }
  return absolute;
}

function fileUriToPath(uri: string): string {
  // `file://./context/mission.md` is not a legal file URI but is what people
  // write, so treat a non-absolute file: URI as a relative path.
  if (/^file:\/\/\/|^file:\/\/[a-zA-Z]/.test(uri) && !uri.startsWith("file://.")) {
    try {
      return fileURLToPath(uri);
    } catch {
      // fall through to the lenient reading below
    }
  }
  return uri.replace(/^file:\/\//, "").replace(/^file:/, "");
}

export const fileAdapter: Adapter = {
  name: "file",
  schemes: ["file"],
  remote: false,
  async load(uri: string, ctx: AdapterContext): Promise<AdapterResult> {
    const path = resolveInside(ctx.dir, uri);

    let stats;
    try {
      stats = await stat(path);
    } catch {
      throw new Error(`Source not found: ${uri} (looked in ${path})`);
    }
    if (stats.isDirectory()) {
      throw new Error(`Source ${uri} is a directory. Point content_uri at a file, or use a collection glob.`);
    }

    const content = await readFile(path, "utf8");
    return {
      content,
      contentType: guessContentType(path),
      digest: sha256Uri(content),
      retrievedAt: stats.mtime.toISOString(),
      // Local files are inside the trust boundary — they are reviewed the same
      // way code is, through the repository they live in.
      trust: "trusted"
    };
  }
};

export function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "application/yaml";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  return "text/markdown";
}
