/**
 * Unlock sessions.
 *
 * Two shapes, and the difference matters enough to be a flag rather than a
 * default:
 *
 * - **Token (default).** `unlock` prints a session token; the shell exports it
 *   as OPENCREDS_SESSION and it lives in that process's environment. Nothing
 *   touches disk, and it dies with the shell.
 *
 * - **Persisted (`--persist`).** The same token in a 0600 file with an expiry,
 *   so a script can unlock once and run many commands. This is a real cost: a
 *   readable user key on disk is the vault. It is opt-in, it says so when you
 *   use it, and `lock` removes it.
 */

import { existsSync, readFileSync, rmSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fromBase64, toBase64 } from "./primitives.js";
import { opencredsHome } from "./store.js";

export const SESSION_ENV = "OPENCREDS_SESSION";

interface SessionFile {
  key: string;
  expiresAt: string;
}

function sessionPath(baseDir: string): string {
  return join(baseDir, "session.json");
}

/** The session token for a user key — base64, and exactly as sensitive as the key. */
export function encodeSession(userKey: Uint8Array): string {
  return toBase64(userKey);
}

export function decodeSession(token: string): Uint8Array {
  const key = fromBase64(token.trim());
  if (key.length !== 32) throw new Error("Invalid session token");
  return key;
}

export function persistSession(userKey: Uint8Array, minutes: number, baseDir = opencredsHome()): string {
  const path = sessionPath(baseDir);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const file: SessionFile = {
    key: encodeSession(userKey),
    expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(file)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // No modes on this platform; the write still happened.
  }
  return path;
}

export function clearSession(baseDir = opencredsHome()): boolean {
  const path = sessionPath(baseDir);
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  return true;
}

/**
 * The user key for this invocation, if there is one.
 *
 * The environment wins over the file: an explicitly exported session is a
 * deliberate act, and a stale file should never silently override it.
 */
export function readSession(baseDir = opencredsHome()): Uint8Array | undefined {
  const fromEnv = process.env[SESSION_ENV];
  if (fromEnv && fromEnv.trim() !== "") {
    try {
      return decodeSession(fromEnv);
    } catch {
      return undefined;
    }
  }

  const path = sessionPath(baseDir);
  if (!existsSync(path)) return undefined;
  try {
    const file = JSON.parse(readFileSync(path, "utf8")) as SessionFile;
    if (new Date(file.expiresAt).getTime() < Date.now()) {
      // Expired sessions are removed on read rather than left to rot: the file
      // is the risk, and a session nobody can use is pure risk.
      rmSync(path, { force: true });
      return undefined;
    }
    return decodeSession(file.key);
  } catch {
    return undefined;
  }
}
