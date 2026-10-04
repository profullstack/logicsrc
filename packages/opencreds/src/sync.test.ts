/**
 * Sync between two machines through one account.
 *
 * The remote here is an in-memory copy of the server's rules (apps/pwa
 * routes/opencreds.mjs): optimistic revisions per row, tombstones for purges,
 * a 409 carrying the current row. Each "machine" is its own vault directory.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createItem, decryptItem, encryptItem, updateItem } from "./items.js";
import { createVaultStore, type VaultStore } from "./store.js";
import { DivergedVaultError, pullVault, pushVault, syncVault, type RemoteItem, type RemoteVault, type SyncRemote } from "./sync.js";
import type { Envelope, Item, VaultMeta } from "./types.js";
import { createVault } from "./vault-key.js";

const ITERATIONS = { kdf: "pbkdf2-sha256" as const, iterations: 600_000 };

function fakeAccount() {
  let vault: { meta: VaultMeta; metaRevision: number; folders: { ciphertext: string; iv: string; revision: number } | null } | null = null;
  const rows = new Map<string, { envelope: string | null; revision: number; seq: number }>();
  let seq = 0;
  const snapshot = (): RemoteVault | null => (vault ? JSON.parse(JSON.stringify(vault)) : null);
  const item = (id: string): RemoteItem => {
    const r = rows.get(id);
    if (!r) return { id, envelope: null, revision: 0, seq: 0 };
    return { id, envelope: r.envelope ? { ...JSON.parse(r.envelope), revision: r.revision } : null, revision: r.revision, seq: r.seq };
  };
  const remote: SyncRemote = {
    label: "test-account",
    async getVault() {
      return snapshot();
    },
    async putMeta(meta, baseRevision) {
      const current = vault?.metaRevision ?? 0;
      if (current !== baseRevision) return { ok: false, vault: snapshot() };
      vault = { meta: JSON.parse(JSON.stringify(meta)), metaRevision: current + 1, folders: vault?.folders ?? null };
      return { ok: true, revision: current + 1 };
    },
    async putFolders(blob, baseRevision) {
      if (!vault) return { ok: false, vault: null };
      const current = vault.folders?.revision ?? 0;
      if (current !== baseRevision) return { ok: false, vault: snapshot() };
      vault.folders = { ...blob, revision: current + 1 };
      return { ok: true, revision: current + 1 };
    },
    async listItems(since) {
      const items = [...rows.keys()].map(item).filter((i) => i.seq >= since).sort((a, b) => a.seq - b.seq);
      return { items, cursor: items.reduce((m, i) => Math.max(m, i.seq), since) };
    },
    async putItems(changes) {
      const applied: Array<{ id: string; revision: number; seq: number }> = [];
      const conflicts: RemoteItem[] = [];
      for (const c of changes) {
        const current = rows.get(c.id)?.revision ?? 0;
        if (current !== c.baseRevision || (c.baseRevision > 0 && !rows.has(c.id))) {
          conflicts.push(item(c.id));
          continue;
        }
        const { revision: _r, ...rest } = c.envelope ?? ({} as Envelope);
        rows.set(c.id, { envelope: c.envelope ? JSON.stringify(rest) : null, revision: current + 1, seq: ++seq });
        applied.push({ id: c.id, revision: current + 1, seq });
      }
      return { applied, conflicts };
    },
    async reset() {
      vault = null;
      rows.clear();
    },
  };
  return { remote, rows, vault: () => vault };
}

const dirs: string[] = [];
function machine(): VaultStore {
  const dir = mkdtempSync(join(tmpdir(), "opencreds-sync-"));
  dirs.push(dir);
  return createVaultStore(join(dir, "vault"));
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function newVault(store: VaultStore) {
  const { meta, userKey } = await createVault("pw", { params: ITERATIONS });
  store.writeMeta(meta);
  return { meta, userKey };
}

async function add(store: VaultStore, key: Uint8Array, name: string, password = "s3cret"): Promise<Item> {
  const item = createItem("login", { name, login: { username: "me", password, uris: [] } } as Partial<Item>);
  store.writeEnvelope(await encryptItem(key, item));
  return item;
}

async function names(store: VaultStore, key: Uint8Array): Promise<string[]> {
  const out: string[] = [];
  for (const env of store.listEnvelopes()) out.push((await decryptItem(key, env)).name);
  return out.sort();
}

describe("vault sync", () => {
  it("uploads a vault, and a second machine downloads it with no key", async () => {
    const acct = fakeAccount();
    const a = machine();
    const { userKey } = await newVault(a);
    await add(a, userKey, "GitHub");
    await add(a, userKey, "Bank");

    const up = await syncVault(a, acct.remote, userKey);
    expect(up.created).toBe(true);
    expect(up.pushed).toBe(2);

    const b = machine();
    const down = await pullVault(b, acct.remote);
    expect(down.downloaded).toBe(true);
    expect(down.pulled).toBe(2);
    expect(b.readMeta()).toEqual(a.readMeta());
    expect(await names(b, userKey)).toEqual(["Bank", "GitHub"]);
  });

  it("the account holds only ciphertext", async () => {
    const acct = fakeAccount();
    const a = machine();
    const { userKey } = await newVault(a);
    await add(a, userKey, "VerySecretName", "hunter2-password");
    a.writeFolders([{ id: "f1", name: "PrivateFolderName" }]);
    await syncVault(a, acct.remote, userKey);

    const everything = JSON.stringify({ rows: [...acct.rows.values()], vault: acct.vault() });
    expect(everything).not.toMatch(/VerySecretName|hunter2-password|PrivateFolderName/);
    expect(acct.vault()?.folders).not.toBeNull();
  });

  it("an edit on one machine reaches the other; a quiet second sync moves nothing", async () => {
    const acct = fakeAccount();
    const a = machine();
    const { userKey } = await newVault(a);
    const item = await add(a, userKey, "GitHub");
    await syncVault(a, acct.remote, userKey);
    const b = machine();
    await syncVault(b, acct.remote, userKey);

    a.writeEnvelope(await encryptItem(userKey, updateItem(item, { name: "GitHub (work)" })));
    await syncVault(a, acct.remote, userKey);
    const r = await syncVault(b, acct.remote, userKey);
    expect(r.pulled).toBe(1);
    expect(await names(b, userKey)).toEqual(["GitHub (work)"]);

    const again = await syncVault(b, acct.remote, userKey);
    expect([again.pulled, again.pushed, again.conflicts]).toEqual([0, 0, 0]);
  });

  it("the same item edited on both machines keeps both edits", async () => {
    const acct = fakeAccount();
    const a = machine();
    const { userKey } = await newVault(a);
    const item = await add(a, userKey, "Email");
    await syncVault(a, acct.remote, userKey);
    const b = machine();
    await syncVault(b, acct.remote, userKey);

    a.writeEnvelope(await encryptItem(userKey, updateItem(item, { name: "Email A" })));
    b.writeEnvelope(await encryptItem(userKey, updateItem(item, { name: "Email B" })));
    await syncVault(a, acct.remote, userKey);
    const r = await syncVault(b, acct.remote, userKey);
    expect(r.conflicts).toBe(1);
    expect(await names(b, userKey)).toEqual(["Email A", "Email B (conflict copy)"]);

    await syncVault(a, acct.remote, userKey);
    expect(await names(a, userKey)).toEqual(["Email A", "Email B (conflict copy)"]);
  });

  it("without the key, a conflict waits instead of guessing", async () => {
    const acct = fakeAccount();
    const a = machine();
    const { userKey } = await newVault(a);
    const item = await add(a, userKey, "Email");
    await syncVault(a, acct.remote, userKey);
    const b = machine();
    await syncVault(b, acct.remote, userKey);

    a.writeEnvelope(await encryptItem(userKey, updateItem(item, { name: "Email A" })));
    b.writeEnvelope(await encryptItem(userKey, updateItem(item, { name: "Email B" })));
    await syncVault(a, acct.remote, userKey);
    const r = await pushVault(b, acct.remote);
    expect(r.notes.join(" ")).toMatch(/next time the vault is unlocked/);
    expect(await names(b, userKey)).toEqual(["Email B"]);
    const later = await syncVault(b, acct.remote, userKey);
    expect(later.conflicts).toBe(1);
    expect(await names(b, userKey)).toEqual(["Email A", "Email B (conflict copy)"]);
  });

  it("a purge reaches the other machine; an edit beats a purge", async () => {
    const acct = fakeAccount();
    const a = machine();
    const { userKey } = await newVault(a);
    const gone = await add(a, userKey, "Old");
    const kept = await add(a, userKey, "Kept");
    await syncVault(a, acct.remote, userKey);
    const b = machine();
    await syncVault(b, acct.remote, userKey);

    a.deleteEnvelope(gone.id);
    a.deleteEnvelope(kept.id);
    b.writeEnvelope(await encryptItem(userKey, updateItem(kept, { name: "Kept, edited" })));
    await syncVault(a, acct.remote, userKey);
    await syncVault(b, acct.remote, userKey);
    await syncVault(a, acct.remote, userKey);

    expect(await names(a, userKey)).toEqual(["Kept, edited"]);
    expect(await names(b, userKey)).toEqual(["Kept, edited"]);
  });

  it("a lost sync.json does not turn every item into a conflict copy", async () => {
    const acct = fakeAccount();
    const a = machine();
    const { userKey } = await newVault(a);
    await add(a, userKey, "One");
    await add(a, userKey, "Two");
    await syncVault(a, acct.remote, userKey);
    rmSync(join(a.baseDir, "sync.json"));

    const r = await syncVault(a, acct.remote, userKey);
    expect(r.conflicts).toBe(0);
    expect(await names(a, userKey)).toEqual(["One", "Two"]);
    expect(acct.rows.size).toBe(2);
  });

  it("two different vaults are never merged", async () => {
    const acct = fakeAccount();
    const a = machine();
    const ka = await newVault(a);
    await add(a, ka.userKey, "A's");
    await syncVault(a, acct.remote, ka.userKey);

    const b = machine();
    const kb = await newVault(b);
    await new Promise((r) => setTimeout(r, 5));
    b.writeMeta({ ...b.readMeta()!, createdAt: new Date(Date.now() + 1000).toISOString() });
    await add(b, kb.userKey, "B's");
    await expect(syncVault(b, acct.remote, kb.userKey)).rejects.toBeInstanceOf(DivergedVaultError);
    expect(acct.rows.size).toBe(1);
  });

  it("folders merge across machines, encrypted", async () => {
    const acct = fakeAccount();
    const a = machine();
    const { userKey } = await newVault(a);
    a.writeFolders([{ id: "fa", name: "Work" }]);
    await syncVault(a, acct.remote, userKey);
    const b = machine();
    await syncVault(b, acct.remote, userKey);
    expect(b.readFolders()).toEqual([{ id: "fa", name: "Work" }]);

    b.writeFolders([...b.readFolders(), { id: "fb", name: "Home" }]);
    await syncVault(b, acct.remote, userKey);
    await syncVault(a, acct.remote, userKey);
    expect(a.readFolders().map((f) => f.name).sort()).toEqual(["Home", "Work"]);
  });

  it("a remote id that is not a plain id never becomes a file", async () => {
    const acct = fakeAccount();
    const a = machine();
    const { userKey } = await newVault(a);
    await syncVault(a, acct.remote, userKey);
    acct.rows.set("../../escape", { envelope: JSON.stringify({ id: "../../escape", type: 1, ciphertext: "x", iv: "y" }), revision: 1, seq: 99 });

    const r = await pullVault(a, acct.remote);
    expect(r.notes.join(" ")).toMatch(/unusable id/);
    expect(readdirSync(join(a.baseDir, "items"))).toEqual([]);
    expect(() => readFileSync(join(a.baseDir, "..", "..", "escape.json"))).toThrow();
  });
});
