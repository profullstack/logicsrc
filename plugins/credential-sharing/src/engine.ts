import type { LogicSrcPrincipal, LogicSrcPolicyDecision } from "@logicsrc/account-core";
import { fingerprintValue, fingerprintsEqual } from "./fingerprint.js";
import { createFileCredentialStore, type CredentialStore } from "./store.js";
import { credentialProviderRegistry } from "./providers/index.js";
import type {
  CredentialEndpoint,
  CredentialProvider,
  CredentialSnapshot,
  CredentialDiff,
  CredentialDiffEntry,
  CredentialPolicy,
  CredentialSyncPlan,
  CredentialApproval,
  CredentialSyncRun,
  CredentialKeyResult,
  CredentialAuditEvent,
  CredentialValueBag,
  CredentialProviderManifest
} from "./types.js";

export interface CredentialEngineOptions {
  providers?: Map<string, CredentialProvider>;
  store?: CredentialStore;
  principal?: LogicSrcPrincipal;
  now?: () => Date;
  idFactory?: (prefix: string) => string;
}

export const DEFAULT_CREDENTIAL_POLICY: CredentialPolicy = {
  redactValues: true,
  requireApprovalForDestructive: true
};

const DEFAULT_PRINCIPAL: LogicSrcPrincipal = { type: "user", id: "local" };

function defaultId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class CredentialEngine {
  private readonly providers: Map<string, CredentialProvider>;
  private readonly store: CredentialStore;
  private readonly principal: LogicSrcPrincipal;
  private readonly now: () => Date;
  private readonly id: (prefix: string) => string;

  constructor(options: CredentialEngineOptions = {}) {
    this.providers = options.providers ?? credentialProviderRegistry;
    this.store = options.store ?? createFileCredentialStore();
    this.principal = options.principal ?? DEFAULT_PRINCIPAL;
    this.now = options.now ?? (() => new Date());
    this.id = options.idFactory ?? defaultId;
  }

  private iso(): string {
    return this.now().toISOString();
  }

  private requireProvider(id: string): CredentialProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Unknown credential provider: ${id}. Run "logicsrc credentials providers" to list available adapters.`);
    }
    return provider;
  }

  listCredentialProviders(): CredentialProviderManifest[] {
    return [...this.providers.values()].map(({ id, name, description, capabilities, authRequirements, status }) => ({
      id,
      name,
      description,
      capabilities,
      authRequirements,
      status
    }));
  }

  async inspectCredentialSource(endpoint: CredentialEndpoint): Promise<CredentialSnapshot> {
    return this.requireProvider(endpoint.provider).inspect(endpoint);
  }

  /** Compare a source against a target without moving any secret. */
  async diffCredentialEndpoints(from: CredentialEndpoint, to: CredentialEndpoint): Promise<CredentialDiff> {
    const source = this.requireProvider(from.provider);
    const target = this.requireProvider(to.provider);
    const [sourceSnapshot, targetSnapshot] = await Promise.all([source.inspect(from), target.inspect(to)]);

    const targetByName = new Map(targetSnapshot.keys.map((key) => [key.name, key]));
    const entries: CredentialDiffEntry[] = [];

    for (const sourceKey of sourceSnapshot.keys) {
      const targetKey = targetByName.get(sourceKey.name);
      if (!targetKey) {
        entries.push({ key: sourceKey.name, op: "add", sourceFingerprint: sourceKey.fingerprint, destructive: false });
        continue;
      }
      const comparable = sourceKey.fingerprint !== undefined && targetKey.fingerprint !== undefined;
      if (comparable && fingerprintsEqual(sourceKey.fingerprint, targetKey.fingerprint)) {
        entries.push({
          key: sourceKey.name,
          op: "unchanged",
          sourceFingerprint: sourceKey.fingerprint,
          targetFingerprint: targetKey.fingerprint,
          destructive: false
        });
        continue;
      }
      entries.push({
        key: sourceKey.name,
        // Present in target but values are not comparable (write-only target): "unknown".
        op: comparable ? "update" : "unknown",
        sourceFingerprint: sourceKey.fingerprint,
        targetFingerprint: targetKey.fingerprint,
        destructive: true
      });
    }

    return { from, to, redacted: true, entries, createdAt: this.iso() };
  }

  /** Build a sync plan from source -> target. Source must expose readable values. */
  async createCredentialSyncPlan(input: {
    from: CredentialEndpoint;
    to: CredentialEndpoint;
    policy?: Partial<CredentialPolicy>;
  }): Promise<CredentialSyncPlan> {
    const source = this.requireProvider(input.from.provider);
    const target = this.requireProvider(input.to.provider);

    if (!source.capabilities.readValues) {
      throw new Error(`Provider "${source.id}" cannot read values, so it cannot be a sync source.`);
    }
    if (!target.capabilities.write) {
      throw new Error(`Provider "${target.id}" is read-only and cannot be a sync target.`);
    }

    const policy: CredentialPolicy = { ...DEFAULT_CREDENTIAL_POLICY, ...input.policy };
    const diff = await this.diffCredentialEndpoints(input.from, input.to);

    const denied = new Set(policy.denyKeys ?? []);
    const changes = diff.entries.filter((entry) => entry.op !== "unchanged" && !denied.has(entry.key));
    const requiresApproval = policy.requireApprovalForDestructive && changes.some((change) => change.destructive);

    const plan: CredentialSyncPlan = {
      type: "logicsrc.credential_sync_plan",
      id: this.id("cred_plan"),
      from: input.from,
      to: input.to,
      policy,
      changes,
      requiresApproval,
      createdAt: this.iso()
    };
    this.store.savePlan(plan);
    return plan;
  }

  approveCredentialSync(planId: string, approval: { approver?: LogicSrcPrincipal; keys?: string[] } = {}): CredentialApproval {
    const plan = this.store.getPlan(planId);
    if (!plan) {
      throw new Error(`Unknown credential sync plan: ${planId}`);
    }
    return {
      type: "logicsrc.credential_approval",
      id: this.id("cred_approval"),
      planId,
      approver: approval.approver ?? this.principal,
      approvedKeys: approval.keys ?? [],
      approvedAt: this.iso()
    };
  }

  /** Execute a plan. Dry-run by default — pass `dryRun: false` to write. */
  async runCredentialSync(
    planId: string,
    options: { dryRun?: boolean; approval?: CredentialApproval } = {}
  ): Promise<CredentialSyncRun> {
    const plan = this.store.getPlan(planId);
    if (!plan) {
      throw new Error(`Unknown credential sync plan: ${planId}`);
    }
    const dryRun = options.dryRun ?? true;

    if (!dryRun && plan.requiresApproval) {
      this.assertApprovalCovers(plan, options.approval);
    }

    const target = this.requireProvider(plan.to.provider);
    const upsertKeys = plan.changes.filter((c) => c.op === "add" || c.op === "update" || c.op === "unknown").map((c) => c.key);
    const deleteKeys = plan.changes.filter((c) => c.op === "remove").map((c) => c.key);

    // Resolve the values to write. A rollback plan pulls from the origin run's vault.
    const upserts = await this.resolveSourceValues(plan, upsertKeys);

    // Capture a rollback pre-image of the target's current values, when readable.
    const reversible = target.capabilities.readValues && target.capabilities.write && upsertKeys.length > 0;
    const runId = this.id("cred_run");
    if (reversible && !dryRun && target.readValues) {
      const preImage = await target.readValues(plan.to, [...upsertKeys, ...deleteKeys]);
      this.store.saveVault(runId, preImage);
    }

    const writeResults = await target.write({ endpoint: plan.to, upserts, deletes: deleteKeys, dryRun });
    const writeByKey = new Map(writeResults.map((r) => [r.key, r]));

    const decision: LogicSrcPolicyDecision = dryRun ? "allow" : plan.requiresApproval ? "approval_required" : "allow";
    const targetLabel = endpointLabel(plan.to);
    const results: CredentialKeyResult[] = [];
    const auditEvents: CredentialAuditEvent[] = [];

    for (const change of plan.changes) {
      const written = writeByKey.get(change.key);
      const applied = !dryRun && (written?.applied ?? false);
      const fingerprint = upserts[change.key] !== undefined ? fingerprintValue(upserts[change.key]) : change.sourceFingerprint;
      results.push({
        key: change.key,
        op: change.op,
        applied,
        dryRun,
        targetFingerprint: change.op === "remove" ? undefined : fingerprint,
        error: written?.error
      });
      auditEvents.push({
        type: "logicsrc.credential_audit_event",
        id: this.id("cred_audit"),
        runId,
        planId: plan.id,
        provider: plan.to.provider,
        action: `credentials:${change.op}`,
        key: change.key,
        target: targetLabel,
        fingerprint: change.op === "remove" ? undefined : fingerprint,
        principal: options.approval?.approver ?? this.principal,
        decision,
        dryRun,
        createdAt: this.iso()
      });
    }

    const anyError = results.some((r) => r.error);
    const status = dryRun
      ? "dry_run"
      : anyError
        ? results.some((r) => r.applied)
          ? "partial"
          : "failed"
        : "applied";

    const run: CredentialSyncRun = {
      type: "logicsrc.credential_sync_run",
      id: runId,
      planId: plan.id,
      status,
      dryRun,
      results,
      auditEventIds: auditEvents.map((e) => e.id),
      reversible: reversible && !dryRun,
      startedAt: plan.createdAt,
      finishedAt: this.iso()
    };
    this.store.saveRun(run);
    this.store.saveAudit(runId, auditEvents);
    return run;
  }

  /** Produce a NEW plan that reverses a run by restoring its captured pre-image. */
  async rollbackCredentialSync(runId: string): Promise<CredentialSyncPlan> {
    const run = this.store.getRun(runId);
    if (!run) {
      throw new Error(`Unknown credential sync run: ${runId}`);
    }
    if (!run.reversible) {
      throw new Error(`Run ${runId} was not reversible (no pre-image captured). Rollbacks require a value-readable target.`);
    }
    const preImage = this.store.getVault(runId);
    if (!preImage) {
      throw new Error(`No rollback pre-image found for run ${runId}.`);
    }
    const originPlan = this.store.getPlan(run.planId);
    if (!originPlan) {
      throw new Error(`Origin plan ${run.planId} for run ${runId} is missing.`);
    }

    // Restore prior values for keys that existed before the run...
    const restores: CredentialDiffEntry[] = Object.keys(preImage)
      .sort()
      .map((key) => ({ key, op: "update", sourceFingerprint: fingerprintValue(preImage[key]), destructive: true }));
    // ...and delete keys the run newly added (no prior value to restore).
    const deletions: CredentialDiffEntry[] = run.results
      .filter((result) => result.op === "add" && result.applied && !(result.key in preImage))
      .map((result) => ({ key: result.key, op: "remove" as const, destructive: true }));
    const changes: CredentialDiffEntry[] = [...restores, ...deletions];

    const plan: CredentialSyncPlan = {
      type: "logicsrc.credential_sync_plan",
      id: this.id("cred_plan"),
      from: { provider: originPlan.to.provider, metadata: { rollbackVault: runId } },
      to: originPlan.to,
      policy: { ...DEFAULT_CREDENTIAL_POLICY },
      changes,
      requiresApproval: true,
      rollbackOfRunId: runId,
      createdAt: this.iso()
    };
    this.store.savePlan(plan);
    return plan;
  }

  exportCredentialAudit(runId: string): CredentialAuditEvent[] {
    return this.store.getAudit(runId);
  }

  // --- internals -----------------------------------------------------------

  private assertApprovalCovers(plan: CredentialSyncPlan, approval?: CredentialApproval): void {
    if (!approval) {
      throw new Error(`Plan ${plan.id} requires approval before writing. Run "logicsrc credentials approve --plan ${plan.id}".`);
    }
    if (approval.planId !== plan.id) {
      throw new Error(`Approval ${approval.id} is for plan ${approval.planId}, not ${plan.id}.`);
    }
    if (approval.approvedKeys.length === 0) {
      return; // empty = approve all changes
    }
    const approved = new Set(approval.approvedKeys);
    const missing = plan.changes.filter((c) => c.destructive && !approved.has(c.key)).map((c) => c.key);
    if (missing.length > 0) {
      throw new Error(`Approval does not cover destructive keys: ${missing.join(", ")}`);
    }
  }

  private async resolveSourceValues(plan: CredentialSyncPlan, keys: string[]): Promise<CredentialValueBag> {
    if (keys.length === 0) {
      return {};
    }
    if (plan.rollbackOfRunId) {
      const preImage = this.store.getVault(plan.rollbackOfRunId);
      if (!preImage) {
        throw new Error(`Rollback plan ${plan.id} references missing vault for run ${plan.rollbackOfRunId}.`);
      }
      return Object.fromEntries(keys.filter((k) => k in preImage).map((k) => [k, preImage[k]]));
    }
    const source = this.requireProvider(plan.from.provider);
    if (!source.readValues) {
      throw new Error(`Provider "${source.id}" cannot read values needed to apply the plan.`);
    }
    return source.readValues(plan.from, keys);
  }
}

export function endpointLabel(endpoint: CredentialEndpoint): string {
  const parts = [endpoint.provider];
  if (endpoint.path) parts.push(endpoint.path);
  if (endpoint.project) parts.push(endpoint.project);
  if (endpoint.config) parts.push(endpoint.config);
  if (endpoint.service) parts.push(endpoint.service);
  return parts.join(":");
}
