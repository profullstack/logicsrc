/**
 * A file-backed vault, so the CLI has somewhere to keep items between
 * invocations.
 *
 * Layout under `$OPENCREDS_HOME` or `~/.config/logicsrc/opencreds`:
 *
 *   meta.json          vault metadata — key material, all of it wrapped
 *   items/<id>.json    one envelope per item
 *   audit.jsonl        append-only audit events, values never present
 *
 * One file per item rather than one file for the vault, for the same reason
 * storage-backed implementations use one row per item: two writers editing two
 * different passwords must not cost anyone a credential, and with a single blob
 * the later write silently discards the earlier.
 *
 * The store never sees a key. It reads and writes ciphertext; unlocking happens
 * in the caller and the user key stays in that caller's memory.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AuditEvent, Envelope, Folder, VaultMeta } from "./types.js";

export function opencredsHome(): string {
  const override = process.env.OPENCREDS_HOME;
  if (override && override.trim() !== "") return override;
  const config = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(config, "logicsrc", "opencreds");
}

/** 0600, always. The one place vault bytes touch this machine's disk. */
function writePrivate(path: string, contents: string): void {
  writeFileSync(path, contents, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows and some network filesystems have no modes. The write still
    // happened; a missing chmod is not a reason to lose the data.
  }
}

export interface VaultStore {
  baseDir: string;
  exists(): boolean;
  readMeta(): VaultMeta | undefined;
  writeMeta(meta: VaultMeta): void;
  listEnvelopes(): Envelope[];
  readEnvelope(id: string): Envelope | undefined;
  writeEnvelope(envelope: Envelope): void;
  deleteEnvelope(id: string): void;
  readFolders(): Folder[];
  writeFolders(folders: Folder[]): void;
  appendAudit(event: AuditEvent): void;
  readAudit(): AuditEvent[];
}

export function createVaultStore(baseDir = opencredsHome()): VaultStore {
  const itemsDir = join(baseDir, "items");
  const metaPath = join(baseDir, "meta.json");
  const foldersPath = join(baseDir, "folders.json");
  const auditPath = join(baseDir, "audit.jsonl");

  function ensureDirs(): void {
    mkdirSync(itemsDir, { recursive: true, mode: 0o700 });
  }

  function readJson<T>(path: string): T | undefined {
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch {
      return undefined;
    }
  }

  return {
    baseDir,

    exists(): boolean {
      return existsSync(metaPath);
    },

    readMeta(): VaultMeta | undefined {
      return readJson<VaultMeta>(metaPath);
    },

    writeMeta(meta: VaultMeta): void {
      ensureDirs();
      writePrivate(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
    },

    listEnvelopes(): Envelope[] {
      if (!existsSync(itemsDir)) return [];
      const out: Envelope[] = [];
      for (const file of readdirSync(itemsDir)) {
        if (!file.endsWith(".json")) continue;
        const envelope = readJson<Envelope>(join(itemsDir, file));
        if (envelope) out.push(envelope);
      }
      // Stable order, so two runs of `list` agree and a diff of two exports is
      // about the vault rather than about the filesystem.
      return out.sort((a, b) => a.id.localeCompare(b.id));
    },

    readEnvelope(id: string): Envelope | undefined {
      return readJson<Envelope>(join(itemsDir, `${id}.json`));
    },

    writeEnvelope(envelope: Envelope): void {
      ensureDirs();
      const existing = readJson<Envelope>(join(itemsDir, `${envelope.id}.json`));
      const now = new Date().toISOString();
      const next: Envelope = {
        ...envelope,
        revision: (existing?.revision ?? 0) + 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      writePrivate(join(itemsDir, `${envelope.id}.json`), `${JSON.stringify(next, null, 2)}\n`);
    },

    deleteEnvelope(id: string): void {
      rmSync(join(itemsDir, `${id}.json`), { force: true });
    },

    readFolders(): Folder[] {
      return readJson<Folder[]>(foldersPath) ?? [];
    },

    writeFolders(folders: Folder[]): void {
      ensureDirs();
      writePrivate(foldersPath, `${JSON.stringify(folders, null, 2)}\n`);
    },

    appendAudit(event: AuditEvent): void {
      ensureDirs();
      // Append rather than rewrite: an audit trail that is rewritten on every
      // event is an audit trail a crash can truncate to nothing.
      const line = `${JSON.stringify(event)}\n`;
      writeFileSync(auditPath, line, { encoding: "utf8", flag: "a", mode: 0o600 });
    },

    readAudit(): AuditEvent[] {
      if (!existsSync(auditPath)) return [];
      return readFileSync(auditPath, "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "")
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as AuditEvent];
          } catch {
            return [];
          }
        });
    },
  };
}
