/**
 * Key derivation.
 *
 * The master password is stretched once into a master key, and everything else
 * is derived from that by HKDF under a distinct label. The labels are prefixed
 * by the vault's namespace and versioned, because they are baked into every
 * ciphertext an existing vault has written: a label can be superseded, never
 * edited.
 */

import { pbkdf2, hkdf, toBase64, KEY_BYTES, MIN_SALT_BYTES } from "./primitives.js";
import {
  DEFAULT_NAMESPACE,
  NAMESPACE_PATTERN,
  REGISTERED_NAMESPACES,
  type KdfName,
  type KdfParams,
  type Namespace,
} from "./types.js";

export const KDF = {
  PBKDF2_SHA256: "pbkdf2-sha256",
  /**
   * Reserved. Argon2id needs WASM in the browser, which means adding
   * 'wasm-unsafe-eval' to an extension CSP — a real cost paid by every user to
   * benefit the KDF. Parameters are carried per vault specifically so this can
   * be adopted later without invalidating a single existing vault.
   */
  ARGON2ID: "argon2id",
} as const;

/** OWASP's current floor for PBKDF2-HMAC-SHA256. */
export const DEFAULT_KDF_PARAMS: Readonly<KdfParams> = Object.freeze({
  kdf: KDF.PBKDF2_SHA256 as KdfName,
  iterations: 600_000,
});

/**
 * The lowest iteration count a client will accept.
 *
 * Parameters arrive from a server, which makes them attacker-controlled the
 * moment the server is compromised: serving `iterations: 1` would turn every
 * captured auth hash into an offline guessing exercise with no work factor.
 * Refuse to derive at all below this rather than silently doing weak work.
 */
export const MIN_PBKDF2_ITERATIONS = 100_000;

/** Domain-separation labels. Append-only — supersede, never edit. */
export function wrapLabel(namespace: Namespace): string {
  return `${namespace}:vault:wrap:v1`;
}

export function authLabel(namespace: Namespace): string {
  return `${namespace}:vault:auth:v1`;
}

export function recoveryLabel(namespace: Namespace): string {
  return `${namespace}:vault:recovery:v1`;
}

export function itemLabel(namespace: Namespace, version: number, id: string): string {
  return `${namespace}:vault:item:${version}:${id}`;
}

export function databaseLabel(namespace: Namespace): string {
  return `${namespace}:database:v1`;
}

/**
 * Validate a namespace.
 *
 * Accepting an arbitrary prefix is accepting an arbitrary derivation, so an
 * unregistered one needs an explicit opt-in rather than a shrug.
 */
export function assertUsableNamespace(namespace: string, allowUnregistered = false): Namespace {
  if (!NAMESPACE_PATTERN.test(namespace)) {
    throw new Error(`Invalid namespace: ${JSON.stringify(namespace)}`);
  }
  if (!allowUnregistered && !REGISTERED_NAMESPACES.includes(namespace)) {
    throw new Error(
      `Unregistered namespace "${namespace}" — registered namespaces are ${REGISTERED_NAMESPACES.join(", ")}. ` +
        "Pass allowUnregistered to open it anyway.",
    );
  }
  return namespace;
}

/** Validate KDF parameters received from a server, or read from a file. */
export function assertUsableKdfParams(params: Partial<KdfParams> | undefined): KdfParams {
  const kdf = params?.kdf;
  if (kdf !== KDF.PBKDF2_SHA256) {
    throw new Error(
      kdf === KDF.ARGON2ID
        ? "argon2id is registered but not implemented; refusing to fall back to a weaker KDF"
        : `Unsupported KDF: ${kdf ?? "missing"}`,
    );
  }
  const iterations = params?.iterations;
  if (!Number.isInteger(iterations) || (iterations as number) < MIN_PBKDF2_ITERATIONS) {
    throw new Error(
      `Refusing to derive a key with ${iterations} iterations — the minimum is ${MIN_PBKDF2_ITERATIONS}`,
    );
  }
  return { kdf, iterations: iterations as number };
}

/**
 * Stretch the master password into the master key.
 *
 * The master key never encrypts anything directly; it exists only to be split
 * by the derivations below.
 */
export async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<Uint8Array> {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("A master password is required");
  }
  if (!(salt instanceof Uint8Array) || salt.length < MIN_SALT_BYTES) {
    throw new Error(`KDF salt must be at least ${MIN_SALT_BYTES} bytes`);
  }
  const { iterations } = assertUsableKdfParams(params);
  return pbkdf2(password, salt, iterations, KEY_BYTES);
}

/** The key that wraps the user key. Never leaves the device. */
export function deriveWrapKey(masterKey: Uint8Array, namespace: Namespace = DEFAULT_NAMESPACE): Promise<Uint8Array> {
  return hkdf(masterKey, wrapLabel(namespace), KEY_BYTES);
}

/**
 * The only password-derived value that may leave the device. Because it comes
 * out of a different HKDF label than the wrapping key, holding it does not help
 * an attacker decrypt anything. A server storing it hashes it again.
 */
export async function deriveAuthHash(
  masterKey: Uint8Array,
  namespace: Namespace = DEFAULT_NAMESPACE,
): Promise<string> {
  return toBase64(await hkdf(masterKey, authLabel(namespace), KEY_BYTES));
}

/** The key that wraps the recovery copy of the user key. */
export function deriveRecoveryWrapKey(
  recoveryKey: Uint8Array,
  namespace: Namespace = DEFAULT_NAMESPACE,
): Promise<Uint8Array> {
  return hkdf(recoveryKey, recoveryLabel(namespace), KEY_BYTES);
}

/** The key an export is encrypted under — derived from the export passphrase, not the vault. */
export async function deriveExportKey(
  passphrase: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS,
  namespace: Namespace = DEFAULT_NAMESPACE,
): Promise<Uint8Array> {
  const master = await deriveMasterKey(passphrase, salt, params);
  return hkdf(master, databaseLabel(namespace), KEY_BYTES);
}

/** Derive both halves at once — the common path on unlock. */
export async function deriveAll(
  password: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS,
  namespace: Namespace = DEFAULT_NAMESPACE,
): Promise<{ masterKey: Uint8Array; wrapKey: Uint8Array; authHash: string }> {
  const masterKey = await deriveMasterKey(password, salt, params);
  const [wrapKey, authHash] = await Promise.all([
    deriveWrapKey(masterKey, namespace),
    deriveAuthHash(masterKey, namespace),
  ]);
  return { masterKey, wrapKey, authHash };
}
