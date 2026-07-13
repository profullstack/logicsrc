import { describe, it, expect } from "vitest";
import {
  generateIdentityKeyPair,
  generateVaultKey,
  wrapVaultKey,
  unwrapVaultKey,
  encryptValue,
  decryptValue,
  publicKeyForSecret
} from "./crypto.js";

describe("credential-sharing crypto (E2E)", () => {
  it("derives the public key from the secret key", async () => {
    const kp = await generateIdentityKeyPair();
    expect(await publicKeyForSecret(kp.secretKey)).toBe(kp.publicKey);
  });

  it("wraps a DEK to a member and only that member can unwrap it", async () => {
    const alice = await generateIdentityKeyPair();
    const mallory = await generateIdentityKeyPair();
    const dek = await generateVaultKey();

    const wrapped = await wrapVaultKey(dek, alice.publicKey);
    expect(await unwrapVaultKey(wrapped, alice)).toBe(dek);

    // A different keypair cannot open a box sealed to Alice.
    await expect(unwrapVaultKey(wrapped, mallory)).rejects.toThrow();
  });

  it("round-trips a secret value under the vault DEK", async () => {
    const dek = await generateVaultKey();
    const sealed = await encryptValue("super-secret-token", dek);
    expect(sealed.ciphertext).not.toContain("super-secret-token");
    expect(await decryptValue(sealed, dek)).toBe("super-secret-token");
  });

  it("re-wrapping a DEK to a new member grants them decryption (the grant flow)", async () => {
    const owner = await generateIdentityKeyPair();
    const invitee = await generateIdentityKeyPair();
    const dek = await generateVaultKey();
    const sealed = await encryptValue("DATABASE_URL=postgres://…", dek);

    // Owner wraps to self, stores ciphertext. Later the owner grants the invitee:
    const ownerWrapped = await wrapVaultKey(dek, owner.publicKey);
    const ownerDek = await unwrapVaultKey(ownerWrapped, owner);
    const inviteeWrapped = await wrapVaultKey(ownerDek, invitee.publicKey);

    // Invitee unwraps with their own key and decrypts the same ciphertext.
    const inviteeDek = await unwrapVaultKey(inviteeWrapped, invitee);
    expect(await decryptValue(sealed, inviteeDek)).toBe("DATABASE_URL=postgres://…");
  });

  it("produces distinct nonces/ciphertext for the same value", async () => {
    const dek = await generateVaultKey();
    const a = await encryptValue("same", dek);
    const b = await encryptValue("same", dek);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});
