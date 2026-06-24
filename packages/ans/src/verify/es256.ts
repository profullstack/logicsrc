// ES256 (ECDSA P-256 / SHA-256) verification via WebCrypto. COSE signatures are
// raw IEEE-P1363 (r || s, 64 bytes), which is exactly what WebCrypto expects.

export function importEs256VerifyKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}

export function verifyEs256(key: CryptoKey, signature: Uint8Array, message: Uint8Array): Promise<boolean> {
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signature as unknown as ArrayBuffer,
    message as unknown as ArrayBuffer,
  );
}
