import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { CredentialSyncPlan, CredentialSyncRun, CredentialAuditEvent, CredentialValueBag } from "./types.js";

/**
 * File-backed store so the CLI can reference plans/runs by id across invocations.
 *
 * Layout under the base dir (default `$LOGICSRC_CREDENTIAL_HOME` or
 * `<cwd>/.logicsrc/credentials`):
 *   plans/<id>.json     redacted sync plans (fingerprints only)
 *   runs/<id>.json      run records (fingerprints only)
 *   audit/<runId>.json  audit events (fingerprints only)
 *   vault/<runId>.json  rollback pre-image — RAW prior target values, mode 0600
 *
 * The vault is the only place raw values touch disk, and only to make rollback
 * possible. It is written 0600 and lives under a `.logicsrc` dir that callers
 * should gitignore. Audit and plan records never contain raw values.
 */
export interface CredentialStore {
  baseDir: string;
  savePlan(plan: CredentialSyncPlan): void;
  getPlan(id: string): CredentialSyncPlan | undefined;
  saveRun(run: CredentialSyncRun): void;
  getRun(id: string): CredentialSyncRun | undefined;
  saveAudit(runId: string, events: CredentialAuditEvent[]): void;
  getAudit(runId: string): CredentialAuditEvent[];
  saveVault(runId: string, preImage: CredentialValueBag): void;
  getVault(runId: string): CredentialValueBag | undefined;
}

export function defaultCredentialHome(): string {
  if (process.env.LOGICSRC_CREDENTIAL_HOME) {
    return resolve(process.env.LOGICSRC_CREDENTIAL_HOME);
  }
  if (process.env.LOGICSRC_HOME) {
    return resolve(process.env.LOGICSRC_HOME, "credentials");
  }
  return resolve(process.cwd(), ".logicsrc", "credentials");
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
    saveVault(runId, preImage) {
      ensure(dirs.vault, 0o700);
      writeFileSync(join(dirs.vault, `${runId}.json`), JSON.stringify(preImage, null, 2), { mode: 0o600 });
    },
    getVault(runId) {
      return readJson<CredentialValueBag>(join(dirs.vault, `${runId}.json`));
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
    saveVault: (runId, preImage) => void vault.set(runId, preImage),
    getVault: (runId) => vault.get(runId)
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
