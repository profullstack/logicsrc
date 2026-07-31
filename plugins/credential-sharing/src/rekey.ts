/**
 * Vault re-keying (rotation) for LogicSRC team vaults.
 *
 * Re-keying replaces a vault's data-encryption key. Every secret is decrypted
 * with the old DEK and re-encrypted under a new one, and the new DEK is sealed
 * afresh to each member who should keep access. Secret VALUES never change --
 * that is the whole point. Nothing downstream breaks; what changes is that
 * every previously-issued wrapped DEK becomes useless, so anyone dropped from
 * the grant list can no longer read the vault even if they kept a copy of their
 * old grant.
 *
 * This module is deliberately pure: it takes the current sealed state plus the
 * caller's identity and returns the complete next state. All of it runs on the
 * member's machine -- the server receives ciphertext and sealed keys only, and
 * never sees either DEK.
 *
 * Ordering matters and is NOT this module's problem: a half-applied rotation
 * (new grants, old ciphertext, or the reverse) locks everyone out permanently,
 * because the DEK is recoverable only through the grants. The server applies
 * the result of `planVaultRekey` in a single transaction; see the
 * /vaults/:id/rekey endpoint.
 */
import { decryptValue, encryptValue, generateVaultKey, unwrapVaultKey, wrapVaultKey, type IdentityKeyPair } from "./crypto.js";
import { fingerprintValue, fingerprintsEqual } from "./fingerprint.js";

/** A secret as the server stores it. */
export interface SealedSecret {
  name: string;
  nonce: string;
  ciphertext: string;
  fingerprint: string;
}

/** A member who is a candidate to receive the new DEK. */
export interface RekeyMember {
  email: string;
  /** X25519 public key, or null if they have never uploaded one. */
  publicKey: string | null;
  /** Team membership status. Only "active" members are kept by default. */
  status: "active" | "invited";
  /** Whether they hold a grant on this vault today. */
  hasAccess: boolean;
}

export interface RekeyPlanInput {
  /** The caller's own wrapped DEK, which bootstraps the whole operation. */
  myWrappedDek: string;
  /** The caller's identity keypair. */
  identity: IdentityKeyPair;
  /** Every secret currently in the vault. */
  secrets: SealedSecret[];
  /** Every team member, with their current access. */
  members: RekeyMember[];
  /**
   * Who keeps access.
   * - "active" (default): only members whose team status is "active" AND who
   *   hold a grant today. This is the "someone left the team" rotation.
   * - "all": everyone holding a grant today, whatever their status. Pure
   *   crypto hygiene -- re-key without revoking anyone.
   */
  scope?: "active" | "all";
}

export interface RekeyPlan {
  /** Re-encrypted secrets, ready to write. Values are identical to the input. */
  secrets: SealedSecret[];
  /** New sealed DEKs, one per retained member. */
  grants: Array<{ email: string; wrappedDek: string }>;
  /** Members whose access this rotation removes. */
  revoked: string[];
  /** Members skipped because they have no public key to seal to. */
  skipped: Array<{ email: string; reason: string }>;
}

/** Members who have no key yet cannot be sealed to, whatever the scope. */
function sealable(member: RekeyMember): boolean {
  return typeof member.publicKey === "string" && member.publicKey.length > 0;
}

/**
 * Build the complete next state of a vault under a fresh DEK.
 *
 * Throws rather than returning a partial plan: a rotation that silently dropped
 * a secret it could not decrypt would destroy it on write.
 */
export async function planVaultRekey(input: RekeyPlanInput): Promise<RekeyPlan> {
  const scope = input.scope ?? "active";

  const oldDek = await unwrapVaultKey(input.myWrappedDek, input.identity);
  const newDek = await generateVaultKey();

  // Decrypt everything BEFORE encrypting anything. If one secret fails to open
  // we abort with the vault untouched, rather than writing a half-rotated set.
  const plaintext = new Map<string, string>();
  for (const secret of input.secrets) {
    let value: string;
    try {
      value = await decryptValue({ nonce: secret.nonce, ciphertext: secret.ciphertext }, oldDek);
    } catch {
      throw new Error(
        `Cannot rotate: "${secret.name}" did not decrypt with your vault key. The vault may already be mid-rotation, or your grant is stale — re-run after a member with access re-grants you.`
      );
    }
    // The fingerprint is a deterministic hash of the value, so a mismatch here
    // means the stored row was already inconsistent. Refuse to propagate it.
    if (!fingerprintsEqual(secret.fingerprint, fingerprintValue(value))) {
      throw new Error(
        `Cannot rotate: "${secret.name}" has a fingerprint that does not match its ciphertext. Refusing to re-encrypt a record that is already inconsistent.`
      );
    }
    plaintext.set(secret.name, value);
  }

  const secrets: SealedSecret[] = [];
  for (const secret of input.secrets) {
    const value = plaintext.get(secret.name) as string;
    const sealed = await encryptValue(value, newDek);
    secrets.push({
      name: secret.name,
      nonce: sealed.nonce,
      ciphertext: sealed.ciphertext,
      // Unchanged by construction -- the value did not change. Recomputed
      // rather than copied so a bug here surfaces as a server-side rejection.
      fingerprint: fingerprintValue(value)
    });
  }

  const grants: Array<{ email: string; wrappedDek: string }> = [];
  const revoked: string[] = [];
  const skipped: Array<{ email: string; reason: string }> = [];

  for (const member of input.members) {
    const keep = member.hasAccess && (scope === "all" || member.status === "active");
    if (!keep) {
      if (member.hasAccess) revoked.push(member.email);
      continue;
    }
    if (!sealable(member)) {
      // Holds access today but has no key to re-seal to. Rotating would cut
      // them off silently, so surface it instead of burying it.
      skipped.push({ email: member.email, reason: "no public key on file" });
      revoked.push(member.email);
      continue;
    }
    grants.push({ email: member.email, wrappedDek: await wrapVaultKey(newDek, member.publicKey as string) });
  }

  if (grants.length === 0) {
    throw new Error(
      "Cannot rotate: no member would keep access, which would make the vault permanently unreadable. Grant at least one active member with a registered key first."
    );
  }

  return { secrets, grants, revoked, skipped };
}
