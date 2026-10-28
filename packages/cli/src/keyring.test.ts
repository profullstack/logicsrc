import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { VaultMeta } from "@logicsrc/opencreds";
import {
  KeyringStore,
  authorizedKeysLines,
  createKeyring,
  detectType,
  fingerprintOf,
  looksPrivate,
  openEntry,
  publicEntry,
  restoreToDisk,
  sealEntry,
  unlockKeyring,
  type KeyringEntry
} from "./keyring.js";
import { KeyringDivergedError, syncKeyring, type KeyringRemote } from "./keyring-sync.js";

const hasSshKeygen = spawnSync("ssh-keygen", ["-?"], { stdio: "ignore" }).error === undefined;

function throwawayKey(dir: string, name = "id_ed25519"): { privateKey: string; publicKey: string; path: string } {
  const path = join(dir, name);
  const out = spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "throwaway@test", "-f", path], { stdio: "ignore" });
  if (out.status !== 0) throw new Error("ssh-keygen failed");
  return { privateKey: readFileSync(path, "utf8"), publicKey: readFileSync(`${path}.pub`, "utf8").trim(), path };
}

const mode = (p: string) => (statSync(p).mode & 0o777).toString(8);

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "keyring-test-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe.skipIf(!hasSshKeygen)("keyring crypto", () => {
  it("round-trips a private key through the OpenCreds envelope, and the envelope holds no plaintext", async () => {
    const key = throwawayKey(dir);
    const { meta, userKey, recoveryKey } = await createKeyring("pass phrase");
    const entry = await sealEntry(userKey, { name: "id_ed25519", privateKey: key.privateKey, publicKey: key.publicKey });

    expect(entry.type).toBe("ssh-ed25519");
    expect(entry.filename).toBe("id_ed25519");
    expect(entry.comment).toBe("throwaway@test");
    expect(JSON.stringify(entry)).not.toContain("PRIVATE KEY");
    expect(looksPrivate(JSON.stringify(entry))).toBe(false);

    // Unlock from the stored meta, by passphrase and by recovery key.
    const again = await unlockKeyring(meta, { passphrase: "pass phrase" });
    expect((await openEntry(again, entry)).privateKey).toBe(key.privateKey);
    const viaRecovery = await unlockKeyring(meta, { recoveryKey });
    expect((await openEntry(viaRecovery, entry)).privateKey).toBe(key.privateKey);
    await expect(unlockKeyring(meta, { passphrase: "wrong" })).rejects.toThrow(/Wrong keyring passphrase/);
  });

  it("fingerprints exactly like ssh-keygen -lf", async () => {
    const key = throwawayKey(dir);
    const ssh = spawnSync("ssh-keygen", ["-lf", `${key.path}.pub`], { encoding: "utf8" }).stdout.split(" ")[1];
    expect(fingerprintOf(key.publicKey)).toBe(ssh);
  });

  it("binds the envelope to its id (a swapped envelope does not open)", async () => {
    const a = throwawayKey(dir, "a");
    const b = throwawayKey(dir, "b");
    const { userKey } = await createKeyring("p");
    const ea = await sealEntry(userKey, { name: "a", privateKey: a.privateKey, publicKey: a.publicKey });
    const eb = await sealEntry(userKey, { name: "b", privateKey: b.privateKey, publicKey: b.publicKey });
    await expect(openEntry(userKey, { ...ea, envelope: { ...eb.envelope!, id: ea.id } })).rejects.toThrow();
  });

  it("refuses private material in the public field", async () => {
    const key = throwawayKey(dir);
    const { userKey } = await createKeyring("p");
    await expect(sealEntry(userKey, { name: "x", privateKey: key.privateKey, publicKey: key.privateKey })).rejects.toThrow(/private key material/);
  });
});

describe("type detection", () => {
  it("knows ssh, gpg, age and falls back to generic", () => {
    expect(detectType("", "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ== x")).toBe("ssh-rsa");
    expect(detectType("", "ssh-rsa AAAAC3NzaC1lZDI1NTE5AAAAIFK+ x")).toBe("generic"); // blob names another algorithm
    expect(detectType("-----BEGIN PGP PRIVATE KEY BLOCK-----", "")).toBe("gpg");
    expect(detectType("AGE-SECRET-KEY-1ABC", "age1qqqq")).toBe("age");
    expect(detectType("-----BEGIN PRIVATE KEY-----", "something")).toBe("generic");
  });
});

describe.skipIf(!hasSshKeygen)("restore", () => {
  async function sealedPair() {
    const key = throwawayKey(dir, "src");
    const { userKey } = await createKeyring("p");
    const entry = await sealEntry(userKey, { name: "id_ed25519", privateKey: key.privateKey, publicKey: key.publicKey, filename: "id_ed25519" });
    return { key, entry, userKey };
  }

  it("writes the default file name with 600/644 and a 700 directory", async () => {
    const { key, entry, userKey } = await sealedPair();
    const to = join(dir, "dot-ssh");
    const { privateKey } = await openEntry(userKey, entry);
    const r = restoreToDisk(publicEntry(entry), privateKey, { dir: to });
    expect(r.privatePath).toBe(join(to, "id_ed25519"));
    expect(readFileSync(r.privatePath, "utf8")).toBe(key.privateKey);
    expect(readFileSync(`${r.privatePath}.pub`, "utf8").trim()).toBe(key.publicKey);
    expect(mode(r.privatePath)).toBe("600");
    expect(mode(`${r.privatePath}.pub`)).toBe("644");
    expect(mode(to)).toBe("700");
    // ssh agrees it is the same key.
    const fp = spawnSync("ssh-keygen", ["-lf", r.privatePath], { encoding: "utf8" }).stdout.split(" ")[1];
    expect(fp).toBe(entry.fingerprint);
  });

  it("is a no-op on an identical file, refuses a different one, and backs up before --force", async () => {
    const { entry, userKey } = await sealedPair();
    const to = join(dir, "dot-ssh");
    const { privateKey } = await openEntry(userKey, entry);
    restoreToDisk(publicEntry(entry), privateKey, { dir: to });
    expect(restoreToDisk(publicEntry(entry), privateKey, { dir: to }).wrote).toBe(false);

    const other = throwawayKey(dir, "other");
    writeFileSync(join(to, "id_ed25519"), other.privateKey, { mode: 0o600 });
    expect(() => restoreToDisk(publicEntry(entry), privateKey, { dir: to })).toThrow(/different key/);
    expect(readFileSync(join(to, "id_ed25519"), "utf8")).toBe(other.privateKey); // untouched

    const forced = restoreToDisk(publicEntry(entry), privateKey, { dir: to, force: true });
    expect(forced.wrote).toBe(true);
    expect(forced.backups).toHaveLength(1);
    expect(readFileSync(forced.backups[0]!, "utf8")).toBe(other.privateKey);
    expect(mode(forced.backups[0]!)).toBe("600");
    expect(readFileSync(join(to, "id_ed25519"), "utf8")).toBe(privateKey);
  });

  it("exports authorized_keys lines from public halves only", async () => {
    const { entry } = await sealedPair();
    const lines = authorizedKeysLines([publicEntry(entry)]);
    expect(lines).toEqual([entry.publicKey]);
    expect(lines.join("\n")).not.toContain("PRIVATE");
  });
});

/** An in-memory account that, like the real server, refuses anything that looks private. */
function fakeAccount(): KeyringRemote & { meta: VaultMeta | null; rows: Map<string, KeyringEntry> } {
  const state = { meta: null as VaultMeta | null, rows: new Map<string, KeyringEntry>() };
  return Object.assign(state, {
    label: "fake",
    async get() {
      return { meta: state.meta, entries: [...state.rows.values()] };
    },
    async putMeta(meta: VaultMeta) {
      if (state.meta && state.meta.kdfSalt !== meta.kdfSalt) return { ok: false as const, meta: state.meta };
      state.meta = meta;
      return { ok: true as const };
    },
    async putEntry(entry: KeyringEntry) {
      if (looksPrivate(JSON.stringify(entry))) throw new Error("plaintext private key uploaded");
      state.rows.set(entry.id, JSON.parse(JSON.stringify(entry)));
      return { ok: true as const };
    },
    async wipe() {
      state.meta = null;
      state.rows.clear();
    }
  });
}

describe.skipIf(!hasSshKeygen)("sync", () => {
  it("pushes ciphertext only, restores on a second machine, and propagates a removal", async () => {
    const key = throwawayKey(dir);
    const account = fakeAccount();

    const a = new KeyringStore(join(dir, "machine-a"));
    const { meta, userKey } = await createKeyring("pp");
    a.writeMeta(meta);
    const entry = await sealEntry(userKey, { name: "id_ed25519", privateKey: key.privateKey, publicKey: key.publicKey });
    a.write(entry);
    const pushed = await syncKeyring(a, account);
    expect(pushed.createdRemote).toBe(true);
    expect(pushed.pushed).toEqual(["id_ed25519"]);
    expect(JSON.stringify([...account.rows.values()])).not.toContain("PRIVATE KEY");

    // A new machine: no local keyring, just a login.
    const b = new KeyringStore(join(dir, "machine-b"));
    const pulled = await syncKeyring(b, account);
    expect(pulled.adoptedRemote).toBe(true);
    const bKey = await unlockKeyring(b.readMeta()!, { passphrase: "pp" });
    const { privateKey } = await openEntry(bKey, b.get("id_ed25519"));
    expect(privateKey).toBe(key.privateKey);

    // Remove on b; a sees it gone after its next sync.
    const now = new Date(Date.now() + 1000).toISOString();
    b.write({ ...b.get("id_ed25519"), envelope: null, deletedAt: now, updatedAt: now });
    await syncKeyring(b, account);
    await syncKeyring(a, account);
    expect(a.find("id_ed25519")).toBeUndefined();
  });

  it("refuses to merge two different keyrings unless told which wins", async () => {
    const account = fakeAccount();
    const first = await createKeyring("one");
    await account.putMeta(first.meta);
    const local = new KeyringStore(join(dir, "c"));
    local.writeMeta((await createKeyring("two")).meta);
    await expect(syncKeyring(local, account)).rejects.toBeInstanceOf(KeyringDivergedError);

    const r = await syncKeyring(local, account, "use-remote");
    expect(r.backup && existsSync(r.backup)).toBe(true);
    expect(local.readMeta()!.kdfSalt).toBe(first.meta.kdfSalt);
    expect(readdirSync(dir).some((f) => f.startsWith("c.bak-"))).toBe(true);
  });
});
