// Transparency-log verifier keys, indexed by 4-byte kid (lowercase hex).
//
// M1 accepts a JWKS-style list ({ kid, jwk }). The upstream sumdb-note
// (`/root-keys`) parser is M2 (TODO) — captured against fixtures.

import { importEs256VerifyKey } from './es256.js';
import { fromHex, toHex } from '../bytes.js';
import type { RootKeys } from '../types.js';

export interface RootKeyEntry {
  /** 4-byte key id as hex (e.g. "01020304") or any string the receipts use. */
  kid: string;
  jwk: JsonWebKey;
}

export async function rootKeysFromEntries(entries: RootKeyEntry[]): Promise<RootKeys> {
  const keys = new Map<string, CryptoKey>();
  for (const entry of entries) {
    const kidHex = normalizeKid(entry.kid);
    keys.set(kidHex, await importEs256VerifyKey(entry.jwk));
  }
  return { keys };
}

/** Accept kid as hex ("01020304") or as already-normalized; lowercases hex. */
function normalizeKid(kid: string): string {
  const lower = kid.toLowerCase();
  if (/^[0-9a-f]+$/.test(lower) && lower.length % 2 === 0) return toHex(fromHex(lower));
  return lower;
}
