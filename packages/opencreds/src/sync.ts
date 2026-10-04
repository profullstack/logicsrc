/**
 * Two-way sync between a file vault and a remote copy of the same vault.
 *
 * Everything exchanged is already ciphertext: the meta carries key material
 * wrapped under the master password, items are envelopes under the user key,
 * and the folder list is encrypted here before it leaves. The remote only
 * stores and orders blobs; it never needs a key, and sync never needs one
 * either except to encrypt folders and to split a conflicting edit into two
 * items. Without the key those two steps wait for the next unlocked run.
 *
 * Model: optimistic concurrency per row. `sync.json` records, per item, the
 * remote revision this machine last agreed with. An item whose local revision
 * differs from it changed here; a pulled item whose remote revision differs
 * from it changed there. Both at once is a conflict, resolved without losing
 * either side: the remote edit keeps the id, the local edit becomes a copy.
 *
 * A vault is identified by `meta.createdAt`, which a password change keeps and
 * `init` replaces. Two different vaults never merge: that is refused, with the
 * commands that pick one.
 */

import { createHash } from "node:crypto";

import { decryptItem, encryptItem } from "./items.js";
import { aesGcmDecrypt, aesGcmEncrypt, fromBase64, toBase64, utf8Decode, utf8Encode, uuid } from "./primitives.js";
import type { VaultStore } from "./store.js";
import type { Envelope, Folder, VaultMeta } from "./types.js";

export interface RemoteItem {
  id: string;
  /** null is a tombstone: the item was purged. */
  envelope: Envelope | null;
  revision: number;
  seq: number;
}

export interface RemoteVault {
  meta: VaultMeta;
  metaRevision: number;
  folders: { ciphertext: string; iv: string; revision: number } | null;
}

export type Put<T> = { ok: true; revision: number } | { ok: false; vault: T | null };

/** Where a vault syncs to. The logicsrc CLI provides one backed by the account. */
export interface SyncRemote {
  /** Shown to people: "app.logicsrc.com (you@example.com)". */
  label: string;
  getVault(): Promise<RemoteVault | null>;
  putMeta(meta: VaultMeta, baseRevision: number): Promise<Put<RemoteVault>>;
  putFolders(blob: { ciphertext: string; iv: string }, baseRevision: number): Promise<Put<RemoteVault>>;
  listItems(since: number): Promise<{ items: RemoteItem[]; cursor: number }>;
  putItems(
    changes: Array<{ id: string; envelope: Envelope | null; baseRevision: number }>,
  ): Promise<{ applied: Array<{ id: string; revision: number; seq: number }>; conflicts: RemoteItem[] }>;
  /** Drop the remote vault entirely (`sync --use-local`). */
  reset(): Promise<void>;
}

export interface SyncState {
  /** createdAt of the vault this state belongs to. */
  vaultCreatedAt?: string;
  cursor: number;
  metaRevision: number;
  metaHash?: string;
  foldersRevision: number;
  foldersHash?: string;
  /** item id -> the remote revision this machine last agreed with */
  items: Record<string, number>;
  lastSyncAt?: string;
}

export interface SyncReport {
  pulled: number;
  pushed: number;
  deleted: number;
  conflicts: number;
  created: boolean;
  downloaded: boolean;
  notes: string[];
}

export class SyncError extends Error {}

/** Two different vaults: the account's and this machine's. Never merged. */
export class DivergedVaultError extends SyncError {}

// An id becomes a filename. A remote that sends "../meta" must not get to
// write outside items/, so anything but a plain id is refused outright.
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PUSH_BATCH = 200;

const emptyState = (): SyncState => ({ cursor: 0, metaRevision: 0, foldersRevision: 0, items: {} });

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sameCiphertext(a: Envelope, b: Envelope | null): boolean {
  return b !== null && a.ciphertext === b.ciphertext && a.iv === b.iv;
}

function foldersAad(namespace: string): Uint8Array {
  return utf8Encode(`${namespace}:vault:folders:1`);
}

export function readSyncState(store: VaultStore): SyncState {
  return { ...emptyState(), ...(store.readSyncState<SyncState>() ?? {}) };
}

function newReport(): SyncReport {
  return { pulled: 0, pushed: 0, deleted: 0, conflicts: 0, created: false, downloaded: false, notes: [] };
}

function assertSameVault(local: VaultMeta, remote: VaultMeta, label: string): void {
  if (local.createdAt !== remote.createdAt) {
    throw new DivergedVaultError(
      `This machine's vault and the one on ${label} are different vaults (created ${local.createdAt ?? "?"} and ${remote.createdAt ?? "?"}). ` +
        "Nothing was synced. Keep one: `sync --use-remote` replaces this machine's (backed up first), " +
        "`sync --use-local` replaces the account's.",
    );
  }
}

/**
 * Bring remote changes down. Needs no key. On a machine with no vault yet and
 * an account that has one, this is what downloads it.
 */
export async function pullVault(store: VaultStore, remote: SyncRemote, report = newReport()): Promise<SyncReport> {
  const rv = await remote.getVault();
  if (!rv) return report;
  let state = readSyncState(store);
  const local = store.readMeta();

  if (!local) {
    store.writeMeta(rv.meta);
    state = { ...emptyState(), vaultCreatedAt: rv.meta.createdAt, metaRevision: rv.metaRevision, metaHash: hash(rv.meta) };
    report.downloaded = true;
  } else {
    assertSameVault(local, rv.meta, remote.label);
    if (state.vaultCreatedAt !== local.createdAt) state = { ...emptyState(), vaultCreatedAt: local.createdAt };
    const localChanged = hash(local) !== state.metaHash;
    if (rv.metaRevision !== state.metaRevision) {
      // A password change elsewhere. The user key is the same, so items are
      // unaffected; if this machine changed it too, the account's wins.
      if (localChanged && state.metaHash) {
        report.notes.push(`The master password was changed both here and on ${remote.label}; keeping the account's.`);
      }
      if (!localChanged || state.metaHash) {
        store.writeMeta(rv.meta);
        state.metaHash = hash(rv.meta);
        state.metaRevision = rv.metaRevision;
      }
    }
  }

  const { items, cursor } = await remote.listItems(state.cursor);
  for (const ri of items) {
    if (!SAFE_ID.test(ri.id) || (ri.envelope && ri.envelope.id !== ri.id)) {
      report.notes.push(`Ignored a remote item with an unusable id (${JSON.stringify(ri.id).slice(0, 40)}).`);
      continue;
    }
    const synced = state.items[ri.id];
    if (synced === ri.revision) continue; // already have it
    const localEnv = store.readEnvelope(ri.id);
    const changedHere = localEnv ? localEnv.revision !== synced : synced !== undefined;
    if (changedHere) {
      // Byte-identical is the same item (a lost sync.json, a copied vault): adopt it.
      if (localEnv && sameCiphertext(localEnv, ri.envelope)) {
        store.putEnvelope({ ...localEnv, revision: ri.revision });
        state.items[ri.id] = ri.revision;
      }
      continue; // both sides moved; push resolves it
    }
    if (ri.envelope) {
      store.putEnvelope({ ...ri.envelope, revision: ri.revision });
      state.items[ri.id] = ri.revision;
      report.pulled++;
    } else {
      if (localEnv) report.deleted++;
      store.deleteEnvelope(ri.id);
      delete state.items[ri.id];
    }
  }
  state.cursor = Math.max(state.cursor, cursor);
  state.lastSyncAt = new Date().toISOString();
  store.writeSyncState(state);
  return report;
}

/**
 * Send local changes up, resolving conflicts. `userKey` is optional: without
 * it, folders wait and a conflicting edit stays pending until a run that has it.
 */
export async function pushVault(
  store: VaultStore,
  remote: SyncRemote,
  userKey?: Uint8Array,
  report = newReport(),
): Promise<SyncReport> {
  const local = store.readMeta();
  if (!local) return report;
  let state = readSyncState(store);
  if (state.vaultCreatedAt !== local.createdAt) {
    // First sync of this vault from this machine. If the account already has
    // a different vault, stop before uploading anything.
    const rv = await remote.getVault();
    if (rv) assertSameVault(local, rv.meta, remote.label);
    state = { ...emptyState(), vaultCreatedAt: local.createdAt };
  }

  // ---- meta ----
  if (hash(local) !== state.metaHash) {
    const put = await remote.putMeta(local, state.metaRevision);
    if (put.ok) {
      state.metaRevision = put.revision;
      if (put.revision === 1) report.created = true;
    } else if (put.vault) {
      assertSameVault(local, put.vault.meta, remote.label);
      store.writeMeta(put.vault.meta);
      state.metaRevision = put.vault.metaRevision;
      report.notes.push(`The account's vault settings were newer; kept them.`);
    }
    state.metaHash = hash(store.readMeta());
  }

  // ---- items ----
  const pending = (): Array<{ id: string; envelope: Envelope | null; baseRevision: number }> => {
    const out: Array<{ id: string; envelope: Envelope | null; baseRevision: number }> = [];
    const present = new Set<string>();
    for (const env of store.listEnvelopes()) {
      present.add(env.id);
      if (!SAFE_ID.test(env.id)) continue;
      if (env.revision !== state.items[env.id]) out.push({ id: env.id, envelope: env, baseRevision: state.items[env.id] ?? 0 });
    }
    for (const id of Object.keys(state.items)) {
      if (!present.has(id)) out.push({ id, envelope: null, baseRevision: state.items[id] });
    }
    return out;
  };

  // Two rounds: the second sends what conflict resolution produced (a copy,
  // a resurrected edit). Anything still conflicting after that waits.
  for (let round = 0; round < 2; round++) {
    const changes = pending();
    if (changes.length === 0) break;
    for (let i = 0; i < changes.length; i += PUSH_BATCH) {
      const batch = changes.slice(i, i + PUSH_BATCH);
      const { applied, conflicts } = await remote.putItems(batch);
      const byId = new Map(batch.map((c) => [c.id, c]));
      for (const a of applied) {
        const sent = byId.get(a.id);
        if (sent?.envelope) {
          store.putEnvelope({ ...sent.envelope, revision: a.revision });
          state.items[a.id] = a.revision;
          report.pushed++;
        } else {
          delete state.items[a.id];
          report.deleted++;
        }
      }
      for (const theirs of conflicts) {
        await resolveConflict(store, state, theirs, byId.get(theirs.id)!, userKey, local.namespace, report);
      }
    }
  }

  // ---- folders ----
  if (userKey) await syncFolders(store, remote, state, userKey, local.namespace, report);
  state.lastSyncAt = new Date().toISOString();

  store.writeSyncState(state);
  return report;
}

async function resolveConflict(
  store: VaultStore,
  state: SyncState,
  theirs: RemoteItem,
  mine: { id: string; envelope: Envelope | null; baseRevision: number },
  userKey: Uint8Array | undefined,
  namespace: string,
  report: SyncReport,
): Promise<void> {
  if (mine.envelope && sameCiphertext(mine.envelope, theirs.envelope)) {
    store.putEnvelope({ ...mine.envelope, revision: theirs.revision });
    state.items[theirs.id] = theirs.revision;
    return;
  }
  report.conflicts++;
  if (theirs.revision === 0) {
    // The account has no such row: it was never there, or the vault was reset.
    delete state.items[mine.id];
    return;
  }
  if (!mine.envelope) {
    // Purged here, edited there: the edit wins and comes back.
    if (theirs.envelope) {
      store.putEnvelope({ ...theirs.envelope, revision: theirs.revision });
      state.items[theirs.id] = theirs.revision;
      report.notes.push(`${theirs.id} was purged here but edited elsewhere; kept the edit.`);
    } else {
      delete state.items[theirs.id];
    }
    return;
  }
  if (!theirs.envelope) {
    // Purged there, edited here: keep the edit by re-sending it over the tombstone.
    // Its local revision is set one past the tombstone so it reads as unsent
    // (a local counter can happen to equal the remote one).
    store.putEnvelope({ ...mine.envelope, revision: theirs.revision + 1 });
    state.items[mine.id] = theirs.revision;
    report.notes.push(`${mine.id} was purged elsewhere but edited here; kept the edit.`);
    return;
  }
  if (!userKey) {
    report.notes.push(`${mine.id} was edited here and elsewhere; it will be split into two items the next time the vault is unlocked.`);
    return;
  }
  // Both edited. The account's version keeps the id; this machine's becomes a copy.
  const item = await decryptItem(userKey, mine.envelope, namespace);
  const copy = { ...item, id: uuid(), name: `${item.name} (conflict copy)`, updatedAt: new Date().toISOString() };
  store.writeEnvelope(await encryptItem(userKey, copy, namespace));
  store.putEnvelope({ ...theirs.envelope, revision: theirs.revision });
  state.items[theirs.id] = theirs.revision;
  report.notes.push(`"${item.name}" was edited here and elsewhere; kept both (yours is "${copy.name}").`);
}

async function syncFolders(
  store: VaultStore,
  remote: SyncRemote,
  state: SyncState,
  userKey: Uint8Array,
  namespace: string,
  report: SyncReport,
): Promise<void> {
  const aad = foldersAad(namespace);
  for (let attempt = 0; attempt < 2; attempt++) {
    const rv = await remote.getVault();
    let folders = store.readFolders();
    if (rv?.folders && rv.folders.revision !== state.foldersRevision) {
      const plain = await aesGcmDecrypt(userKey, fromBase64(rv.folders.iv), fromBase64(rv.folders.ciphertext), aad);
      const theirs = JSON.parse(utf8Decode(plain)) as Folder[];
      // Union by id; a name edited on both sides keeps this machine's.
      const merged = new Map(theirs.map((f) => [f.id, f]));
      for (const f of folders) merged.set(f.id, f);
      folders = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
      store.writeFolders(folders);
      state.foldersRevision = rv.folders.revision;
      state.foldersHash = hash(theirs.slice().sort((a, b) => a.id.localeCompare(b.id)));
    }
    const sorted = folders.slice().sort((a, b) => a.id.localeCompare(b.id));
    if (hash(sorted) === state.foldersHash || (sorted.length === 0 && !state.foldersHash)) return;
    const { iv, ciphertext } = await aesGcmEncrypt(userKey, utf8Encode(JSON.stringify(sorted)), aad);
    const put = await remote.putFolders({ iv: toBase64(iv), ciphertext: toBase64(ciphertext) }, state.foldersRevision);
    if (put.ok) {
      state.foldersRevision = put.revision;
      state.foldersHash = hash(sorted);
      return;
    }
    report.notes.push("Folders changed elsewhere at the same time; merged and retried.");
  }
}

/** Pull then push: what `sync` runs, and what the hooks run around a command. */
export async function syncVault(store: VaultStore, remote: SyncRemote, userKey?: Uint8Array): Promise<SyncReport> {
  const report = await pullVault(store, remote);
  return pushVault(store, remote, userKey, report);
}

/** One line for a person, or "" when nothing moved. */
export function describeSync(report: SyncReport, label: string): string {
  const parts: string[] = [];
  if (report.downloaded) parts.push("downloaded the vault");
  if (report.created) parts.push("uploaded the vault");
  if (report.pulled) parts.push(`${report.pulled} in`);
  if (report.pushed) parts.push(`${report.pushed} out`);
  if (report.deleted) parts.push(`${report.deleted} purged`);
  if (report.conflicts) parts.push(`${report.conflicts} conflict(s)`);
  const head = parts.length ? `vault sync (${label}): ${parts.join(", ")}` : "";
  return [head, ...report.notes.map((n) => `vault sync: ${n}`)].filter(Boolean).join("\n");
}
