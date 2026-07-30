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

/**
 * Where `logicsrc login` goes when nothing else is configured.
 *
 * This is the credentials app (apps/pwa) on its own hostname, which is what
 * actually serves the CLI routes — /cli/device/code, /cli/device/token,
 * /cli/authorize, /cli/token and /api/me (see apps/pwa/src/routes/cli.mjs).
 *
 * NOT the apex: logicsrc.com runs the marketing app, so every one of those
 * paths 404s there. The apex can forward them (see the rewrites in
 * apps/logicsrc-web/next.config.ts), but pointing straight at the host that
 * serves them needs no proxy hop and no deploy of a second service to work.
 */
export const DEFAULT_API_URL = "https://app.logicsrc.com";

/** An explicitly configured API origin, if any. `LOGICSRC_API` is the documented one. */
export function envApiUrl(): string | undefined {
  return (
    process.env.LOGICSRC_API ||
    process.env.LOGICSRC_API_URL ||
    // Legacy: CommandBoard is a different service, so this is the last resort.
    process.env.COMMANDBOARD_API_URL ||
    undefined
  );
}

export function defaultApiUrl(): string {
  return envApiUrl() || DEFAULT_API_URL;
}

/**
 * Resolve the API origin for a command: an explicit `--api-url` wins, then the
 * environment, then whatever a *logged-in* identity was registered against.
 * A stored URL from an identity that never completed login is ignored — that
 * is how machines got stuck pointing at a dev `localhost` server.
 */
export function resolveApiUrl(identity?: Pick<LocalIdentity, "apiUrl" | "apiToken">, override?: string): string {
  const stored = identity?.apiToken ? identity.apiUrl : undefined;
  return (override || envApiUrl() || stored || DEFAULT_API_URL).replace(/\/+$/, "");
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
    throw new Error('Not logged in. Run "logicsrc login" first.');
  }
  return identity as LocalIdentity & { apiToken: string; email: string };
}

/** Sanity-check that a stored identity's public key matches its secret key. */
export async function verifyIdentityIntegrity(identity: LocalIdentity): Promise<boolean> {
  const derived = await publicKeyForSecret(identity.keys.secretKey);
  return derived === identity.keys.publicKey;
}
