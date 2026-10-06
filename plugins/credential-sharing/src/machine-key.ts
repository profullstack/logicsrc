import { TeamClient, TeamApiError } from "./client.js";
import { generateIdentityKeyPair, publicKeyForSecret } from "./crypto.js";
import { keyIdentityPath, readIdentity, writeKeyIdentity, type LocalIdentity } from "./identity.js";

/**
 * Headless auth with an API key (`LOGICSRC_API_KEY`, or `logicsrc login --api-key`).
 *
 * A MACHINE key gets its own X25519 identity on first use: generated here,
 * kept at `<home>/keys/<prefix>.json` (0600), and its public half registered on
 * the key row server-side. A person grants the key a vault by sealing the vault
 * key to that public key (`logicsrc teams grant … --key <name>`), so the box
 * never holds, or replaces, the person's own identity key. That replacement is
 * what `login --token` did on a fresh box, and why this exists.
 *
 * A person's (`user`) key passed the same way is recorded as such and borrows
 * this machine's identity.json; nothing is uploaded for it.
 */
export interface EnsureApiKeyOptions {
  apiUrl: string;
  /** Write the token into the identity file (login --api-key). Env-var use leaves it out. */
  persistToken?: boolean;
  /**
   * The key already registered a DIFFERENT public key (another box, or a lost
   * identity file). Replacing it drops every grant sealed to the old one, so it
   * only happens when asked.
   */
  reregister?: boolean;
  /** Identity file to use; defaults to keys/<prefix>.json. */
  file?: string;
}

export interface EnsuredApiKey {
  identity: LocalIdentity;
  file: string;
  /** True when this call registered the public key (first use). */
  registeredNow: boolean;
}

export class ApiKeyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyAuthError";
  }
}

export async function ensureApiKeyIdentity(token: string, options: EnsureApiKeyOptions): Promise<EnsuredApiKey> {
  if (!token.startsWith("lsk_")) {
    throw new ApiKeyAuthError("That is not a LogicSRC API key (they start with lsk_).");
  }
  const file = options.file ?? keyIdentityPath(token);
  const existing = readIdentity(file);
  const apiUrl = options.apiUrl.replace(/\/+$/, "");

  // Already set up against this server: no network round trip per command.
  if (
    existing?.registered &&
    existing.apiUrl === apiUrl &&
    !options.reregister &&
    (existing.keyKind === "user" || (existing.keys?.secretKey && (await publicKeyForSecret(existing.keys.secretKey)) === existing.keys.publicKey))
  ) {
    if (options.persistToken && existing.apiToken !== token) {
      const next = { ...existing, apiToken: token };
      writeKeyIdentity(next, file);
      return { identity: next, file, registeredNow: false };
    }
    return { identity: existing, file, registeredNow: false };
  }

  const client = new TeamClient({ apiUrl, token });
  let me: Awaited<ReturnType<TeamClient["me"]>>;
  try {
    me = await client.me();
  } catch (error) {
    if (error instanceof TeamApiError && error.status === 401) {
      throw new ApiKeyAuthError(`The API key ${token.slice(0, 12)}… was refused by ${apiUrl}: it is invalid, revoked, or expired.`);
    }
    throw error;
  }

  const now = new Date().toISOString();
  const base = {
    apiUrl,
    email: me.user.email ?? undefined,
    userId: me.user.id,
    keyId: me.key?.id,
    keyName: me.key?.name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(options.persistToken ? { apiToken: token } : {})
  };

  // A person's key (or a server from before machine keys, which reports no kind).
  if (me.key?.kind !== "machine") {
    const identity: LocalIdentity = {
      ...base,
      keyKind: "user",
      // Placeholder only: a user-kind key identity borrows identity.json's keypair.
      keys: { publicKey: "", secretKey: "" },
      registered: true
    };
    writeKeyIdentity(identity, file);
    return { identity, file, registeredNow: false };
  }

  const keys = existing?.keys?.secretKey ? existing.keys : await generateIdentityKeyPair();
  const serverKey = me.user.publicKey;
  let registeredNow = false;
  if (serverKey !== keys.publicKey) {
    if (serverKey && !options.reregister) {
      throw new ApiKeyAuthError(
        `The machine key "${me.key.name}" already registered an identity from another machine (or a lost ${file}). ` +
          "Its vault grants are sealed to that identity. To move the key here, run: " +
          "logicsrc login --api-key <key> --reregister   (this drops its grants; grant it again afterwards)."
      );
    }
    await client.uploadPublicKey(keys.publicKey);
    registeredNow = true;
  }

  const identity: LocalIdentity = {
    ...base,
    keyKind: "machine",
    team: me.key.team ?? undefined,
    keys,
    registered: true
  };
  writeKeyIdentity(identity, file);
  return { identity, file, registeredNow };
}
