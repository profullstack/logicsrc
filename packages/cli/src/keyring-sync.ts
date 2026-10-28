import type { VaultMeta } from "@logicsrc/opencreds";
import { readIdentity, resolveApiUrl } from "@logicsrc/plugin-credential-sharing";
import type { KeyringEntry, KeyringStore } from "./keyring.js";

/**
 * Optional cloud for the keyring: the account copy at app.logicsrc.com
 * (/api/keyring). What goes up is exactly what is on disk: the wrapped meta and
 * each entry's public half + envelope. Merging is last-writer-wins per entry on
 * updatedAt/deletedAt, which is enough for a keyring (keys are added and
 * removed, rarely edited, and an edit is a whole new envelope).
 */

export interface KeyringRemote {
  label: string;
  get(): Promise<{ meta: VaultMeta | null; entries: KeyringEntry[] }>;
  putMeta(meta: VaultMeta): Promise<{ ok: true } | { ok: false; meta: VaultMeta }>;
  putEntry(entry: KeyringEntry): Promise<{ ok: true } | { ok: false; current: KeyringEntry }>;
  wipe(): Promise<void>;
}

export class KeyringDivergedError extends Error {}

export interface KeyringSyncReport {
  pulled: string[];
  pushed: string[];
  deleted: string[];
  createdRemote: boolean;
  adoptedRemote: boolean;
  backup?: string;
}

const stamp = (e: KeyringEntry): number => Math.max(Date.parse(e.updatedAt) || 0, e.deletedAt ? Date.parse(e.deletedAt) || 0 : 0);
const sameKeyring = (a: VaultMeta, b: VaultMeta): boolean => a.kdfSalt === b.kdfSalt && a.protectedUserKey === b.protectedUserKey;

export async function syncKeyring(
  store: KeyringStore,
  remote: KeyringRemote,
  mode?: "use-remote" | "use-local"
): Promise<KeyringSyncReport> {
  const report: KeyringSyncReport = { pulled: [], pushed: [], deleted: [], createdRemote: false, adoptedRemote: false };
  let { meta: remoteMeta, entries: remoteEntries } = await remote.get();
  let localMeta = store.readMeta();

  if (!localMeta && !remoteMeta) {
    throw new Error("There is no keyring here or in your account yet. Make one: logicsrc keyring init");
  }
  if (localMeta && remoteMeta && !sameKeyring(localMeta, remoteMeta)) {
    if (mode === "use-remote") {
      report.backup = store.backup();
      localMeta = undefined;
    } else if (mode === "use-local") {
      await remote.wipe();
      remoteMeta = null;
      remoteEntries = [];
    } else {
      throw new KeyringDivergedError(
        `This machine's keyring and the one in your account (${remote.label}) are different keyrings (different passphrase/salt). ` +
          "Keep the account's with `logicsrc keyring sync --use-remote` (this one is moved to a .bak dir), " +
          "or replace the account's with `logicsrc keyring sync --use-local`."
      );
    }
  }
  if (!localMeta && remoteMeta) {
    store.writeMeta(remoteMeta);
    report.adoptedRemote = true;
  }
  if (localMeta && !remoteMeta) {
    const put = await remote.putMeta(localMeta);
    if (!put.ok && !sameKeyring(put.meta, localMeta)) {
      throw new KeyringDivergedError("Another machine created a different keyring in the account just now. Run `logicsrc keyring sync` again.");
    }
    report.createdRemote = true;
  }

  const local = new Map(store.allEntries().map((e) => [e.id, e]));
  const remoteById = new Map(remoteEntries.map((e) => [e.id, e]));
  for (const id of new Set([...local.keys(), ...remoteById.keys()])) {
    const l = local.get(id);
    const r = remoteById.get(id);
    if (r && (!l || stamp(r) > stamp(l))) {
      store.write(r);
      (r.deletedAt ? report.deleted : report.pulled).push(r.name);
    } else if (l && (!r || stamp(l) > stamp(r))) {
      const put = await remote.putEntry(l);
      if (put.ok) report.pushed.push(l.name);
      else {
        store.write(put.current);
        report.pulled.push(put.current.name);
      }
    }
  }
  const settings = store.readSync();
  store.writeSync({ ...settings, cloud: true, lastSyncAt: new Date().toISOString() });
  return report;
}

export function describeKeyringSync(r: KeyringSyncReport, label: string): string {
  const parts = [
    r.adoptedRemote ? "took the account's keyring" : "",
    r.createdRemote ? "created the account copy" : "",
    r.pushed.length ? `pushed ${r.pushed.length} (${r.pushed.join(", ")})` : "",
    r.pulled.length ? `pulled ${r.pulled.length} (${r.pulled.join(", ")})` : "",
    r.deleted.length ? `removed ${r.deleted.length} deleted elsewhere` : "",
    r.backup ? `old local keyring kept at ${r.backup}` : ""
  ].filter(Boolean);
  return `Keyring synced with ${label}: ${parts.length ? parts.join("; ") : "already up to date"}. Only ciphertext and public keys were sent.`;
}

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** The logged-in account's keyring, or undefined when not logged in. */
export function accountKeyringRemote(): KeyringRemote | undefined {
  const envKey = process.env.LOGICSRC_API_KEY?.trim();
  const identity = readIdentity();
  const token = envKey || identity?.apiToken;
  if (!token) return undefined;
  return createKeyringRemote(resolveApiUrl(identity), token, envKey ? undefined : identity?.email);
}

export function createKeyringRemote(apiUrl: string, token: string, email?: string, doFetch: typeof fetch = fetch): KeyringRemote {
  const base = apiUrl.replace(/\/+$/, "");
  let host = base;
  try {
    host = new URL(base).host;
  } catch {
    /* keep base */
  }
  async function call(method: string, path: string, body?: unknown, ok: number[] = []): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000)
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok && !ok.includes(res.status)) throw new HttpError(String(json.error || `${host} answered HTTP ${res.status}`), res.status);
    return { status: res.status, body: json };
  }
  return {
    label: email ? `${host} (${email})` : host,
    async get() {
      const { body } = await call("GET", "/api/keyring?include=envelopes");
      return { meta: (body.meta as VaultMeta) ?? null, entries: (body.entries as KeyringEntry[]) ?? [] };
    },
    async putMeta(meta) {
      const { status, body } = await call("PUT", "/api/keyring/meta", { meta }, [409]);
      return status === 409 ? { ok: false, meta: body.meta as VaultMeta } : { ok: true };
    },
    async putEntry(entry) {
      const { status, body } = await call("PUT", `/api/keyring/entries/${encodeURIComponent(entry.id)}`, { entry }, [409]);
      return status === 409 ? { ok: false, current: body.entry as KeyringEntry } : { ok: true };
    },
    async wipe() {
      await call("DELETE", "/api/keyring");
    }
  };
}
