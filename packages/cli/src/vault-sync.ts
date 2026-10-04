import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { Envelope, RemoteItem, RemoteVault, SyncRemote, VaultMeta, VaultStore } from "@logicsrc/opencreds";
import { readIdentity, resolveApiUrl } from "@logicsrc/plugin-credential-sharing";

/**
 * `logicsrc vault` syncs to the logged-in account (apps/pwa /api/opencreds),
 * so the personal vault survives the machine and follows you to the next one.
 *
 * Only the default vault syncs. A vault opened with --home or OPENCREDS_HOME is
 * a second vault (a test, a scratch copy), and the account holds one; letting
 * it sync would replace the real one. LOGICSRC_VAULT_SYNC=on opts such a vault
 * in, =off turns sync off everywhere.
 */
export function defaultVaultDir(): string {
  const config = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(config, "logicsrc", "opencreds");
}

export function accountRemoteFor(store: VaultStore): SyncRemote | undefined {
  const setting = (process.env.LOGICSRC_VAULT_SYNC || "").toLowerCase();
  if (setting === "off" || setting === "0" || setting === "false") return undefined;
  if (setting !== "on" && resolve(store.baseDir) !== resolve(defaultVaultDir())) return undefined;
  const identity = readIdentity();
  if (!identity?.apiToken) return undefined;
  return createAccountRemote(resolveApiUrl(identity), identity.apiToken, identity.email);
}

class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown>) {
    super(message);
  }
}

export function createAccountRemote(apiUrl: string, token: string, email?: string): SyncRemote {
  const base = apiUrl.replace(/\/+$/, "");
  const host = (() => {
    try {
      return new URL(base).host;
    } catch {
      return base;
    }
  })();

  async function call(method: string, path: string, body?: unknown, ok: number[] = []): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok && !ok.includes(res.status)) {
      throw new HttpError(String(json.error || `${host} answered HTTP ${res.status}`), res.status, json);
    }
    return { status: res.status, body: json };
  }

  return {
    label: email ? `${host} (${email})` : host,

    async getVault() {
      const { status, body } = await call("GET", "/api/opencreds/vault", undefined, [404]);
      return status === 404 ? null : (body.vault as RemoteVault);
    },

    async putMeta(meta: VaultMeta, baseRevision: number) {
      const { status, body } = await call("PUT", "/api/opencreds/vault/meta", { meta, baseRevision }, [409]);
      return status === 409 ? { ok: false, vault: (body.vault as RemoteVault) ?? null } : { ok: true, revision: Number(body.revision) };
    },

    async putFolders(blob: { ciphertext: string; iv: string }, baseRevision: number) {
      const { status, body } = await call("PUT", "/api/opencreds/vault/folders", { ...blob, baseRevision }, [409]);
      return status === 409 ? { ok: false, vault: (body.vault as RemoteVault) ?? null } : { ok: true, revision: Number(body.revision) };
    },

    async listItems(since: number) {
      const { body } = await call("GET", `/api/opencreds/items?since=${since}`);
      return { items: body.items as RemoteItem[], cursor: Number(body.cursor) };
    },

    async putItems(changes: Array<{ id: string; envelope: Envelope | null; baseRevision: number }>) {
      const { body } = await call("PUT", "/api/opencreds/items", { changes });
      return {
        applied: body.applied as Array<{ id: string; revision: number; seq: number }>,
        conflicts: body.conflicts as RemoteItem[],
      };
    },

    async reset() {
      await call("DELETE", "/api/opencreds/vault");
    },
  };
}
