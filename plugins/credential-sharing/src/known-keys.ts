import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { logicsrcHome } from "./identity.js";

/**
 * Trust-on-first-use pins for the identity public keys this CLI seals vault
 * keys to (teammates and machine keys).
 *
 * The server hands out public keys, and a server (or a stolen session) that
 * swaps one in could get every vault re-sealed to an attacker. So the first
 * key seen for a member is pinned in `<home>/known-keys.json`, and a later
 * DIFFERENT key is refused for sealing until the user confirms it
 * (`--accept-key-change <email>`), after checking the fingerprint with the
 * person. A rotation (`teams rotate-identity`) or a reset changes a key
 * legitimately; this makes that change visible instead of silent.
 *
 * Fingerprints match the web app's: sha256 over the raw 32-byte key, first 16
 * bytes as eight groups of four hex digits.
 */
export function keyFingerprint(publicKeyB64: string | null | undefined): string | null {
  if (!publicKeyB64) return null;
  const raw = Buffer.from(publicKeyB64, "base64");
  if (raw.length !== 32) return null;
  const hex = createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return hex.match(/.{4}/g)!.join(" ");
}

export interface KnownKey {
  publicKey: string;
  fingerprint: string;
  firstSeen: string;
  lastSeen: string;
  /** Set when a change was accepted: the fingerprint it replaced. */
  replaced?: string;
}

interface KnownKeysFile {
  version: 1;
  /** Keyed by `<apiUrl>|<email>` for people and `<apiUrl>|key:<id>` for machine keys. */
  keys: Record<string, KnownKey>;
}

export type PinStatus = "pinned" | "new" | "changed" | "none";

export class KeyChangedError extends Error {
  constructor(
    public readonly subject: string,
    public readonly pinned: string,
    public readonly presented: string
  ) {
    super(
      `The identity key for ${subject} CHANGED since this machine pinned it.\n` +
        `  pinned:    ${pinned}\n  presented: ${presented}\n` +
        "This is expected after they ran `logicsrc teams rotate-identity` or reset their key, and it is exactly what a swapped-in attacker key looks like. " +
        `Confirm the new fingerprint with ${subject} out of band, then re-run with --accept-key-change ${subject}`
    );
    this.name = "KeyChangedError";
  }
}

export function knownKeysPath(): string {
  return join(logicsrcHome(), "known-keys.json");
}

function load(): KnownKeysFile {
  const file = knownKeysPath();
  if (!existsSync(file)) return { version: 1, keys: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as KnownKeysFile;
    return parsed && typeof parsed.keys === "object" ? parsed : { version: 1, keys: {} };
  } catch {
    throw new Error(`${file} is not valid JSON. Fix or remove it (removing it re-pins every key on first use).`);
  }
}

function save(data: KnownKeysFile): void {
  const file = knownKeysPath();
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
  try { chmodSync(file, 0o600); } catch { /* no modes on this platform */ }
}

const pinId = (apiUrl: string, subject: string) => `${apiUrl.replace(/\/+$/, "")}|${subject.toLowerCase()}`;

/** What we know about a key, without changing anything. */
export function pinStatus(apiUrl: string, subject: string, publicKey: string | null | undefined): { status: PinStatus; pinned?: KnownKey } {
  if (!publicKey) return { status: "none" };
  const pinned = load().keys[pinId(apiUrl, subject)];
  if (!pinned) return { status: "new" };
  return { status: pinned.publicKey === publicKey ? "pinned" : "changed", pinned };
}

/**
 * Check a key before sealing anything to it. Pins it on first use; throws
 * KeyChangedError on a change unless `accept` names the subject (or is true).
 * Returns what happened, so callers can tell the user about a new pin.
 */
export function checkAndPinKey(
  apiUrl: string,
  subject: string,
  publicKey: string,
  accept: boolean | string[] = false
): PinStatus {
  const data = load();
  const id = pinId(apiUrl, subject);
  const fp = keyFingerprint(publicKey) ?? "(not a valid key)";
  const now = new Date().toISOString();
  const pinned = data.keys[id];
  if (!pinned) {
    data.keys[id] = { publicKey, fingerprint: fp, firstSeen: now, lastSeen: now };
    save(data);
    return "new";
  }
  if (pinned.publicKey === publicKey) {
    pinned.lastSeen = now;
    save(data);
    return "pinned";
  }
  const accepted = accept === true || (Array.isArray(accept) && accept.some((a) => a.toLowerCase() === subject.toLowerCase()));
  if (!accepted) throw new KeyChangedError(subject, pinned.fingerprint, fp);
  data.keys[id] = { publicKey, fingerprint: fp, firstSeen: now, lastSeen: now, replaced: pinned.fingerprint };
  save(data);
  return "changed";
}

/** Record our OWN new key after a rotation, so our own machine does not flag it. */
export function repinKey(apiUrl: string, subject: string, publicKey: string): void {
  const data = load();
  const id = pinId(apiUrl, subject);
  const now = new Date().toISOString();
  const previous = data.keys[id];
  data.keys[id] = { publicKey, fingerprint: keyFingerprint(publicKey) ?? "", firstSeen: now, lastSeen: now, ...(previous && previous.publicKey !== publicKey ? { replaced: previous.fingerprint } : {}) };
  save(data);
}
