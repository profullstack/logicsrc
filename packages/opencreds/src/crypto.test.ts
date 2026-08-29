import { describe, expect, it } from "vitest";

import {
  DEFAULT_NAMESPACE,
  MIN_PBKDF2_ITERATIONS,
  assertUsableKdfParams,
  assertUsableNamespace,
  createItem,
  createVault,
  decryptItem,
  decryptItems,
  deriveAuthHash,
  deriveMasterKey,
  deriveWrapKey,
  encryptItem,
  formatRecoveryKey,
  fromBase64,
  parseRecoveryKey,
  randomBytes,
  resetRecoveryKey,
  rewrapUserKey,
  toBase64,
  unlockVault,
  unlockWithRecoveryKey,
} from "./index.js";
import type { KdfParams } from "./index.js";

// Tests derive at the floor rather than the 600k default: the construction is
// what is under test, and the work factor is a parameter of it.
const FAST: KdfParams = { kdf: "pbkdf2-sha256", iterations: MIN_PBKDF2_ITERATIONS };

describe("the item envelope", () => {
  it("round-trips an item", async () => {
    const key = randomBytes(32);
    const item = createItem("login", {
      name: "GitHub",
      login: { username: "anthony", password: "hunter2", totp: "", uris: [{ uri: "https://github.com", match: "domain" }] },
    });

    const envelope = await encryptItem(key, item);
    expect(envelope.id).toBe(item.id);
    expect(envelope.type).toBe(1);
    expect(envelope.ciphertext).not.toContain("hunter2");

    const back = await decryptItem(key, envelope);
    expect(back).toEqual(item);
  });

  it("uses a fresh IV for every encryption", async () => {
    // C10 — with GCM a repeated IV under one key is a break, not a weakness.
    const key = randomBytes(32);
    const item = createItem("note", { name: "n" });
    const ivs = new Set<string>();
    for (let i = 0; i < 25; i++) ivs.add((await encryptItem(key, item)).iv);
    expect(ivs.size).toBe(25);
  });

  it("fails when a ciphertext is moved to another item's row", async () => {
    // C11 — the swap this prevents: copy a low-value login's ciphertext into a
    // high-value row and watch what the user does next.
    const key = randomBytes(32);
    const low = await encryptItem(key, createItem("login", { name: "low" }));
    const high = await encryptItem(key, createItem("login", { name: "high" }));

    const swapped = { ...high, ciphertext: low.ciphertext, iv: low.iv };
    await expect(decryptItem(key, swapped)).rejects.toThrow(/Could not decrypt/);
  });

  it("fails when the namespace differs", async () => {
    const key = randomBytes(32);
    const envelope = await encryptItem(key, createItem("login"), "opencreds");
    await expect(decryptItem(key, envelope, "marksyncr")).rejects.toThrow(/Could not decrypt/);
  });

  it("fails when a single byte of the ciphertext is flipped", async () => {
    const key = randomBytes(32);
    const envelope = await encryptItem(key, createItem("login", { name: "x" }));
    const bytes = fromBase64(envelope.ciphertext);
    bytes[0] ^= 0x01;
    await expect(decryptItem(key, { ...envelope, ciphertext: toBase64(bytes) })).rejects.toThrow();
  });

  it("returns the readable items alongside the ones that failed", async () => {
    // C16 — one corrupt row must not hide the rest of a vault.
    const key = randomBytes(32);
    const good1 = await encryptItem(key, createItem("login", { name: "one" }));
    const good2 = await encryptItem(key, createItem("card", { name: "two" }));
    const bad = await encryptItem(key, createItem("note", { name: "three" }));
    const corrupted = fromBase64(bad.ciphertext);
    corrupted[2] ^= 0xff;

    const result = await decryptItems(key, [good1, { ...bad, ciphertext: toBase64(corrupted) }, good2]);
    expect(result.items.map((i) => i.name).sort()).toEqual(["one", "two"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.id).toBe(bad.id);
  });

  it("refuses to encrypt an item carrying the wrong group", async () => {
    const key = randomBytes(32);
    const item = { ...createItem("login"), account: { provider: "x" } };
    await expect(encryptItem(key, item as never)).rejects.toThrow(/must not carry an account field group/);
  });
});

describe("key derivation", () => {
  it("refuses a KDF below the floor", () => {
    // C13 — parameters arrive from a server; iterations:1 would make every
    // captured auth hash a free offline attack.
    expect(() => assertUsableKdfParams({ kdf: "pbkdf2-sha256", iterations: 1 })).toThrow(/minimum is 100000/);
    expect(() => assertUsableKdfParams({ kdf: "pbkdf2-sha256", iterations: 99_999 })).toThrow();
    expect(assertUsableKdfParams({ kdf: "pbkdf2-sha256", iterations: 100_000 })).toBeTruthy();
  });

  it("refuses argon2id rather than falling back to something weaker", () => {
    expect(() => assertUsableKdfParams({ kdf: "argon2id", iterations: 600_000 })).toThrow(/not implemented/);
  });

  it("derives the wrap key and the auth hash independently", async () => {
    // C14 — this is what lets the auth hash reach a server at all.
    const master = await deriveMasterKey("correct horse", randomBytes(16), FAST);
    const wrap = await deriveWrapKey(master);
    const auth = await deriveAuthHash(master);
    expect(toBase64(wrap)).not.toBe(auth);
  });

  it("derives different keys under different namespaces", async () => {
    const master = await deriveMasterKey("pw", randomBytes(16), FAST);
    expect(toBase64(await deriveWrapKey(master, "opencreds"))).not.toBe(
      toBase64(await deriveWrapKey(master, "marksyncr")),
    );
  });

  it("rejects a salt that is too short to be one", async () => {
    await expect(deriveMasterKey("pw", randomBytes(8), FAST)).rejects.toThrow(/at least 16 bytes/);
  });

  it("rejects an unregistered namespace unless asked to allow it", () => {
    // C17 — an arbitrary prefix is an arbitrary derivation.
    expect(() => assertUsableNamespace("somebody-elses-vault")).toThrow(/Unregistered namespace/);
    expect(assertUsableNamespace("somebody-elses-vault", true)).toBe("somebody-elses-vault");
    expect(assertUsableNamespace("marksyncr")).toBe("marksyncr");
    expect(() => assertUsableNamespace("Not Valid")).toThrow(/Invalid namespace/);
  });
});

describe("the vault", () => {
  it("creates, locks and unlocks", async () => {
    const { meta, userKey } = await createVault("correct horse battery staple", { params: FAST });
    expect(meta.profile).toBe("user");
    expect(meta.namespace).toBe(DEFAULT_NAMESPACE);
    expect(meta.protectedUserKey).not.toBe("");

    const unlocked = await unlockVault(meta, "correct horse battery staple");
    expect(toBase64(unlocked)).toBe(toBase64(userKey));
  });

  it("rejects the wrong password", async () => {
    const { meta } = await createVault("right", { params: FAST });
    await expect(unlockVault(meta, "wrong")).rejects.toThrow(/Wrong master password/);
  });

  it("generates the user key rather than deriving it, so a password change re-wraps", async () => {
    // C15 — the alternative rewrites every item, and a partial failure leaves
    // half a vault on each password.
    const { meta, userKey } = await createVault("first", { params: FAST });
    const rewrapped = await rewrapUserKey(meta, userKey, "second", FAST);

    expect(rewrapped.protectedUserKey).not.toBe(meta.protectedUserKey);
    expect(toBase64(await unlockVault(rewrapped, "second"))).toBe(toBase64(userKey));
    await expect(unlockVault(rewrapped, "first")).rejects.toThrow();
  });

  it("keeps items readable across a password change", async () => {
    const { meta, userKey } = await createVault("first", { params: FAST });
    const envelope = await encryptItem(userKey, createItem("login", { name: "GitHub" }));
    const rewrapped = await rewrapUserKey(meta, userKey, "second", FAST);
    const afterKey = await unlockVault(rewrapped, "second");
    expect((await decryptItem(afterKey, envelope)).name).toBe("GitHub");
  });

  it("recovers with the recovery key", async () => {
    const { meta, userKey, recoveryKey } = await createVault("forgotten", { params: FAST });
    const recovered = await unlockWithRecoveryKey(meta, recoveryKey);
    expect(toBase64(recovered)).toBe(toBase64(userKey));
  });

  it("tolerates the transcription a person actually types", async () => {
    const { meta, userKey, recoveryKey } = await createVault("pw", { params: FAST });
    const mangled = recoveryKey.toLowerCase().replace(/-/g, " ");
    expect(toBase64(await unlockWithRecoveryKey(meta, mangled))).toBe(toBase64(userKey));
  });

  it("invalidates the old recovery key when a new one is issued", async () => {
    const { meta, userKey, recoveryKey } = await createVault("pw", { params: FAST });
    const reset = await resetRecoveryKey(meta, userKey);
    expect(toBase64(await unlockWithRecoveryKey(reset.meta, reset.recoveryKey))).toBe(toBase64(userKey));
    await expect(unlockWithRecoveryKey(reset.meta, recoveryKey)).rejects.toThrow(/Wrong recovery key/);
  });

  it("round-trips a recovery key through its display form", () => {
    const bytes = randomBytes(16);
    const rendered = formatRecoveryKey(bytes);
    expect(rendered).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{1,5})+$/);
    expect(toBase64(parseRecoveryKey(rendered).slice(0, 16))).toBe(toBase64(bytes));
  });

  it("refuses a profile it does not implement", async () => {
    // C18.
    const { meta } = await createVault("pw", { params: FAST });
    const team = { ...meta, profile: "team" as const };
    await expect(unlockVault(team, "pw")).rejects.toThrow(/does not support the "team" profile/);
  });
});
