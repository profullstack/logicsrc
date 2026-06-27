import type { LogicSrcPrincipal, LogicSrcPolicyDecision } from "@logicsrc/account-core";

/**
 * LogicSRC Credential Sharing OpenSpec — core object + provider-contract types.
 *
 * Security invariants (see docs/credential-sharing.md):
 * - Raw secret values never appear in any object returned to a caller for display.
 * - Audit records carry key names, targets, timestamps, actor identity, and value
 *   fingerprints — never raw values.
 * - Every write supports dry-run.
 * - Adapters declare read/write capabilities before a plan is generated.
 */

export type CredentialProviderId = "env" | "doppler" | "railway" | "github-secrets" | (string & {});

export interface CredentialProviderCapabilities {
  /** Adapter can read raw secret values (enables value-level fingerprint diffs). */
  readValues: boolean;
  /** Adapter can enumerate key names (even if values are write-only). */
  readNames: boolean;
  /** Adapter can write/update secret values. */
  write: boolean;
  /** Adapter can delete keys. */
  delete: boolean;
  /** Adapter can restore a captured pre-image. */
  rollback: boolean;
  /** Adapter exposes a native audit trail. */
  audit: boolean;
}

/** A `credential_source` / `credential_target`: a provider plus its addressing scope. */
export interface CredentialEndpoint {
  provider: CredentialProviderId;
  /** Local file path for the `env` provider. */
  path?: string;
  /** Provider project handle (Doppler project, Railway project id, GitHub owner). */
  project?: string;
  /** Provider config/environment (Doppler config, Railway environment, GitHub environment). */
  config?: string;
  /** Optional sub-scope (Railway service id, GitHub repo, GitHub org). */
  service?: string;
  /** Provider scope label used in GitHub Secrets: "repo" | "org" | "environment". */
  scope?: string;
  metadata?: Record<string, unknown>;
}

/** A redacted view of a single key — names + fingerprints only, never values. */
export interface CredentialKey {
  name: string;
  present: boolean;
  /** Deterministic fingerprint of the value, or undefined when the provider is write-only. */
  fingerprint?: string;
  lastModifiedAt?: string;
}

/** Result of `inspect()` — a redacted snapshot of an endpoint. */
export interface CredentialSnapshot {
  provider: CredentialProviderId;
  endpoint: CredentialEndpoint;
  /** True when fingerprints reflect real values (provider can read values). */
  valuesReadable: boolean;
  keys: CredentialKey[];
  inspectedAt: string;
}

export type CredentialDiffOp = "add" | "update" | "remove" | "unchanged" | "unknown";

export interface CredentialDiffEntry {
  key: string;
  op: CredentialDiffOp;
  sourceFingerprint?: string;
  targetFingerprint?: string;
  /** True for ops that overwrite or delete an existing target value. */
  destructive: boolean;
}

export interface CredentialDiff {
  from: CredentialEndpoint;
  to: CredentialEndpoint;
  redacted: true;
  entries: CredentialDiffEntry[];
  createdAt: string;
}

export interface CredentialPolicy {
  /** Secret values are always redacted in output; here for spec completeness. */
  redactValues: true;
  /** Destructive changes require an approval before a write runs. */
  requireApprovalForDestructive: boolean;
  /** Keys matching these (glob-ish) names are never written. */
  denyKeys?: string[];
}

export interface CredentialSyncPlan {
  type: "logicsrc.credential_sync_plan";
  id: string;
  from: CredentialEndpoint;
  to: CredentialEndpoint;
  policy: CredentialPolicy;
  changes: CredentialDiffEntry[];
  requiresApproval: boolean;
  /** A rollback plan references the run it reverses. */
  rollbackOfRunId?: string;
  createdAt: string;
}

export interface CredentialApproval {
  type: "logicsrc.credential_approval";
  id: string;
  planId: string;
  approver: LogicSrcPrincipal;
  /** Keys explicitly approved; empty means "all changes in the plan". */
  approvedKeys: string[];
  approvedAt: string;
}

export type CredentialSyncRunStatus = "planned" | "dry_run" | "applied" | "partial" | "failed" | "rolled_back";

export interface CredentialKeyResult {
  key: string;
  op: CredentialDiffOp;
  applied: boolean;
  dryRun: boolean;
  targetFingerprint?: string;
  error?: string;
}

export interface CredentialSyncRun {
  type: "logicsrc.credential_sync_run";
  id: string;
  planId: string;
  status: CredentialSyncRunStatus;
  dryRun: boolean;
  results: CredentialKeyResult[];
  auditEventIds: string[];
  /** True when a rollback pre-image was captured for this run. */
  reversible: boolean;
  startedAt: string;
  finishedAt: string;
}

export interface CredentialAuditEvent {
  type: "logicsrc.credential_audit_event";
  id: string;
  runId?: string;
  planId?: string;
  provider: CredentialProviderId;
  action: string;
  key: string;
  target: string;
  /** Fingerprint of the value written/observed — never the value itself. */
  fingerprint?: string;
  principal: LogicSrcPrincipal;
  decision: LogicSrcPolicyDecision;
  dryRun: boolean;
  createdAt: string;
}

/** Raw key/value bag — used only internally between adapters and the engine, never displayed. */
export type CredentialValueBag = Record<string, string>;

export interface CredentialWriteResult {
  key: string;
  applied: boolean;
  error?: string;
}

export interface CredentialProviderManifest {
  id: CredentialProviderId;
  name: string;
  description: string;
  capabilities: CredentialProviderCapabilities;
  /** Environment variables / fields the adapter needs to authenticate. */
  authRequirements: string[];
  status: "available" | "planned";
}

/**
 * Provider adapter contract — the LogicSRC credential provider boundary.
 * Adapters are pure I/O: they read/write a backend and never decide policy.
 */
export interface CredentialProvider extends CredentialProviderManifest {
  /** Enumerate keys (names always; values only when capabilities.readValues). */
  inspect(endpoint: CredentialEndpoint): Promise<CredentialSnapshot>;
  /** Read raw values for the given keys (internal use only; gated by readValues). */
  readValues?(endpoint: CredentialEndpoint, keys: string[]): Promise<CredentialValueBag>;
  /** Apply a set of key writes/deletes. `dryRun` must short-circuit all mutation. */
  write(input: {
    endpoint: CredentialEndpoint;
    upserts: CredentialValueBag;
    deletes: string[];
    dryRun: boolean;
  }): Promise<CredentialWriteResult[]>;
  /** Restore a previously captured pre-image (optional; gated by rollback). */
  rollback?(input: { endpoint: CredentialEndpoint; preImage: CredentialValueBag; dryRun: boolean }): Promise<CredentialWriteResult[]>;
  /** Native audit trail (optional; gated by audit). */
  audit?(endpoint: CredentialEndpoint): Promise<CredentialAuditEvent[]>;
}
