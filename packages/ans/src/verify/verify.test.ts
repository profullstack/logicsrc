import { beforeAll, describe, expect, it } from 'vitest';
import { buildReceipt } from './cose.js';
import { inclusionProof, leafHash, merkleRoot } from './merkle.js';
import { rootKeysFromEntries } from './rootkeys.js';
import { verifyReceipt, verifyResolution } from './index.js';
import { utf8 } from '../bytes.js';
import type { AnsIdentity, RootKeys } from '../types.js';

const KID = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
const NAME = 'ans://v1.0.0.my-agent.example.com';
const payload = utf8(NAME);
const otherLeaves = [utf8('sibling-0'), utf8('sibling-2'), utf8('sibling-3')];
const leaves = [otherLeaves[0], payload, otherLeaves[1], otherLeaves[2]];
const INDEX = 1;

let keyPair: CryptoKeyPair;
let rootKeys: RootKeys;
let receiptCbor: Uint8Array;

async function sign(message: Uint8Array): Promise<Uint8Array> {
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, message as unknown as ArrayBuffer);
  return new Uint8Array(sig);
}

beforeAll(async () => {
  keyPair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  rootKeys = await rootKeysFromEntries([{ kid: '01020304', jwk }]);

  const root = await merkleRoot(leaves);
  const path = await inclusionProof(leaves, INDEX);
  receiptCbor = await buildReceipt({ kid: KID, payload, proof: { root, index: INDEX, size: leaves.length, path }, sign });
});

describe('offline receipt verification', () => {
  it('verifies a well-formed receipt (signature + inclusion proof)', async () => {
    const result = await verifyReceipt({ cbor: receiptCbor }, { rootKeys });
    expect(result.ok).toBe(true);
    expect(result.rootHashHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifies a resolution whose payload binds the resolved name', async () => {
    const identity: AnsIdentity = {
      name: NAME as never, // toAnsName normalizes the string form
      capabilities: [],
      events: [],
      receipt: { cbor: receiptCbor },
    } as unknown as AnsIdentity;
    const result = await verifyResolution({ ...identity, name: { raw: NAME, version: '1.0.0', agent: 'my-agent', domain: 'example.com' } }, { rootKeys });
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown kid', async () => {
    const empty = await rootKeysFromEntries([]);
    const result = await verifyReceipt({ cbor: receiptCbor }, { rootKeys: empty });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('unknown kid');
  });

  it('rejects a receipt signed by a different key', async () => {
    const other = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const wrongJwk = await crypto.subtle.exportKey('jwk', other.publicKey);
    const wrongKeys = await rootKeysFromEntries([{ kid: '01020304', jwk: wrongJwk }]);
    const result = await verifyReceipt({ cbor: receiptCbor }, { rootKeys: wrongKeys });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid signature');
  });

  it('rejects a tampered inclusion proof (wrong root)', async () => {
    const badRoot = new Uint8Array(32).fill(0xff);
    const path = await inclusionProof(leaves, INDEX);
    const tampered = await buildReceipt({ kid: KID, payload, proof: { root: badRoot, index: INDEX, size: leaves.length, path }, sign });
    const result = await verifyReceipt({ cbor: tampered }, { rootKeys });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('inclusion proof failed');
  });

  it('rejects a resolution whose name does not match the signed payload', async () => {
    const result = await verifyResolution(
      { name: { raw: 'ans://v1.0.0.other.example.com', version: '1.0.0', agent: 'other', domain: 'example.com' }, capabilities: [], events: [], receipt: { cbor: receiptCbor } },
      { rootKeys },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('name binding mismatch');
  });
});
