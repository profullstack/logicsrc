import { describe, expect, it } from "vitest";

import {
  buildManifest,
  createItem,
  exportDatabase,
  exportPlaintextDatabase,
  mergePayload,
  openDatabase,
  parseDatabase,
  readHeader,
  randomBytes,
  verifyManifest,
} from "./index.js";
import type { DatabasePayload, EncryptedDatabase, Item, PlaintextDatabase } from "./index.js";

const PASSPHRASE = "opencreds-fixture";
// The construction is under test, not the work factor.
const FAST = { kdf: "pbkdf2-sha256" as const, iterations: 100_000 };

function samplePayload(): DatabasePayload {
  const work = { id: "11111111-1111-4111-8111-111111111111", name: "Work" };
  return {
    folders: [work],
    items: [
      createItem("login", {
        name: "GitHub",
        folderId: work.id,
        login: { username: "anthony", password: "hunter2", totp: "", uris: [{ uri: "https://github.com", match: "domain" }] },
      }),
      createItem("card", { name: "Visa", card: { number: "4242424242424242", code: "123" } } as Partial<Item>),
      createItem("key", { name: "deploy", key: { keyType: "ssh", path: "~/.ssh/id_ed25519", mode: "0600" } } as Partial<Item>),
      createItem("account", { name: "Stripe", account: { provider: "stripe", scopes: ["charges:write"] } } as Partial<Item>),
      createItem("note", { name: "wifi", notes: "the password is on the router" }),
      createItem("identity", { name: "me", identity: { firstName: "A", lastName: "E" } } as Partial<Item>),
    ],
  };
}

describe("the manifest", () => {
  it("counts items by type and digests the ids", async () => {
    const manifest = await buildManifest(samplePayload());
    expect(manifest.itemCount).toBe(6);
    expect(manifest.folderCount).toBe(1);
    expect(manifest.types).toEqual({ login: 1, card: 1, key: 1, account: 1, note: 1, identity: 1 });
    expect(manifest.digest).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("digests the same items identically whatever order they arrive in", async () => {
    const payload = samplePayload();
    const reversed = { ...payload, items: [...payload.items].reverse() };
    expect((await buildManifest(reversed)).digest).toBe((await buildManifest(payload)).digest);
  });

  it("reports every disagreement, not just the first", async () => {
    const payload = samplePayload();
    const manifest = await buildManifest(payload);
    const short = { ...payload, items: payload.items.slice(0, 4) };
    const problems = await verifyManifest(manifest, short);
    expect(problems.length).toBeGreaterThan(1);
    expect(problems.join(" ")).toMatch(/says 6 items, payload has 4/);
    expect(problems.join(" ")).toMatch(/digest does not match/);
  });
});

describe("the encrypted database", () => {
  it("round-trips a whole vault", async () => {
    // C20, C26.
    const payload = samplePayload();
    const db = await exportDatabase(payload, { passphrase: PASSPHRASE, params: FAST });

    expect(db.protected).toBe(true);
    expect(db.type).toBe("opencreds.database");
    expect(JSON.stringify(db)).not.toContain("hunter2");
    expect(JSON.stringify(db)).not.toContain("4242");

    const back = await openDatabase(db, { passphrase: PASSPHRASE });
    expect(back.items).toEqual(payload.items);
    expect(back.folders).toEqual(payload.folders);
  });

  it("exposes the header without the passphrase, and it cannot be lied about", async () => {
    // C21 — the counts can be previewed, and are authenticated.
    const db = await exportDatabase(samplePayload(), { passphrase: PASSPHRASE, params: FAST });
    const header = readHeader(db);
    expect(header.manifest.itemCount).toBe(6);
    expect(header.generator?.name).toBe("@logicsrc/opencreds");

    const lying: EncryptedDatabase = {
      ...db,
      manifest: { ...db.manifest, itemCount: 5 },
    };
    await expect(openDatabase(lying, { passphrase: PASSPHRASE })).rejects.toThrow(/wrong passphrase, or the file was altered/);
  });

  it("fails when the generator or the export time is edited", async () => {
    const db = await exportDatabase(samplePayload(), { passphrase: PASSPHRASE, params: FAST });
    await expect(
      openDatabase({ ...db, exportedAt: "2020-01-01T00:00:00.000Z" }, { passphrase: PASSPHRASE }),
    ).rejects.toThrow();
    await expect(
      openDatabase({ ...db, generator: { name: "someone-else", version: "9" } }, { passphrase: PASSPHRASE }),
    ).rejects.toThrow();
  });

  it("cannot be downgraded to unprotected", async () => {
    const db = await exportDatabase(samplePayload(), { passphrase: PASSPHRASE, params: FAST });
    await expect(
      openDatabase({ ...db, protected: false } as unknown as EncryptedDatabase, { passphrase: PASSPHRASE }),
    ).rejects.toThrow();
  });

  it("rejects the wrong passphrase", async () => {
    const db = await exportDatabase(samplePayload(), { passphrase: PASSPHRASE, params: FAST });
    await expect(openDatabase(db, { passphrase: "nope" })).rejects.toThrow(/Could not decrypt/);
  });

  it("accepts a raw key and then omits the kdf block", async () => {
    const key = randomBytes(32);
    const db = await exportDatabase(samplePayload(), { key });
    expect(db.kdf).toBeUndefined();
    expect((await openDatabase(db, { key })).items).toHaveLength(6);
  });

  it("refuses an export with neither a passphrase nor a key", async () => {
    await expect(exportDatabase(samplePayload(), {})).rejects.toThrow(/needs a passphrase or a raw key/);
  });

  it("uses a fresh salt and IV per export, so two exports of one vault differ", async () => {
    const payload = samplePayload();
    const a = await exportDatabase(payload, { passphrase: PASSPHRASE, params: FAST });
    const b = await exportDatabase(payload, { passphrase: PASSPHRASE, params: FAST });
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.kdf?.salt).not.toBe(b.kdf?.salt);
  });
});

describe("the plaintext database", () => {
  it("refuses without an explicit acknowledgement", async () => {
    // C24 — never a default, never an accident.
    await expect(
      exportPlaintextDatabase(samplePayload(), { acknowledged: false }),
    ).rejects.toThrow(/every secret in the vault to disk unencrypted/);
  });

  it("labels itself unprotected in the header", async () => {
    // C25 — identifiable without parsing the rest of it.
    const db = await exportPlaintextDatabase(samplePayload(), { acknowledged: true });
    expect(db.protected).toBe(false);
    expect(JSON.stringify(db)).toContain("hunter2");
    expect(db.manifest.itemCount).toBe(6);
  });

  it("still verifies its manifest on the way back in", async () => {
    // C22 — unauthenticated, but it still catches truncation.
    const db = await exportPlaintextDatabase(samplePayload(), { acknowledged: true });
    const truncated: PlaintextDatabase = { ...db, items: db.items.slice(0, 3) };
    await expect(openDatabase(truncated)).rejects.toThrow(/Manifest does not match/);
    expect((await openDatabase(db)).items).toHaveLength(6);
  });
});

describe("round-tripping", () => {
  it("does not restamp timestamps or drop unknown fields", async () => {
    // C3, C26, C27 — createdAt is the only evidence of when a password rotated.
    const payload = samplePayload();
    payload.items[0] = {
      ...payload.items[0]!,
      createdAt: "2019-04-01T00:00:00.000Z",
      updatedAt: "2020-07-09T00:00:00.000Z",
      fromTheFuture: { keep: "me" },
    } as Item;

    const once = await exportDatabase(payload, { passphrase: PASSPHRASE, params: FAST });
    const opened = await openDatabase(once, { passphrase: PASSPHRASE });
    const twice = await exportDatabase(opened, { passphrase: PASSPHRASE, params: FAST });
    const again = await openDatabase(twice, { passphrase: PASSPHRASE });

    expect(again.items[0]?.createdAt).toBe("2019-04-01T00:00:00.000Z");
    expect(again.items[0]?.updatedAt).toBe("2020-07-09T00:00:00.000Z");
    expect(again.items[0]?.fromTheFuture).toEqual({ keep: "me" });
    expect(JSON.stringify(again.items)).toBe(JSON.stringify(payload.items));
  });

  it("rejects an item whose group does not match its type", async () => {
    const payload = samplePayload();
    payload.items.push({ ...createItem("login", { name: "bad" }), card: { number: "1" } } as unknown as Item);
    const db = await exportPlaintextDatabase(payload, { acknowledged: true });
    await expect(openDatabase(db)).rejects.toThrow(/must not carry a card field group/);
  });
});

describe("merging", () => {
  const existing = samplePayload();

  it("skips an id that already exists, by default", async () => {
    const result = mergePayload(existing, { folders: [], items: [existing.items[0]!] });
    expect(result.outcome).toMatchObject({ added: 0, skipped: 1 });
    expect(result.items).toHaveLength(existing.items.length);
  });

  it("replaces on request", async () => {
    const changed: Item = { ...existing.items[0]!, name: "GitHub (renamed)" };
    const result = mergePayload(existing, { folders: [], items: [changed] }, "replace");
    expect(result.outcome).toMatchObject({ replaced: 1 });
    expect(result.items.find((i) => i.id === changed.id)?.name).toBe("GitHub (renamed)");
  });

  it("duplicates with a fresh id, keeping both", async () => {
    const result = mergePayload(existing, { folders: [], items: [existing.items[0]!] }, "duplicate");
    expect(result.outcome).toMatchObject({ duplicated: 1 });
    expect(result.items).toHaveLength(existing.items.length + 1);
    const ids = result.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("adds items that are genuinely new", async () => {
    const fresh = createItem("login", { name: "GitLab" });
    const result = mergePayload(existing, { folders: [], items: [fresh] });
    expect(result.outcome).toMatchObject({ added: 1, skipped: 0 });
  });

  it("merges a folder of the same name and remaps the items onto it", async () => {
    const incomingFolder = { id: "22222222-2222-4222-8222-222222222222", name: "Work" };
    const item = createItem("login", { name: "Jira", folderId: incomingFolder.id });
    const result = mergePayload(existing, { folders: [incomingFolder], items: [item] });

    expect(result.outcome).toMatchObject({ foldersAdded: 0, foldersMerged: 1 });
    expect(result.folders).toHaveLength(1);
    expect(result.items.find((i) => i.id === item.id)?.folderId).toBe(existing.folders[0]!.id);
  });

  it("adds a folder that is new", async () => {
    const folder = { id: "33333333-3333-4333-8333-333333333333", name: "Personal" };
    const result = mergePayload(existing, { folders: [folder], items: [] });
    expect(result.outcome).toMatchObject({ foldersAdded: 1, foldersMerged: 0 });
  });
});

describe("parsing", () => {
  it("says what a CSV is when one is handed to the database reader", () => {
    expect(() => parseDatabase("name,url\nx,y")).toThrow(/not a CSV/);
  });

  it("rejects a JSON document that is not a database", () => {
    expect(() => parseDatabase('{"hello":"world"}')).toThrow(/Not an OpenCreds database/);
  });
});
