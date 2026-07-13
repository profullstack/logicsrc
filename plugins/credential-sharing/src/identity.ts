import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { generateIdentityKeyPair, publicKeyForSecret, type IdentityKeyPair } from "./crypto.js";

/**
 * Local, machine-bound member identity for team credential sharing.
 *
 * Stored at `$LOGICSRC_HOME/identity.json` (default `~/.logicsrc/identity.json`),
 * mode 0600 — it holds the member's X25519 SECRET key and the server API token.
 * The secret key never leaves this file; only the public key is uploaded.
 */
export interface LocalIdentity {
  /** Server base URL this identity is registered against. */
  apiUrl: string;
  /** The member's email (their team-membership handle). */
  email?: string;
  /** Server-assigned user id, once logged in. */
  userId?: string;
  /** Opaque bearer token for the credshare API. */
  apiToken?: string;
  /** X25519 identity keypair (base64). */
  keys: IdentityKeyPair;
  createdAt: string;
  updatedAt: string;
}

export function logicsrcHome(): string {
  if (process.env.LOGICSRC_HOME) {
    return resolve(process.env.LOGICSRC_HOME);
  }
  return join(homedir(), ".logicsrc");
}

export function identityPath(): string {
  return process.env.LOGICSRC_IDENTITY_FILE
    ? resolve(process.env.LOGICSRC_IDENTITY_FILE)
    : join(logicsrcHome(), "identity.json");
}

export function defaultApiUrl(): string {
  return process.env.COMMANDBOARD_API_URL || process.env.LOGICSRC_API_URL || "http://localhost:4010";
}

function writeSecure(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  // Ensure 0600 even if the file already existed with looser perms.
  chmodSync(file, 0o600);
}

export function readIdentity(file = identityPath()): LocalIdentity | undefined {
  if (!existsSync(file)) {
    return undefined;
  }
  return JSON.parse(readFileSync(file, "utf8")) as LocalIdentity;
}

/**
 * Load the local identity, creating a fresh keypair on first use. Callers still
 * need to `logicsrc login` to attach an email/token, but the keypair exists
 * immediately so the public key can be uploaded during login.
 */
export async function loadOrCreateIdentity(file = identityPath()): Promise<LocalIdentity> {
  const existing = readIdentity(file);
  if (existing?.keys?.secretKey) {
    return existing;
  }
  const now = new Date().toISOString();
  const identity: LocalIdentity = {
    apiUrl: defaultApiUrl(),
    keys: await generateIdentityKeyPair(),
    createdAt: now,
    updatedAt: now
  };
  writeSecure(file, identity);
  return identity;
}

export function saveIdentity(identity: LocalIdentity, file = identityPath()): void {
  writeSecure(file, { ...identity, updatedAt: new Date().toISOString() });
}

/** Update fields on the stored identity, creating the keypair if absent. */
export async function updateIdentity(
  patch: Partial<Omit<LocalIdentity, "keys" | "createdAt">>,
  file = identityPath()
): Promise<LocalIdentity> {
  const current = await loadOrCreateIdentity(file);
  const next: LocalIdentity = { ...current, ...patch, updatedAt: new Date().toISOString() };
  writeSecure(file, next);
  return next;
}

/** Require a logged-in identity (token present), or throw with guidance. */
export function requireAuth(file = identityPath()): LocalIdentity & { apiToken: string; email: string } {
  const identity = readIdentity(file);
  if (!identity?.apiToken || !identity.email) {
    throw new Error('Not logged in. Run "logicsrc login --email you@example.com" first.');
  }
  return identity as LocalIdentity & { apiToken: string; email: string };
}

/** Sanity-check that a stored identity's public key matches its secret key. */
export async function verifyIdentityIntegrity(identity: LocalIdentity): Promise<boolean> {
  const derived = await publicKeyForSecret(identity.keys.secretKey);
  return derived === identity.keys.publicKey;
}
