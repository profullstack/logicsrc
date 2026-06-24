// Offline ANS verifier. No network: given root keys (fetched once or pinned),
// it cryptographically verifies a receipt against the transparency log without
// trusting the registry operator.

import { parseReceipt, sigStructure } from './cose.js';
import { verifyEs256 } from './es256.js';
import { leafHash, verifyInclusion } from './merkle.js';
import { toHex, fromUtf8 } from '../bytes.js';
import { toAnsName } from '../name.js';
import type { AnsIdentity, Receipt, VerifyOptions, VerifyResult } from '../types.js';

/**
 * Verify a SCITT COSE_Sign1 inclusion receipt:
 *  1. map kid -> root verifier key
 *  2. ES256-verify the signature over the COSE Sig_structure
 *  3. recompute the leaf hash (RFC 6962) and walk the inclusion proof to the root
 */
export async function verifyReceipt(receipt: Receipt, opts: VerifyOptions): Promise<VerifyResult> {
  let env;
  try {
    env = parseReceipt(receipt.cbor);
  } catch (error) {
    return { ok: false, reason: `parse: ${(error as Error).message}` };
  }

  const key = opts.rootKeys.keys.get(env.kidHex);
  if (!key) return { ok: false, reason: `unknown kid ${env.kidHex}` };

  const message = sigStructure(env.protectedBytes, env.payload);
  const signatureOk = await verifyEs256(key, env.signature, message);
  if (!signatureOk) return { ok: false, reason: 'invalid signature' };

  const leaf = await leafHash(env.payload);
  const inclusionOk = await verifyInclusion({
    index: env.proof.index,
    size: env.proof.size,
    leafHash: leaf,
    auditPath: env.proof.path,
    root: env.proof.root,
  });
  if (!inclusionOk) return { ok: false, reason: 'inclusion proof failed' };

  return { ok: true, rootHashHex: toHex(env.proof.root) };
}

/**
 * Verify a resolved identity: the receipt must verify AND its signed payload
 * must bind the resolved ans:// name.
 */
export async function verifyResolution(identity: AnsIdentity, opts: VerifyOptions): Promise<VerifyResult> {
  const result = await verifyReceipt(identity.receipt, opts);
  if (!result.ok) return result;

  const env = parseReceipt(identity.receipt.cbor);
  const signedName = fromUtf8(env.payload).trim();
  const expected = toAnsName(identity.name).raw;
  if (signedName !== expected) {
    return { ok: false, reason: `name binding mismatch: receipt signs ${signedName}, resolved ${expected}` };
  }
  return result;
}
