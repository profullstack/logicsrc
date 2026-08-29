/**
 * Cryptographic primitives, over WebCrypto only.
 *
 * WebCrypto rather than node:crypto because the same code has to run in a
 * browser extension's service worker, in a page, and in a CLI. Anything here
 * that reached for a Node built-in would fork the implementation at exactly the
 * layer where a fork is most expensive to verify.
 */

/** AES-GCM IV length. 96 bits is the size GCM is specified and fastest for. */
export const IV_BYTES = 12;

/** Symmetric key length. 256-bit AES throughout. */
export const KEY_BYTES = 32;

/** Minimum KDF salt. Anything shorter stops being a salt. */
export const MIN_SALT_BYTES = 16;

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error("WebCrypto is unavailable; OpenCreds requires globalThis.crypto.subtle");
  }
  return c.subtle;
}

/** Cryptographically secure random bytes. */
export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function utf8Encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(value: string): Uint8Array {
  const clean = value.replace(/[^0-9a-fA-F]/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Constant-time comparison.
 *
 * Used on auth hashes and any other secret-derived value. Everything else in
 * the format compares public data, where a fast path is fine.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** A UUID, from the platform's own generator. */
export function uuid(): string {
  return globalThis.crypto.randomUUID();
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  // A Uint8Array view over a larger buffer would otherwise hand WebCrypto the
  // whole buffer. Copy defensively; these are small.
  return bytes.slice().buffer as ArrayBuffer;
}

/** PBKDF2-HMAC-SHA256. The only deliberately expensive operation in the format. */
export async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
  length = KEY_BYTES,
): Promise<Uint8Array> {
  const material = await subtle().importKey("raw", bufferSource(utf8Encode(password)), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await subtle().deriveBits(
    { name: "PBKDF2", salt: bufferSource(salt), iterations, hash: "SHA-256" },
    material,
    length * 8,
  );
  return new Uint8Array(bits);
}

/**
 * HKDF-SHA256 with an empty salt.
 *
 * The guarantee being used is that outputs under distinct `info` strings are
 * computationally independent — which is what lets the auth hash be sent to a
 * server without helping anyone derive the wrapping key.
 */
export async function hkdf(key: Uint8Array, info: string, length = KEY_BYTES): Promise<Uint8Array> {
  const material = await subtle().importKey("raw", bufferSource(key), "HKDF", false, ["deriveBits"]);
  const bits = await subtle().deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: bufferSource(utf8Encode(info)) },
    material,
    length * 8,
  );
  return new Uint8Array(bits);
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest("SHA-256", bufferSource(bytes)));
}

/**
 * AES-256-GCM.
 *
 * The IV is generated here, per call, and never accepted from a caller. With
 * GCM a repeated IV under one key is not a weakness but a break — it leaks the
 * XOR of two plaintexts along with the authentication subkey — and the only
 * reliable way to prevent an accidental reuse is to remove the opportunity.
 */
export async function aesGcmEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = randomBytes(IV_BYTES);
  const cryptoKey = await subtle().importKey("raw", bufferSource(key), "AES-GCM", false, ["encrypt"]);
  const params: AesGcmParams = { name: "AES-GCM", iv: bufferSource(iv) };
  if (aad) params.additionalData = bufferSource(aad);
  const ciphertext = await subtle().encrypt(params, cryptoKey, bufferSource(plaintext));
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

export async function aesGcmDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await subtle().importKey("raw", bufferSource(key), "AES-GCM", false, ["decrypt"]);
  const params: AesGcmParams = { name: "AES-GCM", iv: bufferSource(iv) };
  if (aad) params.additionalData = bufferSource(aad);
  const plaintext = await subtle().decrypt(params, cryptoKey, bufferSource(ciphertext));
  return new Uint8Array(plaintext);
}
