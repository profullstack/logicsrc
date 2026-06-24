import { describe, expect, it } from 'vitest';
import { inclusionProof, leafHash, merkleRoot, nodeHash, verifyInclusion } from './merkle.js';
import { utf8, toHex } from '../bytes.js';

const leaves = ['a', 'b', 'c', 'd'].map(utf8);

describe('RFC 6962 merkle tree', () => {
  it('computes the root as node(node(la,lb), node(lc,ld)) for 4 leaves', async () => {
    const [la, lb, lc, ld] = await Promise.all(leaves.map(leafHash));
    const expected = await nodeHash(await nodeHash(la, lb), await nodeHash(lc, ld));
    expect(toHex(await merkleRoot(leaves))).toBe(toHex(expected));
  });

  it('verifies inclusion proofs for every leaf', async () => {
    const root = await merkleRoot(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const auditPath = await inclusionProof(leaves, i);
      const ok = await verifyInclusion({ index: i, size: leaves.length, leafHash: await leafHash(leaves[i]), auditPath, root });
      expect(ok).toBe(true);
    }
  });

  it('verifies inclusion for an odd-sized (5-leaf) tree', async () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map(utf8);
    const root = await merkleRoot(five);
    const auditPath = await inclusionProof(five, 4);
    expect(await verifyInclusion({ index: 4, size: 5, leafHash: await leafHash(five[4]), auditPath, root })).toBe(true);
  });

  it('rejects a tampered proof, wrong index, and out-of-range index', async () => {
    const root = await merkleRoot(leaves);
    const auditPath = await inclusionProof(leaves, 1);
    const lb = await leafHash(leaves[1]);
    expect(await verifyInclusion({ index: 1, size: 4, leafHash: await leafHash(utf8('x')), auditPath, root })).toBe(false);
    expect(await verifyInclusion({ index: 2, size: 4, leafHash: lb, auditPath, root })).toBe(false);
    expect(await verifyInclusion({ index: 9, size: 4, leafHash: lb, auditPath, root })).toBe(false);
  });
});
