import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import type { KeyObject } from "node:crypto";
import type { Signature } from "./types.js";

/**
 * Pluggable signature envelope.
 *
 * PRD open question 2 asked whether package signing should start from JWS, a
 * DID proof, or Sigstore. This implementation defines the envelope as the
 * contract and ships ONE reference profile — `jws-ed25519`, detached, over the
 * package digest — so no DID method, wallet, or CA is mandatory (R19). Other
 * providers plug in by implementing this interface.
 */
export interface SignatureProvider {
  readonly algorithm: string;
  readonly signer: string;
  readonly keyId?: string;
  sign(payload: string): string;
  verify(payload: string, signature: string): boolean;
}

export interface VerificationResult {
  ok: boolean;
  algorithm: string;
  signer: string;
  reason?: string;
}

const ED25519 = "jws-ed25519";

export function createEd25519Provider(options: {
  signer: string;
  privateKey: KeyObject | string;
  publicKey?: KeyObject | string;
  keyId?: string;
}): SignatureProvider {
  const privateKey =
    typeof options.privateKey === "string" ? createPrivateKey(options.privateKey) : options.privateKey;
  const publicKey = options.publicKey
    ? typeof options.publicKey === "string"
      ? createPublicKey(options.publicKey)
      : options.publicKey
    : createPublicKey(privateKey);

  return {
    algorithm: ED25519,
    signer: options.signer,
    keyId: options.keyId,
    sign(payload) {
      return base64url(sign(null, Buffer.from(payload, "utf8"), privateKey));
    },
    verify(payload, signature) {
      try {
        return verify(null, Buffer.from(payload, "utf8"), publicKey, fromBase64url(signature));
      } catch {
        return false;
      }
    }
  };
}

/** Generate a throwaway Ed25519 keypair — used by tests and `init`. */
export function generateEd25519KeyPair(): { privateKey: KeyObject; publicKey: KeyObject } {
  return generateKeyPairSync("ed25519");
}

/** Sign a package digest, producing the envelope stored in the manifest. */
export function signDigest(
  digest: string,
  provider: SignatureProvider,
  now: string
): Signature {
  return {
    algorithm: provider.algorithm,
    signer: provider.signer,
    value: provider.sign(digest),
    created: now,
    ...(provider.keyId ? { keyId: provider.keyId } : {})
  };
}

export function verifyDigestSignature(
  digest: string,
  signature: Signature,
  resolveProvider: (signature: Signature) => SignatureProvider | undefined
): VerificationResult {
  const provider = resolveProvider(signature);
  if (!provider) {
    return {
      ok: false,
      algorithm: signature.algorithm,
      signer: signature.signer,
      reason: `No verifier registered for signer ${signature.signer} (${signature.algorithm})`
    };
  }
  if (provider.algorithm !== signature.algorithm) {
    return {
      ok: false,
      algorithm: signature.algorithm,
      signer: signature.signer,
      reason: `Verifier algorithm ${provider.algorithm} does not match signature ${signature.algorithm}`
    };
  }
  const ok = provider.verify(digest, signature.value);
  return {
    ok,
    algorithm: signature.algorithm,
    signer: signature.signer,
    reason: ok ? undefined : "Signature does not verify against the package digest"
  };
}

/**
 * Trust policy for imported maintainers (R112): a package's signatures are
 * only meaningful against an explicit list of signers you already trust.
 */
export function verifyPackageSignatures(
  digest: string,
  signatures: Signature[] | undefined,
  trusted: Map<string, SignatureProvider>
): { ok: boolean; results: VerificationResult[]; untrusted: string[] } {
  const results: VerificationResult[] = [];
  const untrusted: string[] = [];

  for (const signature of signatures ?? []) {
    if (!trusted.has(signature.signer)) untrusted.push(signature.signer);
    results.push(verifyDigestSignature(digest, signature, (s) => trusted.get(s.signer)));
  }

  return {
    ok: results.length > 0 && results.every((r) => r.ok),
    results,
    untrusted
  };
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}
