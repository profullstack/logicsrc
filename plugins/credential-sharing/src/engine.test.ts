import { describe, expect, it } from "vitest";
import { CredentialEngine } from "./engine.js";
import { createMemoryCredentialStore } from "./store.js";
import { fingerprintValue } from "./fingerprint.js";
import type { CredentialProvider, CredentialValueBag } from "./types.js";

/** In-memory provider backed by a mutable bag — stands in for env/doppler/railway. */
function memoryProvider(id: string, initial: CredentialValueBag, opts: { readValues?: boolean } = {}): CredentialProvider & { store: CredentialValueBag } {
  const store: CredentialValueBag = { ...initial };
  const readValues = opts.readValues ?? true;
  return {
    id,
    name: id,
    description: id,
    capabilities: { readValues, readNames: true, write: true, delete: true, rollback: readValues, audit: false },
    authRequirements: [],
    status: "available",
    store,
    async inspect(endpoint) {
      return {
        provider: id,
        endpoint,
        valuesReadable: readValues,
        keys: Object.keys(store)
          .sort()
          .map((name) => ({ name, present: true, fingerprint: readValues ? fingerprintValue(store[name]) : undefined })),
        inspectedAt: new Date().toISOString()
      };
    },
    async readValues(_endpoint, keys) {
      return Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]));
    },
    async write({ upserts, deletes, dryRun }) {
      const results = [
        ...Object.keys(upserts).map((key) => ({ key, applied: !dryRun })),
        ...deletes.map((key) => ({ key, applied: !dryRun }))
      ];
      if (!dryRun) {
        Object.assign(store, upserts);
        for (const key of deletes) delete store[key];
      }
      return results;
    }
  };
}

function makeEngine(providers: CredentialProvider[]) {
  let counter = 0;
  return new CredentialEngine({
    providers: new Map(providers.map((p) => [p.id, p])),
    store: createMemoryCredentialStore(),
    now: () => new Date("2026-06-27T00:00:00.000Z"),
    idFactory: (prefix) => `${prefix}_${++counter}`
  });
}

describe("CredentialEngine diff + plan", () => {
  it("classifies add / update / unchanged by fingerprint", async () => {
    const source = memoryProvider("env", { A: "1", B: "2", SAME: "x" });
    const target = memoryProvider("railway", { B: "old", SAME: "x" });
    const engine = makeEngine([source, target]);

    const diff = await engine.diffCredentialEndpoints({ provider: "env" }, { provider: "railway" });
    const byKey = Object.fromEntries(diff.entries.map((e) => [e.key, e.op]));
    expect(byKey).toEqual({ A: "add", B: "update", SAME: "unchanged" });
  });

  it("never includes raw values in a plan", async () => {
    const source = memoryProvider("env", { SECRET: "super-secret-value" });
    const target = memoryProvider("railway", {});
    const engine = makeEngine([source, target]);

    const plan = await engine.createCredentialSyncPlan({ from: { provider: "env" }, to: { provider: "railway" } });
    expect(JSON.stringify(plan)).not.toContain("super-secret-value");
    expect(plan.changes[0]).toMatchObject({ key: "SECRET", op: "add" });
    expect(plan.changes[0].sourceFingerprint).toBe(fingerprintValue("super-secret-value"));
  });
});

describe("CredentialEngine sync safety", () => {
  it("dry-run does not mutate the target", async () => {
    const source = memoryProvider("env", { A: "1" });
    const target = memoryProvider("railway", {});
    const engine = makeEngine([source, target]);

    const plan = await engine.createCredentialSyncPlan({ from: { provider: "env" }, to: { provider: "railway" } });
    const run = await engine.runCredentialSync(plan.id, { dryRun: true });
    expect(run.status).toBe("dry_run");
    expect(target.store).toEqual({});
  });

  it("requires approval before a destructive apply", async () => {
    const source = memoryProvider("env", { A: "new" });
    const target = memoryProvider("railway", { A: "old" });
    const engine = makeEngine([source, target]);

    const plan = await engine.createCredentialSyncPlan({ from: { provider: "env" }, to: { provider: "railway" } });
    expect(plan.requiresApproval).toBe(true);
    await expect(engine.runCredentialSync(plan.id, { dryRun: false })).rejects.toThrow(/requires approval/);

    const approval = engine.approveCredentialSync(plan.id);
    const run = await engine.runCredentialSync(plan.id, { dryRun: false, approval });
    expect(run.status).toBe("applied");
    expect(target.store.A).toBe("new");
  });

  it("refuses a write-only provider as a sync source", async () => {
    const source = memoryProvider("github-secrets", { A: "1" }, { readValues: false });
    const target = memoryProvider("railway", {});
    const engine = makeEngine([source, target]);
    await expect(engine.createCredentialSyncPlan({ from: { provider: "github-secrets" }, to: { provider: "railway" } })).rejects.toThrow(/cannot read values/);
  });
});

describe("CredentialEngine rollback + audit", () => {
  it("rolls back updates to the pre-image and removes newly added keys", async () => {
    const source = memoryProvider("env", { A: "new", ADDED: "fresh" });
    const target = memoryProvider("railway", { A: "original" });
    const engine = makeEngine([source, target]);

    const plan = await engine.createCredentialSyncPlan({ from: { provider: "env" }, to: { provider: "railway" } });
    const approval = engine.approveCredentialSync(plan.id);
    const run = await engine.runCredentialSync(plan.id, { dryRun: false, approval });
    expect(target.store).toEqual({ A: "new", ADDED: "fresh" });

    const rollbackPlan = await engine.rollbackCredentialSync(run.id);
    expect(rollbackPlan.rollbackOfRunId).toBe(run.id);
    const rollbackApproval = engine.approveCredentialSync(rollbackPlan.id);
    await engine.runCredentialSync(rollbackPlan.id, { dryRun: false, approval: rollbackApproval });
    expect(target.store).toEqual({ A: "original" });
  });

  it("writes audit events with fingerprints, never raw values", async () => {
    const source = memoryProvider("env", { TOKEN: "raw-token-abc" });
    const target = memoryProvider("railway", {});
    const engine = makeEngine([source, target]);

    const plan = await engine.createCredentialSyncPlan({ from: { provider: "env" }, to: { provider: "railway" } });
    const run = await engine.runCredentialSync(plan.id, { dryRun: false });
    const audit = engine.exportCredentialAudit(run.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ key: "TOKEN", action: "credentials:add", fingerprint: fingerprintValue("raw-token-abc") });
    expect(JSON.stringify(audit)).not.toContain("raw-token-abc");
  });
});
