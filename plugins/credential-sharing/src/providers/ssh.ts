import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { keysFromValues } from "../fingerprint.js";
import type { CredentialEndpoint, CredentialProvider, CredentialValueBag, CredentialWriteResult } from "../types.js";

/**
 * The `ssh` credential provider — `~/.ssh` presented as a value bag, so key
 * material rides the same end-to-end-encrypted vaults as `.env` secrets.
 *
 * Each file becomes one secret whose value is a JSON envelope carrying the
 * relative path, the permission bits, and the file body. The envelope exists
 * because the engine only hands `write()` the secrets that actually CHANGED —
 * a separate manifest secret would be absent from that set whenever a key's
 * contents change but the file list doesn't, leaving nowhere to look up the
 * destination path. Self-describing values keep every restore total.
 */

export const SSH_ENVELOPE_VERSION = 1;

export type SshFileKind = "private-key" | "public-key" | "config" | "other";

export interface SshFile {
  /** Path relative to the ssh directory, e.g. "config" or "keys/work_ed25519". */
  path: string;
  /** Permission bits to restore, e.g. 0o600. */
  mode: number;
  kind: SshFileKind;
  body: string;
}

/** Files that are host-specific, regenerable, or grant access — never swept up implicitly. */
const NEVER_IMPLICIT = /^(known_hosts|authorized_keys|environment|rc)(\.old|\.d)?$/;

/** Config files worth keeping even though they hold no key material. */
const CONFIG_FILES = /^(config|allowed_signers)$/;

const PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const PUBLIC_KEY = /^(ssh-[a-z0-9-]+|ecdsa-[a-z0-9@.-]+|sk-[a-z0-9@.-]+) [A-Za-z0-9+/]/;

/** Nothing in ~/.ssh is legitimately this large; the cap keeps a stray blob out. */
const MAX_FILE_BYTES = 512 * 1024;
const MAX_DEPTH = 4;

export function defaultSshDirectory(): string {
  return join(homedir(), ".ssh");
}

/** Resolve an endpoint to an absolute ssh directory, expanding a leading `~`. */
export function sshDirectory(endpoint: CredentialEndpoint): string {
  const raw = endpoint.path ?? defaultSshDirectory();
  const expanded = raw === "~" || raw.startsWith(`~${sep}`) || raw.startsWith("~/") ? join(homedir(), raw.slice(1)) : raw;
  return resolve(expanded);
}

/** Extra filenames the caller opted into (authorized_keys, known_hosts, …). */
function includeList(endpoint: CredentialEndpoint): Set<string> {
  const raw = endpoint.metadata?.include;
  return new Set(Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === "string") : []);
}

export function classifySshFile(relPath: string, body: string): SshFileKind | undefined {
  if (PRIVATE_KEY.test(body)) return "private-key";
  const base = relPath.split("/").pop() ?? relPath;
  if (CONFIG_FILES.test(base) || relPath.startsWith("config.d/")) return "config";
  if (PUBLIC_KEY.test(body)) return "public-key";
  return undefined;
}

/**
 * Secret name for a file. Lossy on purpose — it only has to be stable, unique
 * within one directory, and legible in a `teams vaults` listing. The exact path
 * travels inside the envelope, so nothing depends on decoding this back.
 */
export function secretNameForPath(relPath: string): string {
  const slug = relPath
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return `SSH_${slug || "FILE"}`;
}

export function encodeSshFile(file: SshFile): string {
  return JSON.stringify({
    v: SSH_ENVELOPE_VERSION,
    path: file.path,
    mode: file.mode.toString(8).padStart(4, "0"),
    kind: file.kind,
    body: file.body
  });
}

export function decodeSshFile(name: string, value: string): SshFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`Secret "${name}" is not a logicsrc ssh file envelope. Push it with "logicsrc secrets ssh push" first.`);
  }
  if (!isRecord(parsed) || typeof parsed.path !== "string" || typeof parsed.body !== "string") {
    throw new Error(`Secret "${name}" is not a logicsrc ssh file envelope (missing path/body).`);
  }
  if (typeof parsed.v === "number" && parsed.v > SSH_ENVELOPE_VERSION) {
    throw new Error(`Secret "${name}" was written by a newer logicsrc (envelope v${parsed.v}). Upgrade: logicsrc update.`);
  }
  const mode = typeof parsed.mode === "string" ? Number.parseInt(parsed.mode, 8) : Number(parsed.mode);
  const kind = typeof parsed.kind === "string" ? (parsed.kind as SshFileKind) : "other";
  return {
    path: parsed.path,
    mode: Number.isInteger(mode) && mode > 0 ? mode & 0o7777 : defaultMode(kind),
    kind,
    body: parsed.body
  };
}

function defaultMode(kind: SshFileKind): number {
  return kind === "public-key" ? 0o644 : 0o600;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * An OpenSSH private key names its cipher in the clear; "none" means the file
 * is usable by anyone who reads it. Worth saying out loud before it is shared.
 */
export function isPassphraseless(body: string): boolean {
  const match = /-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]*?)-----END/.exec(body);
  if (!match) return /-----BEGIN (RSA|DSA|EC) PRIVATE KEY-----/.test(body) && !/Proc-Type:.*ENCRYPTED/.test(body);
  const raw = Buffer.from(match[1].replace(/\s+/g, ""), "base64");
  const magic = "openssh-key-v1\0";
  if (raw.subarray(0, magic.length).toString("latin1") !== magic) return false;
  const cipherLength = raw.readUInt32BE(magic.length);
  return raw.subarray(magic.length + 4, magic.length + 4 + cipherLength).toString("latin1") === "none";
}

function walk(dir: string, base: string, depth: number, out: string[]): void {
  if (depth > MAX_DEPTH) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // unreadable directory — a partial backup beats no backup
  }
  for (const entry of entries.sort()) {
    const absolute = join(dir, entry);
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(absolute, base, depth + 1, out);
      continue;
    }
    // Sockets (agent, ControlMaster) and fifos have no content to back up.
    if (!stat.isFile() && !stat.isSymbolicLink()) continue;
    if (stat.size > MAX_FILE_BYTES) continue;
    out.push(relative(base, absolute).split(sep).join("/"));
  }
}

/** Scan an ssh directory into a value bag of file envelopes. */
export function readSshDirectory(dir: string, include: Set<string> = new Set()): CredentialValueBag {
  if (!existsSync(dir)) return {};
  const relPaths: string[] = [];
  walk(dir, dir, 0, relPaths);

  const bag: CredentialValueBag = {};
  const used = new Set<string>();
  for (const relPath of relPaths) {
    const base = relPath.split("/").pop() ?? relPath;
    const opted = include.has(relPath) || include.has(base);
    if (NEVER_IMPLICIT.test(base) && !opted) continue;

    let body: string;
    let mode: number;
    try {
      const absolute = join(dir, relPath);
      body = readFileSync(absolute, "utf8");
      mode = lstatSync(absolute).mode & 0o7777;
    } catch {
      continue;
    }
    const kind = classifySshFile(relPath, body) ?? (opted ? "other" : undefined);
    if (!kind) continue;

    let name = secretNameForPath(relPath);
    for (let suffix = 2; used.has(name); suffix += 1) {
      name = `${secretNameForPath(relPath)}_${suffix}`;
    }
    used.add(name);
    bag[name] = encodeSshFile({ path: relPath, mode, kind, body });
  }
  return bag;
}

/** Reject anything that would escape the ssh directory when restored. */
function resolveInside(dir: string, relPath: string): string {
  const target = resolve(dir, relPath);
  const rel = relative(dir, target);
  if (!rel || rel.startsWith("..") || resolve(relPath) === relPath) {
    throw new Error(`Refusing to restore "${relPath}" — it resolves outside ${dir}.`);
  }
  return target;
}

export const sshProvider: CredentialProvider = {
  id: "ssh",
  name: "Local SSH directory",
  description: "Read and restore ~/.ssh key pairs and config as secrets, with permission bits preserved.",
  capabilities: { readValues: true, readNames: true, write: true, delete: false, rollback: true, audit: false },
  authRequirements: [],
  status: "available",

  async inspect(endpoint) {
    const values = readSshDirectory(sshDirectory(endpoint), includeList(endpoint));
    return {
      provider: "ssh",
      endpoint,
      valuesReadable: true,
      keys: keysFromValues(values),
      inspectedAt: new Date().toISOString()
    };
  },

  async readValues(endpoint, keys) {
    const values = readSshDirectory(sshDirectory(endpoint), includeList(endpoint));
    return Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]]));
  },

  async write({ endpoint, upserts, deletes, dryRun }) {
    const dir = sshDirectory(endpoint);
    const results: CredentialWriteResult[] = [];
    // Deleting a key you still need is unrecoverable from here, so the adapter
    // declares delete:false and reports the request rather than acting on it.
    for (const key of deletes) {
      results.push({ key, applied: false, error: "the ssh provider never deletes local key files — remove them by hand" });
    }

    if (!dryRun && Object.keys(upserts).length > 0) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    for (const [key, value] of Object.entries(upserts)) {
      try {
        const file = decodeSshFile(key, value);
        const target = resolveInside(dir, file.path);
        if (!dryRun) {
          mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
          writeFileSync(target, file.body, { mode: file.mode });
          // writeFileSync's mode only applies when it creates the file; an
          // existing 0644 key would otherwise stay world-readable.
          chmodSync(target, file.mode);
        }
        results.push({ key, applied: !dryRun });
      } catch (error) {
        results.push({ key, applied: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  },

  async rollback({ endpoint, preImage, dryRun }) {
    return this.write!({ endpoint, upserts: preImage, deletes: [], dryRun });
  }
};
