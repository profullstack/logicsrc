import { evaluateQuery } from "./query.js";
import { createMemoryStore, type OntologyStore } from "./store.js";
import { OPENONTOLOGY_VERSION } from "./types.js";
import type {
  ChangeOperation,
  ChangeSet,
  Claim,
  Entity,
  EventType,
  OntologyEvent
} from "./types.js";

export class ChangeSetConflictError extends Error {
  readonly code = "OO-X-CONFLICT";
  constructor(
    message: string,
    readonly baseRevision: string | undefined,
    readonly currentRevision: string
  ) {
    super(message);
    this.name = "ChangeSetConflictError";
  }
}

export class ChangeSetApplyError extends Error {
  readonly code = "OO-X-APPLY";
  constructor(message: string, readonly operationIndex: number) {
    super(message);
    this.name = "ChangeSetApplyError";
  }
}

export interface ApplyContext {
  actorId: string;
  actorType?: "human" | "service" | "agent";
  now: string;
  nextId: (kind: "claim" | "event" | "entity") => string;
  requestId?: string;
  runId?: string;
  client?: string;
  /** Operations a reviewer rejected; they are skipped and reported. */
  skipOperations?: number[];
}

export interface ApplyResult {
  changeSet: ChangeSet;
  revision: string;
  events: OntologyEvent[];
  addedEntities: string[];
  addedClaims: string[];
  statusChanges: Array<{ objectId: string; status: string }>;
  skipped: number[];
}

/**
 * Apply a change set atomically.
 *
 * Every operation is validated against the current store *before* anything is
 * written, so a change set either lands whole or not at all — there is no
 * half-applied state to reason about later.
 */
export function applyChangeSet(
  store: OntologyStore,
  changeSet: ChangeSet,
  ctx: ApplyContext
): ApplyResult {
  const currentRevision = store.revision();
  if (changeSet.baseRevision && changeSet.baseRevision !== currentRevision) {
    throw new ChangeSetConflictError(
      `Change set ${changeSet.id} was authored against ${changeSet.baseRevision} but the store is at ${currentRevision}`,
      changeSet.baseRevision,
      currentRevision
    );
  }

  const skip = new Set(ctx.skipOperations ?? []);
  const planned: Array<{ index: number; op: ChangeOperation }> = changeSet.operations
    .map((op, index) => ({ op, index }))
    .filter(({ index }) => !skip.has(index));

  // ── Pre-flight: refuse the whole change set if any operation cannot apply.
  const pendingEntityIds = new Set<string>();
  for (const { op, index } of planned) {
    switch (op.op) {
      case "add-entity": {
        const id = (op.value as { id?: string }).id;
        if (!id) throw new ChangeSetApplyError("add-entity is missing value.id", index);
        if (store.getEntity(id) || pendingEntityIds.has(id)) {
          throw new ChangeSetApplyError(`add-entity ${id} already exists`, index);
        }
        pendingEntityIds.add(id);
        break;
      }
      case "update-metadata":
      case "archive-entity":
        if (!store.getEntity(op.target) && !pendingEntityIds.has(op.target)) {
          throw new ChangeSetApplyError(`${op.op} target ${op.target} does not exist`, index);
        }
        break;
      case "merge-entity":
        if (!store.getEntity(op.source) && !pendingEntityIds.has(op.source)) {
          throw new ChangeSetApplyError(`merge-entity source ${op.source} does not exist`, index);
        }
        if (!store.getEntity(op.target) && !pendingEntityIds.has(op.target)) {
          throw new ChangeSetApplyError(`merge-entity target ${op.target} does not exist`, index);
        }
        if (op.source === op.target) {
          throw new ChangeSetApplyError(`merge-entity cannot merge ${op.source} into itself`, index);
        }
        break;
      case "dispute-claim":
      case "retract-claim":
      case "supersede-claim":
        if (!store.getClaim(op.target)) {
          throw new ChangeSetApplyError(`${op.op} target claim ${op.target} does not exist`, index);
        }
        break;
      default:
        break;
    }
  }

  const events: OntologyEvent[] = [];
  const addedEntities: string[] = [];
  const addedClaims: string[] = [];
  const statusChanges: Array<{ objectId: string; status: string }> = [];

  const emit = (type: EventType, subject?: string, data?: Record<string, unknown>) => {
    const event: OntologyEvent = {
      openontology: OPENONTOLOGY_VERSION,
      kind: "Event",
      id: ctx.nextId("event"),
      type,
      ontology: changeSet.ontology,
      at: ctx.now,
      actor: ctx.actorId,
      actorType: ctx.actorType,
      client: ctx.client,
      requestId: ctx.requestId,
      runId: ctx.runId ?? changeSet.runId,
      changeSet: changeSet.id,
      subject,
      data
    };
    events.push(event);
    store.appendEvent(event);
  };

  for (const { op, index } of planned) {
    switch (op.op) {
      case "add-entity": {
        const entity = materializeEntity(op.value, ctx);
        store.addEntity(entity);
        addedEntities.push(entity.id);
        emit("entity.added", entity.id, { type: entity.type });
        break;
      }

      case "update-metadata": {
        const updated = store.updateEntityMetadata(op.target, {
          ...(op.value as Partial<Entity>),
          updatedAt: ctx.now
        });
        emit("entity.added", updated.id, { updated: Object.keys(op.value) });
        break;
      }

      case "assert-claim": {
        const claim = materializeClaim(op.value, changeSet, ctx, "asserted");
        store.appendClaim(claim);
        addedClaims.push(claim.id);
        emit("claim.asserted", claim.id, { subject: claim.subject, predicate: claim.predicate });
        break;
      }

      case "dispute-claim": {
        store.setClaimStatus({
          objectId: op.target,
          status: "disputed",
          at: ctx.now,
          by: ctx.actorId,
          changeSet: changeSet.id,
          reason: op.reason
        });
        statusChanges.push({ objectId: op.target, status: "disputed" });
        if (op.value) {
          const counter = materializeClaim(
            { ...op.value, disputes: op.target },
            changeSet,
            ctx,
            "asserted"
          );
          store.appendClaim(counter);
          addedClaims.push(counter.id);
        }
        emit("claim.disputed", op.target, { reason: op.reason });
        break;
      }

      case "retract-claim": {
        store.setClaimStatus({
          objectId: op.target,
          status: "retracted",
          at: ctx.now,
          by: ctx.actorId,
          changeSet: changeSet.id,
          reason: op.reason
        });
        statusChanges.push({ objectId: op.target, status: "retracted" });
        emit("claim.retracted", op.target, { reason: op.reason });
        break;
      }

      case "supersede-claim": {
        const replacement = materializeClaim(
          { ...op.value, supersedes: op.target },
          changeSet,
          ctx,
          "asserted"
        );
        store.appendClaim(replacement);
        addedClaims.push(replacement.id);
        store.setClaimStatus({
          objectId: op.target,
          status: "superseded",
          at: ctx.now,
          by: ctx.actorId,
          changeSet: changeSet.id,
          reason: op.reason
        });
        statusChanges.push({ objectId: op.target, status: "superseded" });
        emit("claim.superseded", op.target, { replacedBy: replacement.id });
        break;
      }

      case "merge-entity": {
        // The losing id is kept forever as a redirect (R42): old references
        // keep resolving, and the merge is reversible via a compensating set.
        store.updateEntityMetadata(op.source, { supersededBy: op.target, updatedAt: ctx.now });
        store.setEntityStatus({
          objectId: op.source,
          status: "merged",
          at: ctx.now,
          by: ctx.actorId,
          changeSet: changeSet.id,
          reason: op.reason
        });
        statusChanges.push({ objectId: op.source, status: "merged" });
        emit("entity.merged", op.source, { into: op.target, reason: op.reason });
        break;
      }

      case "archive-entity": {
        store.setEntityStatus({
          objectId: op.target,
          status: "archived",
          at: ctx.now,
          by: ctx.actorId,
          changeSet: changeSet.id,
          reason: op.reason
        });
        statusChanges.push({ objectId: op.target, status: "archived" });
        emit("entity.archived", op.target, { reason: op.reason });
        break;
      }

      case "schema-migration": {
        const schema = store.getSchema();
        const value = op.value as Record<string, unknown[]>;
        for (const section of ["entityTypes", "relationships", "properties", "constraints", "queries", "actions"] as const) {
          for (const item of value[section] ?? []) {
            (schema[section] as unknown[]).push(item);
          }
        }
        emit("schema.migrated", changeSet.id, { breaking: op.breaking === true });
        break;
      }

      default: {
        const unknown = op as { op: string };
        throw new ChangeSetApplyError(`Unsupported operation ${unknown.op}`, index);
      }
    }
  }

  const revision = store.bumpRevision();
  const applied: ChangeSet = {
    ...changeSet,
    status: "applied",
    appliedAt: ctx.now,
    appliedBy: ctx.actorId,
    resultRevision: revision
  };
  store.putChangeSet(applied);
  emit("changeset.applied", changeSet.id, { revision, operations: planned.length });

  return {
    changeSet: applied,
    revision,
    events,
    addedEntities,
    addedClaims,
    statusChanges,
    skipped: [...skip]
  };
}

function materializeEntity(value: Record<string, unknown>, ctx: ApplyContext): Entity {
  const input = value as unknown as Partial<Entity>;
  return {
    ...input,
    openontology: input.openontology ?? OPENONTOLOGY_VERSION,
    kind: "Entity",
    id: input.id ?? ctx.nextId("entity"),
    type: input.type as string,
    canonicalName: input.canonicalName as string,
    createdAt: input.createdAt ?? ctx.now,
    createdBy: input.createdBy ?? ctx.actorId
  };
}

function materializeClaim(
  value: Record<string, unknown>,
  changeSet: ChangeSet,
  ctx: ApplyContext,
  status: Claim["status"]
): Claim {
  const input = value as unknown as Partial<Claim>;
  const claim: Claim = {
    ...input,
    openontology: input.openontology ?? OPENONTOLOGY_VERSION,
    kind: "Claim",
    id: input.id ?? ctx.nextId("claim"),
    subject: input.subject as string,
    predicate: input.predicate as string,
    object: input.object as Claim["object"],
    status: input.status ?? status,
    assertedAt: input.assertedAt ?? ctx.now,
    assertedBy: input.assertedBy ?? ctx.actorId,
    changeSet: changeSet.id
  };
  if (changeSet.ontology && !claim.ontology) claim.ontology = changeSet.ontology;
  if ((changeSet.runId ?? ctx.runId) && !claim.runId) claim.runId = changeSet.runId ?? ctx.runId;
  return claim;
}

/* ── Semantic diff ─────────────────────────────────────────────────────── */

export interface SemanticDiff {
  changeSet: string;
  title: string;
  summary: {
    entitiesAdded: number;
    claimsAdded: number;
    claimsDisputed: number;
    claimsRetracted: number;
    claimsSuperseded: number;
    entitiesMerged: number;
    entitiesArchived: number;
    metadataUpdates: number;
    schemaMigrations: number;
  };
  warnings: Array<{ code: string; message: string; operationIndex?: number }>;
  affectedQueries: Array<{ id: string; before: number; after: number }>;
  requiredApprovals: number;
}

/**
 * What a reviewer sees instead of raw JSON: counts, duplicate-identity
 * warnings, and the before/after row counts of every saved query the change
 * set would move.
 */
export function diffChangeSet(
  store: OntologyStore,
  changeSet: ChangeSet,
  options: { simulate?: boolean } = {}
): SemanticDiff {
  const summary = {
    entitiesAdded: 0,
    claimsAdded: 0,
    claimsDisputed: 0,
    claimsRetracted: 0,
    claimsSuperseded: 0,
    entitiesMerged: 0,
    entitiesArchived: 0,
    metadataUpdates: 0,
    schemaMigrations: 0
  };
  const warnings: SemanticDiff["warnings"] = [];

  changeSet.operations.forEach((op, index) => {
    switch (op.op) {
      case "add-entity": {
        summary.entitiesAdded += 1;
        const value = op.value as { id?: string; canonicalName?: string; type?: string };
        if (value.canonicalName) {
          const candidates = store
            .findEntities({ text: value.canonicalName, type: value.type, limit: 3 })
            .filter((match) => match.entity.id !== value.id);
          if (candidates.length > 0) {
            warnings.push({
              code: "OO-D-POSSIBLE-DUPLICATE",
              operationIndex: index,
              message: `possible duplicate identity: ${value.canonicalName} resembles ${candidates
                .map((c) => `${c.entity.id} (${c.matchedOn}, ${c.score.toFixed(2)})`)
                .join(", ")}`
            });
          }
        }
        break;
      }
      case "assert-claim": {
        summary.claimsAdded += 1;
        const value = op.value as Partial<Claim>;
        if (!value.sources?.length && !value.firstParty) {
          warnings.push({
            code: "OO-D-NO-SOURCE",
            operationIndex: index,
            message: "claim has no source and is not marked firstParty"
          });
        }
        break;
      }
      case "dispute-claim":
        summary.claimsDisputed += 1;
        break;
      case "retract-claim":
        summary.claimsRetracted += 1;
        break;
      case "supersede-claim":
        summary.claimsSuperseded += 1;
        break;
      case "merge-entity":
        summary.entitiesMerged += 1;
        warnings.push({
          code: "OO-D-MERGE",
          operationIndex: index,
          message: `merging ${op.source} into ${op.target} is reversible only via a compensating change set`
        });
        break;
      case "archive-entity":
        summary.entitiesArchived += 1;
        break;
      case "update-metadata":
        summary.metadataUpdates += 1;
        break;
      case "schema-migration":
        summary.schemaMigrations += 1;
        if (op.breaking) {
          warnings.push({
            code: "OO-D-BREAKING",
            operationIndex: index,
            message: "breaking schema migration requires maintainer approval and a major version bump"
          });
        }
        break;
      default:
        break;
    }
  });

  const affectedQueries: SemanticDiff["affectedQueries"] = [];
  if (options.simulate !== false) {
    const savedQueries = store.getSchema().queries;
    const before = new Map<string, number>();
    for (const saved of savedQueries) {
      try {
        before.set(saved.id, evaluateQuery(store.view(), saved.query).rows.length);
      } catch {
        // A query that cannot run today cannot report a delta; skip it.
      }
    }

    // Simulate against a throwaway copy so review never mutates the store.
    const sandbox = cloneStoreForSimulation(store);
    try {
      applyChangeSet(sandbox, { ...changeSet, baseRevision: undefined }, {
        actorId: "simulation",
        now: changeSet.createdAt,
        nextId: simulationIds()
      });
      for (const saved of savedQueries) {
        if (!before.has(saved.id)) continue;
        try {
          const after = evaluateQuery(sandbox.view(), saved.query).rows.length;
          const priorCount = before.get(saved.id) as number;
          if (after !== priorCount) {
            affectedQueries.push({ id: saved.id, before: priorCount, after });
          }
        } catch {
          // ignore per-query simulation failures
        }
      }
    } catch (error) {
      warnings.push({
        code: "OO-D-SIMULATION-FAILED",
        message: `change set does not apply cleanly: ${(error as Error).message}`
      });
    }
  }

  return {
    changeSet: changeSet.id,
    title: changeSet.title,
    summary,
    warnings,
    affectedQueries,
    requiredApprovals: changeSet.requiredApprovals ?? 1
  };
}

function simulationIds(): ApplyContext["nextId"] {
  let n = 0;
  return (kind) => `sim:${kind}:${++n}`;
}

/** Deep-copy the store's data into a throwaway store so review never mutates state. */
function cloneStoreForSimulation(store: OntologyStore): OntologyStore {
  const schema = store.getSchema();
  return createMemoryStore({
    manifest: store.getManifest(),
    schema: structuredClone(schema),
    data: {
      entities: structuredClone(store.listEntities()),
      claims: structuredClone(store.listClaims({ status: ["asserted", "proposed", "disputed", "retracted", "superseded", "derived"] })),
      sources: [],
      evidence: []
    },
    files: []
  });
}
