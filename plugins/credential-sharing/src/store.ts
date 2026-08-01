import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { identityPath, loadOrCreateIdentity, logicsrcHome, readIdentity } from "./identity.js";
import { decryptValue, encryptValue, generateVaultKey, unwrapVaultKey, wrapVaultKey, type SealedValue } from "./crypto.js";
import type { CredentialSyncPlan, CredentialSyncRun, CredentialAuditEvent, CredentialValueBag } from "./types.js";

/**
 * File-backed store so the CLI can reference plans/runs by id across invocations.
 *
 * Layout under the base dir (default `$LOGICSRC_CREDENTIAL_HOME` or
 * `~/.config/logicsrc/credentials`):
 *   plans/<id>.json     redacted sync plans (fingerprints only)
 *   runs/<id>.json      run records (fingerprints only)
 *   audit/<runId>.json  audit events (fingerprints only)
 *   vault/<runId>.json  rollback pre-image — sealed to this machine's identity, mode 0600
 *
 * The vault is the only place prior values touch disk, and only to make
 * rollback possible. It is encrypted at rest — sealed to this machine's
 * identity key, so the file opens with the secret key in identity.json and
 * nothing else — written 0600, and kept in the user's config dir, outside any
 * project. Mode 0600 stops another user on the box; the sealing stops a
 * backup, a synced home directory or a lifted disk. Audit and plan records
 * never contain raw values at all.
 */
export interface CredentialStore {
  baseDir: string;
  savePlan(plan: CredentialSyncPlan): void;
  getPlan(id: string): CredentialSyncPlan | undefined;
  saveRun(run: CredentialSyncRun): void;
  getRun(id: string): CredentialSyncRun | undefined;
  saveAudit(runId: string, events: CredentialAuditEvent[]): void;
  getAudit(runId: string): CredentialAuditEvent[];
  saveVault(runId: string, preImage: CredentialValueBag): Promise<void>;
  getVault(runId: string): Promise<CredentialValueBag | undefined>;
}

/**
 * A vault file, sealed to this machine's identity key.
 *
 * The DEK is fresh per write and sealed to the identity public key, so the
 * file is openable by the secret key in `identity.json` and nothing else —
 * mode 0600 stops another user on the box reading it, and this stops a backup,
 * a synced home directory, or a stolen disk from doing the same.
 *
 * `version` is what tells a sealed file from the plaintext ones written before
 * this existed. Those are still readable; see getVault.
 */
interface SealedVaultFile {
  version: 2;
  wrappedKey: string;
  sealed: SealedValue;
}

function isSealed(value: unknown): value is SealedVaultFile {
  return typeof value === "object" && value !== null && (value as { version?: unknown }).version === 2;
}

/**
 * The one credential store for this user, on this machine.
 *
 * This used to fall back to `<cwd>/.logicsrc/credentials`, which meant the
 * vault was wherever you happened to be standing: run the CLI in a git
 * checkout and it wrote a directory named `credentials/vault` into that
 * repo's working tree — untracked, unignored, one `git add -A` away from
 * being published. Worse, the store is meant to be the record of what was
 * rotated, and a per-directory store is a record with as many disagreeing
 * copies as you have project folders.
 *
 * There is one vault per user. `$LOGICSRC_CREDENTIAL_HOME` still points it
 * somewhere explicit, for tests and for anyone keeping it on a mounted
 * volume; nothing derives it from the working directory any more.
 */
export function defaultCredentialHome(): string {
  if (process.env.LOGICSRC_CREDENTIAL_HOME) {
    return resolve(process.env.LOGICSRC_CREDENTIAL_HOME);
  }
  return join(logicsrcHome(), "credentials");
}

function readJson<T>(file: string): T | undefined {
  if (!existsSync(file)) {
    return undefined;
  }
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function createFileCredentialStore(baseDir = defaultCredentialHome()): CredentialStore {
  const dirs = {
    plans: join(baseDir, "plans"),
    runs: join(baseDir, "runs"),
    audit: join(baseDir, "audit"),
    vault: join(baseDir, "vault")
  };

  function ensure(dir: string, mode = 0o700) {
    mkdirSync(dir, { recursive: true, mode });
  }

  return {
    baseDir,
    savePlan(plan) {
      ensure(dirs.plans);
      writeFileSync(join(dirs.plans, `${plan.id}.json`), JSON.stringify(plan, null, 2));
    },
    getPlan(id) {
      return readJson<CredentialSyncPlan>(join(dirs.plans, `${id}.json`));
    },
    saveRun(run) {
      ensure(dirs.runs);
      writeFileSync(join(dirs.runs, `${run.id}.json`), JSON.stringify(run, null, 2));
    },
    getRun(id) {
      return readJson<CredentialSyncRun>(join(dirs.runs, `${id}.json`));
    },
    saveAudit(runId, events) {
      ensure(dirs.audit);
      writeFileSync(join(dirs.audit, `${runId}.json`), JSON.stringify(events, null, 2));
    },
    getAudit(runId) {
      return readJson<CredentialAuditEvent[]>(join(dirs.audit, `${runId}.json`)) ?? [];
    },
    async saveVault(runId, preImage) {
      ensure(dirs.vault, 0o700);
      // A fresh DEK per run, sealed to this machine's identity. Reusing one key
      // across runs would make a single compromise open every rollback ever
      // captured, and there is no reason to: the DEK travels with the file.
      const identity = await loadOrCreateIdentity();
      const dek = await generateVaultKey();
      const file: SealedVaultFile = {
        version: 2,
        wrappedKey: await wrapVaultKey(dek, identity.keys.publicKey),
        sealed: await encryptValue(JSON.stringify(preImage), dek)
      };
      writeFileSync(join(dirs.vault, `${runId}.json`), JSON.stringify(file, null, 2), { mode: 0o600 });
    },
    async getVault(runId) {
      const raw = readJson<SealedVaultFile | CredentialValueBag>(join(dirs.vault, `${runId}.json`));
      if (!raw) {
        return undefined;
      }
      // Plaintext files written before vaults were sealed still open. Refusing
      // them would strand the rollback data they exist to hold — the point of
      // the vault is that a bad rotation can be undone, and a reader that
      // cannot read yesterday's vault takes that away.
      if (!isSealed(raw)) {
        return raw as CredentialValueBag;
      }
      const identity = readIdentity();
      if (!identity?.keys?.secretKey) {
        throw new Error(
          `Vault for run ${runId} is sealed to this machine's identity, which is missing. ` +
            `Restore ${identityPath()} to roll this run back.`
        );
      }
      const dek = await unwrapVaultKey(raw.wrappedKey, identity.keys);
      return JSON.parse(await decryptValue(raw.sealed, dek)) as CredentialValueBag;
    }
  };
}

/** In-memory store for tests and ephemeral SDK usage (no disk writes). */
export function createMemoryCredentialStore(): CredentialStore {
  const plans = new Map<string, CredentialSyncPlan>();
  const runs = new Map<string, CredentialSyncRun>();
  const audit = new Map<string, CredentialAuditEvent[]>();
  const vault = new Map<string, CredentialValueBag>();
  return {
    baseDir: ":memory:",
    savePlan: (plan) => void plans.set(plan.id, plan),
    getPlan: (id) => plans.get(id),
    saveRun: (run) => void runs.set(run.id, run),
    getRun: (id) => runs.get(id),
    saveAudit: (runId, events) => void audit.set(runId, events),
    getAudit: (runId) => audit.get(runId) ?? [],
    saveVault: async (runId, preImage) => void vault.set(runId, preImage),
    getVault: async (runId) => vault.get(runId)
  };
}

export function listPlanIds(store: CredentialStore): string[] {
  const dir = join(store.baseDir, "plans");
  if (store.baseDir === ":memory:" || !existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}
