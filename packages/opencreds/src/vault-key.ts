/**
 * Vault creation, unlock, recovery and re-keying.
 *
 * The user key is 32 random bytes, generated once and wrapped. It is not
 * derived from the password, so changing the master password re-wraps 32 bytes
 * instead of re-encrypting every item — and a partial failure during a password
 * change cannot leave half a vault openable by the old password and half by the
 * new.
 */

import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  fromBase64,
  KEY_BYTES,
  randomBytes,
  toBase64,
} from "./primitives.js";
import {
  DEFAULT_KDF_PARAMS,
  assertUsableKdfParams,
  assertUsableNamespace,
  deriveAll,
  deriveAuthHash,
  deriveMasterKey,
  deriveRecoveryWrapKey,
  deriveWrapKey,
} from "./kdf.js";
import {
  DEFAULT_NAMESPACE,
  OPENCREDS_VERSION,
  type KdfParams,
  type Namespace,
  type Profile,
  type VaultMeta,
} from "./types.js";

export const SALT_BYTES = 16;
export const RECOVERY_KEY_BYTES = 16;

/**
 * Crockford base32: the digits, then the letters without I, L, O or U.
 *
 * I/1, L/1 and O/0 are the pairs people actually confuse, and U is dropped so
 * that no accidental word offends anyone. Crockford also defines how to decode
 * the confusions, which {@link parseRecoveryKey} implements.
 */
const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Render a recovery key for a human to write down.
 *
 * Groups of five, because this value is transcribed by hand exactly once and
 * misread forever after.
 */
export function formatRecoveryKey(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += RECOVERY_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += RECOVERY_ALPHABET[(value << (5 - bits)) & 31];
  return (out.match(/.{1,5}/g) ?? []).join("-");
}

/** Parse a recovery key back, tolerating case, spaces and dashes. */
export function parseRecoveryKey(input: string): Uint8Array {
  const clean = String(input || "")
    .toUpperCase()
    // Dashes, spaces and anything else a person adds while writing it down.
    .replace(/[^0-9A-Z]/g, "")
    // Crockford's decoding rule for the characters the alphabet omits.
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = RECOVERY_ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`Invalid character in recovery key: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export interface CreatedVault {
  meta: VaultMeta;
  userKey: Uint8Array;
  recoveryKey: string;
}

/**
 * Create a `user`-profile vault.
 *
 * Returns the metadata (safe to send to a server), the user key (never), and
 * the recovery key, which is shown to the person exactly once and then is gone
 * from this process.
 */
export async function createVault(
  password: string,
  options: { namespace?: Namespace; params?: KdfParams; allowUnregisteredNamespace?: boolean } = {},
): Promise<CreatedVault> {
  const namespace = assertUsableNamespace(
    options.namespace ?? DEFAULT_NAMESPACE,
    options.allowUnregisteredNamespace,
  );
  const params = assertUsableKdfParams(options.params ?? DEFAULT_KDF_PARAMS);

  const salt = randomBytes(SALT_BYTES);
  const userKey = randomBytes(KEY_BYTES);
  const { wrapKey, authHash } = await deriveAll(password, salt, params, namespace);

  const wrapped = await aesGcmEncrypt(wrapKey, userKey);

  const recoveryBytes = randomBytes(RECOVERY_KEY_BYTES);
  const recoveryWrapKey = await deriveRecoveryWrapKey(recoveryBytes, namespace);
  const recoveryWrapped = await aesGcmEncrypt(recoveryWrapKey, userKey);

  const now = new Date().toISOString();
  const meta: VaultMeta = {
    opencreds: OPENCREDS_VERSION,
    namespace,
    profile: "user",
    kdf: params.kdf,
    kdfIterations: params.iterations,
    kdfSalt: toBase64(salt),
    protectedUserKey: toBase64(wrapped.ciphertext),
    protectedUserKeyIv: toBase64(wrapped.iv),
    recoveryKeyBlob: toBase64(recoveryWrapped.ciphertext),
    recoveryKeyIv: toBase64(recoveryWrapped.iv),
    authHash,
    createdAt: now,
    updatedAt: now,
  };

  return { meta, userKey, recoveryKey: formatRecoveryKey(recoveryBytes) };
}

/** Create a `team`-profile vault: a random key, wrapped by the caller's scheme. */
export function createTeamVault(namespace: Namespace = DEFAULT_NAMESPACE): { meta: VaultMeta; userKey: Uint8Array } {
  const ns = assertUsableNamespace(namespace);
  const now = new Date().toISOString();
  return {
    userKey: randomBytes(KEY_BYTES),
    meta: {
      opencreds: OPENCREDS_VERSION,
      namespace: ns,
      profile: "team",
      kdf: "pbkdf2-sha256",
      kdfIterations: DEFAULT_KDF_PARAMS.iterations,
      kdfSalt: toBase64(randomBytes(SALT_BYTES)),
      // A team vault's key is sealed to member public keys by the caller
      // (see plugins/credential-sharing), so there is no password-wrapped copy.
      protectedUserKey: "",
      protectedUserKeyIv: "",
      wrappedKeys: [],
      createdAt: now,
      updatedAt: now,
    },
  };
}

function paramsOf(meta: VaultMeta): KdfParams {
  return assertUsableKdfParams({ kdf: meta.kdf, iterations: meta.kdfIterations });
}

export function assertProfile(meta: VaultMeta, supported: Profile[]): void {
  if (!supported.includes(meta.profile)) {
    throw new Error(
      `This implementation does not support the "${meta.profile}" profile; refusing to open the vault`,
    );
  }
}

/** Unlock with the master password. Returns the user key. */
export async function unlockVault(
  meta: VaultMeta,
  password: string,
  options: { allowUnregisteredNamespace?: boolean } = {},
): Promise<Uint8Array> {
  assertProfile(meta, ["user"]);
  const namespace = assertUsableNamespace(meta.namespace, options.allowUnregisteredNamespace);
  const params = paramsOf(meta);

  const masterKey = await deriveMasterKey(password, fromBase64(meta.kdfSalt), params);
  const wrapKey = await deriveWrapKey(masterKey, namespace);
  try {
    return await aesGcmDecrypt(
      wrapKey,
      fromBase64(meta.protectedUserKeyIv),
      fromBase64(meta.protectedUserKey),
    );
  } catch {
    throw new Error("Wrong master password");
  }
}

/** Unlock with the recovery key, for the day the password is gone. */
export async function unlockWithRecoveryKey(
  meta: VaultMeta,
  recoveryKey: string,
  options: { allowUnregisteredNamespace?: boolean } = {},
): Promise<Uint8Array> {
  assertProfile(meta, ["user"]);
  const namespace = assertUsableNamespace(meta.namespace, options.allowUnregisteredNamespace);
  if (!meta.recoveryKeyBlob || !meta.recoveryKeyIv) {
    throw new Error("This vault has no recovery key");
  }
  const wrapKey = await deriveRecoveryWrapKey(parseRecoveryKey(recoveryKey), namespace);
  try {
    return await aesGcmDecrypt(wrapKey, fromBase64(meta.recoveryKeyIv), fromBase64(meta.recoveryKeyBlob));
  } catch {
    throw new Error("Wrong recovery key");
  }
}

/**
 * Change the master password.
 *
 * Re-wraps the same user key, so not one item is touched. The recovery blob is
 * left alone: it wraps the same key under a value the person still holds.
 */
export async function rewrapUserKey(
  meta: VaultMeta,
  userKey: Uint8Array,
  newPassword: string,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<VaultMeta> {
  assertProfile(meta, ["user"]);
  const namespace = assertUsableNamespace(meta.namespace, true);
  const usable = assertUsableKdfParams(params);
  const salt = randomBytes(SALT_BYTES);
  const masterKey = await deriveMasterKey(newPassword, salt, usable);
  const wrapKey = await deriveWrapKey(masterKey, namespace);
  const wrapped = await aesGcmEncrypt(wrapKey, userKey);

  return {
    ...meta,
    kdf: usable.kdf,
    kdfIterations: usable.iterations,
    kdfSalt: toBase64(salt),
    protectedUserKey: toBase64(wrapped.ciphertext),
    protectedUserKeyIv: toBase64(wrapped.iv),
    authHash: await deriveAuthHash(masterKey, namespace),
    updatedAt: new Date().toISOString(),
  };
}

/** Issue a fresh recovery key, invalidating the old one. */
export async function resetRecoveryKey(
  meta: VaultMeta,
  userKey: Uint8Array,
): Promise<{ meta: VaultMeta; recoveryKey: string }> {
  assertProfile(meta, ["user"]);
  const namespace = assertUsableNamespace(meta.namespace, true);
  const recoveryBytes = randomBytes(RECOVERY_KEY_BYTES);
  const wrapKey = await deriveRecoveryWrapKey(recoveryBytes, namespace);
  const wrapped = await aesGcmEncrypt(wrapKey, userKey);
  return {
    meta: {
      ...meta,
      recoveryKeyBlob: toBase64(wrapped.ciphertext),
      recoveryKeyIv: toBase64(wrapped.iv),
      updatedAt: new Date().toISOString(),
    },
    recoveryKey: formatRecoveryKey(recoveryBytes),
  };
}
