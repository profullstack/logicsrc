// @logicsrc/ans — TypeScript SDK for the Agent Name Service (ANS).
// See docs/ans-sdk.md. M1: resolver + offline transparency-log verifier.

export * from './types.js';
export { parseAnsName, formatAnsName, toAnsName } from './name.js';
export { AnsClient, type AnsClientOptions } from './client.js';
export { verifyReceipt, verifyResolution } from './verify/index.js';
export { rootKeysFromEntries, type RootKeyEntry } from './verify/rootkeys.js';

// Lower-level building blocks (stable enough to reuse; handy for tooling/tests).
export { merkleRoot, inclusionProof, verifyInclusion, leafHash, nodeHash } from './verify/merkle.js';
export { buildReceipt, parseReceipt, sigStructure, type ReceiptEnvelope, type InclusionProof } from './verify/cose.js';
export { importEs256VerifyKey, verifyEs256 } from './verify/es256.js';
export { encodeCbor, decodeCbor, CborTag, type CborValue } from './cbor.js';
export * as bytes from './bytes.js';
