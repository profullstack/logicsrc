/**
 * Vaults the runner reads `vault` sources from and writes `outputs.vault` to.
 *
 * A target is named by a string, from `--vault` or the file's
 * `metadata.vault` (the schema has no slot for it, and `metadata` is where a
 * publisher puts what a runner needs):
 *
 * | Target | Reads | Writes |
 * | --- | --- | --- |
 * | `teams:<team>/<project>/<env>` | `logicsrc teams pull` | pull, merge, `logicsrc teams push` |
 * | `opencreds` | `logicsrc vault get <KEY> --field <f> --reveal` | never (read-only) |
 * | `file:<path>` | a 0600 dotenv file | the same file, 0600 |
 *
 * With no target the runner uses `file:` on its own credentials file and says
 * so, as the spec asks: a login that exists only in a terminal's scrollback is
 * a login lost.
 *
 * The teams push replaces the vault's contents with the file it is given, so
 * a write always pulls first and merges, and the plaintext lives for one call
 * in a 0700 temporary directory removed in a `finally`.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { VaultReader } from "./inputs.js";
import { writePrivate } from "./store.js";
import { ErrandError } from "./util.js";

export interface Vault extends VaultReader {
  /** Merge these keys in. Absent for a read-only vault. */
  write?: (values: Record<string, string>) => Promise<void>;
}

// ---------------------------------------------------------------------------
// dotenv, the same dialect as logicsrc's env provider, so a file this writes
// pushes and pulls back unchanged.
// ---------------------------------------------------------------------------

const QUOTED = /^(['"])(.*)\1$/s;

export function parseEnv(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const bare = line.startsWith("export ") ? line.slice(7) : line;
    const eq = bare.indexOf("=");
    if (eq <= 0) continue;
    const key = bare.slice(0, eq).trim();
    let value = bare.slice(eq + 1).trim();
    const quoted = QUOTED.exec(value);
    if (quoted) {
      value = quoted[2]!;
      if (quoted[1] === '"') value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    out[key] = value;
  }
  return out;
}

export function serializeEnv(values: Record<string, string>): string {
  const quote = (v: string): string => (/[\s#'"=\\]|^$/.test(v) || v.includes("\n") ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"` : v);
  return `${Object.keys(values)
    .sort()
    .map((k) => `${k}=${quote(values[k]!)}`)
    .join("\n")}\n`;
}

// ---------------------------------------------------------------------------

export type VaultTarget =
  | { kind: "teams"; team: string; project: string; env: string }
  | { kind: "opencreds"; field?: string }
  | { kind: "file"; path: string };

export function parseTarget(text: string): VaultTarget {
  const teams = /^teams:([^/\s]+)\/([^/\s]+)\/([^/\s]+)$/.exec(text);
  if (teams) return { kind: "teams", team: teams[1]!, project: teams[2]!, env: teams[3]! };
  const creds = /^opencreds(?::(.+))?$/.exec(text);
  if (creds) return creds[1] ? { kind: "opencreds", field: creds[1] } : { kind: "opencreds" };
  const file = /^file:(.+)$/.exec(text);
  if (file) return { kind: "file", path: file[1]!.replace(/^~(?=\/|$)/, homedir()) };
  throw new ErrandError(`vault target ${text}: expected teams:<team>/<project>/<env>, opencreds[:<field>] or file:<path>`);
}

export function describeTarget(target: VaultTarget): string {
  if (target.kind === "teams") return `teams ${target.team}/${target.project}/${target.env}`;
  if (target.kind === "opencreds") return "OpenCreds vault (read-only)";
  return target.path;
}

/** Runs the logicsrc CLI. The umbrella passes one that re-enters itself; standalone it is `logicsrc` on PATH. */
export type LogicsrcExec = (args: string[], options?: { inheritStdin?: boolean }) => { status: number; stdout: string; stderr: string };

export const pathLogicsrc: LogicsrcExec = (args, options) => {
  const result = spawnSync("logicsrc", args, { encoding: "utf8", stdio: [options?.inheritStdin ? "inherit" : "ignore", "pipe", "pipe"] });
  if (result.error) {
    const missing = (result.error as NodeJS.ErrnoException).code === "ENOENT";
    return { status: 127, stdout: "", stderr: missing ? "logicsrc is not installed (https://logicsrc.com)" : result.error.message };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

const lastLines = (text: string): string => text.trim().split("\n").slice(-2).join(" ");

export function fileVault(path: string): Vault {
  return {
    describe: () => path,
    async get(key) {
      return existsSync(path) ? parseEnv(readFileSync(path, "utf8"))[key] : undefined;
    },
    async write(values) {
      const current = existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
      writePrivate(path, serializeEnv({ ...current, ...values }));
    },
  };
}

export function teamsVault(target: Extract<VaultTarget, { kind: "teams" }>, exec: LogicsrcExec = pathLogicsrc): Vault {
  let cache: Record<string, string> | null = null;

  function pull(): Record<string, string> {
    const dir = mkdtempSync(join(tmpdir(), "logicsrc-errand-"));
    try {
      const file = join(dir, "vault.env");
      const result = exec(["teams", "pull", target.team, target.project, target.env, "--env", file, "--format", "json"]);
      if (result.status !== 0) throw new ErrandError(`logicsrc teams pull failed: ${lastLines(result.stderr || result.stdout)}`);
      return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  return {
    describe: () => describeTarget(target),
    async get(key) {
      if (!cache) {
        try {
          cache = pull();
        } catch {
          // A vault that does not exist yet has nothing to reuse; the next source (usually generate) runs.
          cache = {};
        }
      }
      return cache[key];
    },
    async write(values) {
      let current: Record<string, string> = {};
      try {
        current = pull();
      } catch {
        // A vault that does not exist yet is created by the push.
      }
      const dir = mkdtempSync(join(tmpdir(), "logicsrc-errand-"));
      try {
        const file = join(dir, "vault.env");
        writeFileSync(file, serializeEnv({ ...current, ...values }), { mode: 0o600 });
        const result = exec(["teams", "push", target.team, target.project, target.env, "--env", file, "--format", "json"]);
        if (result.status !== 0) throw new ErrandError(`logicsrc teams push failed: ${lastLines(result.stderr || result.stdout)}`);
        cache = { ...current, ...values };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

/**
 * The personal OpenCreds vault, read-only: an item named by the key, the
 * field `login.password` unless the target names another. Unlocking may ask
 * for the master password, so stdin is the terminal's.
 */
export function opencredsVault(target: Extract<VaultTarget, { kind: "opencreds" }>, exec: LogicsrcExec = pathLogicsrc): Vault {
  return {
    describe: () => describeTarget(target),
    async get(key) {
      const result = exec(["vault", "get", key, "--field", target.field ?? "login.password", "--reveal"], { inheritStdin: true });
      if (result.status !== 0) return undefined;
      const value = result.stdout.replace(/\n$/, "");
      return value === "" ? undefined : value;
    },
  };
}

export function openVault(target: VaultTarget, exec?: LogicsrcExec): Vault {
  if (target.kind === "teams") return teamsVault(target, exec);
  if (target.kind === "opencreds") return opencredsVault(target, exec);
  return fileVault(target.path);
}
