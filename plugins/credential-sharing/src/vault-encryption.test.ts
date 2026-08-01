// The vault, at rest.
//
// The vault holds the target's prior values so a bad rotation can be undone —
// the one place raw credentials touch disk. It was written as plain JSON at
// mode 0600, which is a permission bit and nothing more: it stops another user
// on the same box and does nothing about a backup, a synced home directory, a
// stolen laptop, or anything that reads the file as its owner.
//
// It is now sealed to this machine's identity key. These tests exist to fail
// the moment a secret is legible on disk again.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileCredentialStore } from "./store.js";
import { loadOrCreateIdentity, identityPath } from "./identity.js";

const ENV_KEYS = ["LOGICSRC_HOME", "XDG_CONFIG_HOME", "HOME", "LOGICSRC_CREDENTIAL_HOME", "LOGICSRC_IDENTITY_FILE"] as const;

const SECRET = "sk-live-do-not-write-me-in-the-clear";
const BAG = { API_KEY: SECRET, OTHER: "second-value-also-secret" };

let saved: Record<string, string | undefined>;
let sandbox: string;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  sandbox = mkdtempSync(join(tmpdir(), "logicsrc-vault-"));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.HOME = sandbox;
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(sandbox, { recursive: true, force: true });
});

const vaultFile = (store: { baseDir: string }, runId: string) => join(store.baseDir, "vault", `${runId}.json`);

describe("vault encryption at rest", () => {
  it("does not write the secret to disk in the clear", async () => {
    const store = createFileCredentialStore();
    await store.saveVault("run_1", BAG);

    const onDisk = readFileSync(vaultFile(store, "run_1"), "utf8");
    expect(onDisk).not.toContain(SECRET);
    expect(onDisk).not.toContain("second-value-also-secret");
    // The key names are secrets too — knowing an endpoint holds STRIPE_LIVE_KEY
    // is worth something on its own.
    expect(onDisk).not.toContain("API_KEY");
  });

  it("round-trips through the seal", async () => {
    const store = createFileCredentialStore();
    await store.saveVault("run_2", BAG);
    expect(await store.getVault("run_2")).toEqual(BAG);
  });

  it("seals each run under its own key", async () => {
    // One DEK across every run would make a single compromise open every
    // rollback ever captured.
    const store = createFileCredentialStore();
    await store.saveVault("run_3", BAG);
    await store.saveVault("run_4", BAG);

    const a = JSON.parse(readFileSync(vaultFile(store, "run_3"), "utf8"));
    const b = JSON.parse(readFileSync(vaultFile(store, "run_4"), "utf8"));
    expect(a.wrappedKey).not.toBe(b.wrappedKey);
    expect(a.sealed.ciphertext).not.toBe(b.sealed.ciphertext);
  });

  it("writes the file 0600", async () => {
    const store = createFileCredentialStore();
    await store.saveVault("run_5", BAG);
    const { mode } = await import("node:fs").then((fs) => fs.statSync(vaultFile(store, "run_5")));
    expect(mode & 0o777).toBe(0o600);
  });

  it("still reads a plaintext vault written before this existed", async () => {
    // Refusing them would strand the rollback data they exist to hold.
    const store = createFileCredentialStore();
    mkdirSync(join(store.baseDir, "vault"), { recursive: true });
    writeFileSync(vaultFile(store, "legacy"), JSON.stringify(BAG), { mode: 0o600 });

    expect(await store.getVault("legacy")).toEqual(BAG);
  });

  it("says what is wrong when the identity is gone", async () => {
    const store = createFileCredentialStore();
    await store.saveVault("run_6", BAG);
    await loadOrCreateIdentity();
    rmSync(identityPath(), { force: true });

    // Not a decode error out of libsodium: the operator needs to know the
    // rollback is recoverable, and by restoring what.
    await expect(store.getVault("run_6")).rejects.toThrow(/identity/i);
  });

  it("returns undefined for a run with no vault, as before", async () => {
    const store = createFileCredentialStore();
    expect(await store.getVault("never-happened")).toBeUndefined();
  });
});
