// COSE_Sign1 (RFC 8152) construction + parsing, plus the M1 ANS receipt
// envelope model.
//
// A receipt is a COSE_Sign1 (CBOR tag 18) over the agent identity statement
// (the payload). The transparency-log inclusion proof is carried in an
// unprotected header under the label "ans-proof":
//
//   { root: bstr, index: uint, size: uint, path: [bstr] }
//
// NOTE: this envelope shape is the LogicSRC M1 model. Upstream ANS may place the
// proof in a different (registered SCITT) header; M2 pins this against fixtures
// captured from the upstream Go server and adjusts `parseReceipt` accordingly.

import { CborTag, decodeCbor, encodeCbor, type CborValue } from '../cbor.js';
import { toHex } from '../bytes.js';

export const COSE_SIGN1_TAG = 18;
export const COSE_ALG_ES256 = -7;
const HEADER_ALG = 1;
const HEADER_KID = 4;
const HEADER_ANS_PROOF = 'ans-proof';

export interface InclusionProof {
  root: Uint8Array;
  index: number;
  size: number;
  path: Uint8Array[];
}

export interface ReceiptEnvelope {
  /** lowercase hex of the 4-byte kid header. */
  kidHex: string;
  alg: number;
  payload: Uint8Array;
  signature: Uint8Array;
  proof: InclusionProof;
  /** Raw CBOR of the protected header map (signed). */
  protectedBytes: Uint8Array;
}

/** Canonical COSE Sig_structure bytes the signature covers. */
export function sigStructure(protectedBytes: Uint8Array, payload: Uint8Array): Uint8Array {
  return encodeCbor(['Signature1', protectedBytes, new Uint8Array(0), payload]);
}

/** Build a COSE_Sign1 receipt. Used by tests/tools; the signer provides ES256(r||s). */
export async function buildReceipt(opts: {
  kid: Uint8Array;
  payload: Uint8Array;
  proof: InclusionProof;
  sign: (message: Uint8Array) => Promise<Uint8Array>;
}): Promise<Uint8Array> {
  const protectedBytes = encodeCbor(new Map<CborValue, CborValue>([[HEADER_ALG, COSE_ALG_ES256]]));
  const proofMap = new Map<CborValue, CborValue>([
    ['root', opts.proof.root],
    ['index', opts.proof.index],
    ['size', opts.proof.size],
    ['path', opts.proof.path as CborValue[]],
  ]);
  const unprotected = new Map<CborValue, CborValue>([
    [HEADER_KID, opts.kid],
    [HEADER_ANS_PROOF, proofMap],
  ]);
  const signature = await opts.sign(sigStructure(protectedBytes, opts.payload));
  const sign1 = new CborTag(COSE_SIGN1_TAG, [protectedBytes, unprotected, opts.payload, signature]);
  return encodeCbor(sign1);
}

/** Parse COSE_Sign1 receipt bytes into a structured envelope. */
export function parseReceipt(cbor: Uint8Array): ReceiptEnvelope {
  let decoded = decodeCbor(cbor);
  if (decoded instanceof CborTag) {
    if (decoded.tag !== COSE_SIGN1_TAG) throw new Error(`receipt: unexpected CBOR tag ${decoded.tag}`);
    decoded = decoded.value;
  }
  if (!Array.isArray(decoded) || decoded.length !== 4) throw new Error('receipt: not a COSE_Sign1 array');

  const [protectedBytes, unprotected, payload, signature] = decoded;
  if (!(protectedBytes instanceof Uint8Array)) throw new Error('receipt: bad protected header');
  if (!(unprotected instanceof Map)) throw new Error('receipt: bad unprotected header');
  if (!(payload instanceof Uint8Array)) throw new Error('receipt: detached/empty payload unsupported in M1');
  if (!(signature instanceof Uint8Array)) throw new Error('receipt: bad signature');

  const protectedMap = decodeCbor(protectedBytes);
  const alg = protectedMap instanceof Map ? protectedMap.get(HEADER_ALG) : undefined;

  const kid = unprotected.get(HEADER_KID) ?? (protectedMap instanceof Map ? protectedMap.get(HEADER_KID) : undefined);
  if (!(kid instanceof Uint8Array)) throw new Error('receipt: missing kid header');

  const proofRaw = unprotected.get(HEADER_ANS_PROOF);
  if (!(proofRaw instanceof Map)) throw new Error('receipt: missing ans-proof header');
  const proof = parseProof(proofRaw);

  return {
    kidHex: toHex(kid),
    alg: typeof alg === 'number' ? alg : COSE_ALG_ES256,
    payload,
    signature,
    proof,
    protectedBytes,
  };
}

function parseProof(map: Map<CborValue, CborValue>): InclusionProof {
  const root = map.get('root');
  const index = map.get('index');
  const size = map.get('size');
  const path = map.get('path');
  if (!(root instanceof Uint8Array)) throw new Error('receipt: proof.root missing');
  if (typeof index !== 'number') throw new Error('receipt: proof.index missing');
  if (typeof size !== 'number') throw new Error('receipt: proof.size missing');
  if (!Array.isArray(path) || path.some((p) => !(p instanceof Uint8Array))) throw new Error('receipt: proof.path malformed');
  return { root, index, size, path: path as Uint8Array[] };
}
