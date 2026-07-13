/**
 * Server-side types for the LogicSRC team credential-sharing API.
 *
 * The server is a ZERO-KNOWLEDGE relay for secret VALUES: it stores member
 * public keys, per-member wrapped vault keys (sealed to those public keys), and
 * secret ciphertext + nonces. It never receives or stores a plaintext secret or
 * a vault data-encryption key.
 */

export type MemberRole = "owner" | "admin" | "member";
export type MemberStatus = "active" | "invited";

export interface CredShareUser {
  id: string;
  email: string;
  /** X25519 identity public key (base64), or null until the member uploads one. */
  publicKey: string | null;
  createdAt: string;
}

export interface CredShareTeam {
  id: string;
  slug: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface CredShareMember {
  id: string;
  teamId: string;
  userId: string | null;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  invitedBy: string | null;
  createdAt: string;
  joinedAt: string | null;
}

export interface CredShareInvite {
  id: string;
  teamId: string;
  email: string;
  role: MemberRole;
  tokenHash: string;
  createdBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface CredShareVault {
  id: string;
  teamId: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

/** A vault DEK sealed to one member's public key. Server can't open it. */
export interface CredShareGrant {
  vaultId: string;
  userId: string;
  wrappedDek: string;
  grantedBy: string;
  createdAt: string;
}

/** One secret, encrypted under the vault DEK. `fingerprint` is a salted hash for diffing. */
export interface CredShareSecret {
  vaultId: string;
  name: string;
  nonce: string;
  ciphertext: string;
  fingerprint: string;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface CredShareAuditEvent {
  id: string;
  teamId: string | null;
  vaultId: string | null;
  actorUserId: string;
  action: string;
  keyName: string | null;
  fingerprint: string | null;
  createdAt: string;
}

/** A pending email login code (the code itself is stored hashed). */
export interface CredShareLoginCode {
  email: string;
  codeHash: string;
  expiresAt: string;
  createdAt: string;
}

/** An issued API token (stored hashed). */
export interface CredShareToken {
  tokenHash: string;
  userId: string;
  createdAt: string;
  lastUsedAt: string | null;
}
