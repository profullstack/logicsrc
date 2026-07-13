/**
 * End-to-end credential-sharing crypto for LogicSRC team vaults.
 *
 * Trust model (1Password-style): the server only ever stores ciphertext and
 * member public keys. Secret values are encrypted client-side and only decrypt
 * on a device that holds the member's private key.
 *
 * Scheme
 * ------
 * - Each MEMBER has an X25519 identity keypair. The public key is uploaded to
 *   the server; the secret key never leaves the member's machine.
 * - Each VAULT has a symmetric data-encryption key (the DEK, 32 bytes).
 * - Each SECRET VALUE is encrypted with the vault DEK using crypto_secretbox
 *   (XSalsa20-Poly1305) under a fresh random nonce.
 * - The vault DEK is WRAPPED to each member with crypto_box_seal (anonymous
 *   sealed box) against that member's public key. The server stores one wrapped
 *   DEK per member; only that member can open it. The server never sees the DEK.
 *
 * Granting a new member access = an existing member unwraps the DEK with their
 * secret key and re-wraps (seals) it to the new member's public key. The DEK
 * plaintext exists only in memory on an already-authorized member's machine.
 */

type Sodium = {
  ready: Promise<void>;
  base64_variants: { ORIGINAL: number };
  crypto_secretbox_NONCEBYTES: number;
  crypto_secretbox_KEYBYTES: number;
  from_base64(input: string, variant: number): Uint8Array;
  to_base64(input: Uint8Array, variant: number): string;
  from_string(input: string): Uint8Array;
  to_string(input: Uint8Array): string;
  randombytes_buf(length: number): Uint8Array;
  crypto_box_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array };
  crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array;
  crypto_box_seal_open(ciphertext: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array): Uint8Array;
  crypto_secretbox_easy(message: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array;
  crypto_secretbox_open_easy(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array;
  crypto_scalarmult_base(privateKey: Uint8Array): Uint8Array;
};

let sodiumPromise: Promise<Sodium> | undefined;

async function loadSodium(): Promise<Sodium> {
  if (!sodiumPromise) {
    sodiumPromise = (async () => {
      // libsodium-wrappers ships a broken ESM entry (its .mjs imports a sibling
      // libsodium.mjs that isn't published). Load the self-contained CJS build
      // via createRequire so this works under both native ESM and vitest.
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      const mod = require("libsodium-wrappers") as { default?: Sodium } & Sodium;
      const sodium: Sodium = mod.default ?? mod;
      await sodium.ready;
      return sodium;
    })();
  }
  return sodiumPromise;
}

function b64(sodium: Sodium, bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

function unb64(sodium: Sodium, value: string): Uint8Array {
  return sodium.from_base64(value, sodium.base64_variants.ORIGINAL);
}

/** A member identity keypair, base64-encoded for storage/transport. */
export interface IdentityKeyPair {
  publicKey: string;
  secretKey: string;
}

/** A single secret value encrypted under a vault DEK. */
export interface SealedValue {
  nonce: string;
  ciphertext: string;
}

/** Generate a fresh X25519 identity keypair for a member. */
export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  const sodium = await loadSodium();
  const { publicKey, privateKey } = sodium.crypto_box_keypair();
  return { publicKey: b64(sodium, publicKey), secretKey: b64(sodium, privateKey) };
}

/** Derive the public key for a stored secret key (used to validate an identity file). */
export async function publicKeyForSecret(secretKeyB64: string): Promise<string> {
  const sodium = await loadSodium();
  return b64(sodium, sodium.crypto_scalarmult_base(unb64(sodium, secretKeyB64)));
}

/** Generate a new random vault data-encryption key (raw bytes, base64). */
export async function generateVaultKey(): Promise<string> {
  const sodium = await loadSodium();
  return b64(sodium, sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES));
}

/** Seal (wrap) a vault DEK to a member's public key. Only their secret key opens it. */
export async function wrapVaultKey(dekB64: string, memberPublicKeyB64: string): Promise<string> {
  const sodium = await loadSodium();
  const sealed = sodium.crypto_box_seal(unb64(sodium, dekB64), unb64(sodium, memberPublicKeyB64));
  return b64(sodium, sealed);
}

/** Open a wrapped vault DEK with the member's own keypair. */
export async function unwrapVaultKey(wrappedB64: string, identity: IdentityKeyPair): Promise<string> {
  const sodium = await loadSodium();
  const dek = sodium.crypto_box_seal_open(
    unb64(sodium, wrappedB64),
    unb64(sodium, identity.publicKey),
    unb64(sodium, identity.secretKey)
  );
  return b64(sodium, dek);
}

/** Encrypt a raw secret value with the vault DEK. */
export async function encryptValue(value: string, dekB64: string): Promise<SealedValue> {
  const sodium = await loadSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(sodium.from_string(value), nonce, unb64(sodium, dekB64));
  return { nonce: b64(sodium, nonce), ciphertext: b64(sodium, ciphertext) };
}

/** Decrypt a sealed secret value with the vault DEK. */
export async function decryptValue(sealed: SealedValue, dekB64: string): Promise<string> {
  const sodium = await loadSodium();
  const plain = sodium.crypto_secretbox_open_easy(
    unb64(sodium, sealed.ciphertext),
    unb64(sodium, sealed.nonce),
    unb64(sodium, dekB64)
  );
  return sodium.to_string(plain);
}
