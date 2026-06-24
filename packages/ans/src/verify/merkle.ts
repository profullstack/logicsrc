// RFC 6962 Merkle tree hashing + inclusion-proof verification.
//
// Leaf hash:  SHA-256(0x00 || data)
// Node hash:  SHA-256(0x01 || left || right)
//
// The tree builder + proof generator are included so the verifier can be tested
// against self-consistent vectors (and against hand-derived small trees) before
// upstream fixtures are available.

import { sha256, concat, bytesEqual } from '../bytes.js';

const LEAF_PREFIX = new Uint8Array([0x00]);
const NODE_PREFIX = new Uint8Array([0x01]);

export function leafHash(data: Uint8Array): Promise<Uint8Array> {
  return sha256(concat(LEAF_PREFIX, data));
}

export function nodeHash(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  return sha256(concat(NODE_PREFIX, left, right));
}

/** Largest power of two strictly less than n (n >= 2). */
function splitPoint(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/** Merkle Tree Hash (MTH) over a list of leaf payloads. */
export async function merkleRoot(leaves: Uint8Array[]): Promise<Uint8Array> {
  if (leaves.length === 0) return sha256(new Uint8Array(0));
  if (leaves.length === 1) return leafHash(leaves[0]);
  const k = splitPoint(leaves.length);
  const [left, right] = await Promise.all([merkleRoot(leaves.slice(0, k)), merkleRoot(leaves.slice(k))]);
  return nodeHash(left, right);
}

/** Audit path for the leaf at `index`, leaf-to-root order. */
export async function inclusionProof(leaves: Uint8Array[], index: number): Promise<Uint8Array[]> {
  if (index < 0 || index >= leaves.length) throw new Error('inclusionProof: index out of range');
  if (leaves.length <= 1) return [];
  const k = splitPoint(leaves.length);
  if (index < k) {
    const sub = await inclusionProof(leaves.slice(0, k), index);
    return [...sub, await merkleRoot(leaves.slice(k))];
  }
  const sub = await inclusionProof(leaves.slice(k), index - k);
  return [...sub, await merkleRoot(leaves.slice(0, k))];
}

async function rootFromProof(index: number, size: number, leaf: Uint8Array, path: Uint8Array[]): Promise<Uint8Array> {
  if (size <= 1) {
    if (path.length !== 0) throw new Error('inclusion proof: path too long');
    return leaf;
  }
  if (path.length === 0) throw new Error('inclusion proof: path too short');
  const k = splitPoint(size);
  const sibling = path[path.length - 1];
  const rest = path.slice(0, -1);
  if (index < k) {
    const sub = await rootFromProof(index, k, leaf, rest);
    return nodeHash(sub, sibling);
  }
  const sub = await rootFromProof(index - k, size - k, leaf, rest);
  return nodeHash(sibling, sub);
}

export interface InclusionInput {
  index: number;
  size: number;
  leafHash: Uint8Array;
  auditPath: Uint8Array[];
  root: Uint8Array;
}

export async function verifyInclusion(input: InclusionInput): Promise<boolean> {
  if (input.index < 0 || input.index >= input.size) return false;
  try {
    const computed = await rootFromProof(input.index, input.size, input.leafHash, input.auditPath);
    return bytesEqual(computed, input.root);
  } catch {
    return false;
  }
}
