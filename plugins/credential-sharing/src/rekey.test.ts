import { describe, expect, it } from "vitest";
import {
  generateIdentityKeyPair,
  generateVaultKey,
  encryptValue,
  decryptValue,
  wrapVaultKey,
  unwrapVaultKey,
  type IdentityKeyPair
} from "./crypto.js";
import { fingerprintValue } from "./fingerprint.js";
import { planVaultRekey, type RekeyMember, type SealedSecret } from "./rekey.js";

/** Build a vault sealed under a fresh DEK, plus a grant for each holder. */
async function makeVault(values: Record<string, string>, holders: IdentityKeyPair[]) {
  const dek = await generateVaultKey();
  const secrets: SealedSecret[] = [];
  for (const [name, value] of Object.entries(values)) {
    const sealed = await encryptValue(value, dek);
    secrets.push({ name, nonce: sealed.nonce, ciphertext: sealed.ciphertext, fingerprint: fingerprintValue(value) });
  }
  const wrapped = await Promise.all(holders.map((h) => wrapVaultKey(dek, h.publicKey)));
  return { dek, secrets, wrapped };
}

function member(email: string, keys: IdentityKeyPair | null, over: Partial<RekeyMember> = {}): RekeyMember {
  return { email, publicKey: keys?.publicKey ?? null, status: "active", hasAccess: true, ...over };
}

describe("planVaultRekey", () => {
  it("re-encrypts every secret under a new key without changing any value", async () => {
    const me = await generateIdentityKeyPair();
    const values = { API_KEY: "sk-live-abc123", DB_URL: "postgres://u:p@h/db" };
    const { dek: oldDek, secrets, wrapped } = await makeVault(values, [me]);

    const plan = await planVaultRekey({
      myWrappedDek: wrapped[0],
      identity: me,
      secrets,
      members: [member("me@example.com", me)]
    });

    // The new grant opens a DEK that is genuinely different...
    const newDek = await unwrapVaultKey(plan.grants[0].wrappedDek, me);
    expect(newDek).not.toBe(oldDek);

    // ...and every value survives the trip unchanged.
    for (const secret of plan.secrets) {
      const roundTripped = await decryptValue({ nonce: secret.nonce, ciphertext: secret.ciphertext }, newDek);
      expect(roundTripped).toBe(values[secret.name as keyof typeof values]);
    }
    // Fingerprints are the contract the server checks: same value, same print.
    expect(plan.secrets.map((s) => s.fingerprint).sort()).toEqual(secrets.map((s) => s.fingerprint).sort());
  });

  it("makes the OLD key useless against the rotated ciphertext", async () => {
    const me = await generateIdentityKeyPair();
    const { dek: oldDek, secrets, wrapped } = await makeVault({ TOKEN: "hunter2" }, [me]);

    const plan = await planVaultRekey({ myWrappedDek: wrapped[0], identity: me, secrets, members: [member("me@example.com", me)] });

    // This is the entire point of rotating: a leaked old DEK buys nothing.
    await expect(
      decryptValue({ nonce: plan.secrets[0].nonce, ciphertext: plan.secrets[0].ciphertext }, oldDek)
    ).rejects.toThrow();
  });

  it("drops a departed member, and their old grant no longer opens the vault", async () => {
    const me = await generateIdentityKeyPair();
    const leaver = await generateIdentityKeyPair();
    const { secrets, wrapped } = await makeVault({ TOKEN: "hunter2" }, [me, leaver]);
    const leaverOldGrant = wrapped[1];

    const plan = await planVaultRekey({
      myWrappedDek: wrapped[0],
      identity: me,
      secrets,
      // The leaver is still on the vault but is no longer an active member.
      members: [member("me@example.com", me), member("leaver@example.com", leaver, { status: "invited" })]
    });

    expect(plan.grants.map((g) => g.email)).toEqual(["me@example.com"]);
    expect(plan.revoked).toEqual(["leaver@example.com"]);

    // The leaver's old grant still opens the OLD dek — but that dek is now
    // worthless against the re-encrypted ciphertext.
    const staleDek = await unwrapVaultKey(leaverOldGrant, leaver);
    await expect(
      decryptValue({ nonce: plan.secrets[0].nonce, ciphertext: plan.secrets[0].ciphertext }, staleDek)
    ).rejects.toThrow();
  });

  it("--all keeps a non-active member who holds access", async () => {
    const me = await generateIdentityKeyPair();
    const other = await generateIdentityKeyPair();
    const { secrets, wrapped } = await makeVault({ TOKEN: "hunter2" }, [me, other]);

    const plan = await planVaultRekey({
      myWrappedDek: wrapped[0],
      identity: me,
      secrets,
      members: [member("me@example.com", me), member("other@example.com", other, { status: "invited" })],
      scope: "all"
    });

    expect(plan.grants.map((g) => g.email).sort()).toEqual(["me@example.com", "other@example.com"]);
    expect(plan.revoked).toEqual([]);
    // And the kept member can actually read the rotated vault.
    const theirDek = await unwrapVaultKey(plan.grants.find((g) => g.email === "other@example.com")!.wrappedDek, other);
    expect(await decryptValue({ nonce: plan.secrets[0].nonce, ciphertext: plan.secrets[0].ciphertext }, theirDek)).toBe("hunter2");
  });

  it("never drops a member silently when they have no key to re-seal to", async () => {
    const me = await generateIdentityKeyPair();
    const { secrets, wrapped } = await makeVault({ TOKEN: "hunter2" }, [me]);

    const plan = await planVaultRekey({
      myWrappedDek: wrapped[0],
      identity: me,
      secrets,
      members: [member("me@example.com", me), member("keyless@example.com", null)]
    });

    expect(plan.skipped).toEqual([{ email: "keyless@example.com", reason: "no public key on file" }]);
    expect(plan.revoked).toContain("keyless@example.com");
  });

  it("refuses to rotate a vault into a state nobody can read", async () => {
    const me = await generateIdentityKeyPair();
    const { secrets, wrapped } = await makeVault({ TOKEN: "hunter2" }, [me]);

    await expect(
      planVaultRekey({
        myWrappedDek: wrapped[0],
        identity: me,
        secrets,
        members: [member("me@example.com", me, { status: "invited" })]
      })
    ).rejects.toThrow(/no member would keep access/i);
  });

  it("aborts on a secret that does not decrypt rather than dropping it", async () => {
    const me = await generateIdentityKeyPair();
    const { secrets, wrapped } = await makeVault({ GOOD: "value" }, [me]);
    const corrupted = [...secrets, { name: "BAD", nonce: secrets[0].nonce, ciphertext: secrets[0].ciphertext.replace(/^./, "A"), fingerprint: fingerprintValue("x") }];

    await expect(
      planVaultRekey({ myWrappedDek: wrapped[0], identity: me, secrets: corrupted, members: [member("me@example.com", me)] })
    ).rejects.toThrow(/did not decrypt|inconsistent/i);
  });

  it("aborts when a stored fingerprint disagrees with its ciphertext", async () => {
    const me = await generateIdentityKeyPair();
    const { secrets, wrapped } = await makeVault({ TOKEN: "hunter2" }, [me]);
    const tampered = [{ ...secrets[0], fingerprint: fingerprintValue("something-else") }];

    await expect(
      planVaultRekey({ myWrappedDek: wrapped[0], identity: me, secrets: tampered, members: [member("me@example.com", me)] })
    ).rejects.toThrow(/fingerprint/i);
  });

  it("rotates an empty vault without inventing secrets", async () => {
    const me = await generateIdentityKeyPair();
    const { wrapped } = await makeVault({}, [me]);

    const plan = await planVaultRekey({ myWrappedDek: wrapped[0], identity: me, secrets: [], members: [member("me@example.com", me)] });
    expect(plan.secrets).toEqual([]);
    expect(plan.grants).toHaveLength(1);
  });
});
