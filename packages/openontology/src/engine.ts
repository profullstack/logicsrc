import { applyChangeSet, diffChangeSet, type ApplyResult, type SemanticDiff } from "./changeset.js";
import { canonicalObject } from "./canonical.js";
import { createIdFactory } from "./ids.js";
import { exportJsonLd, importJsonLd, packagePrefix, type JsonLdExport } from "./jsonld.js";
import { buildOntologyPackage, loadOntologyPackage, type LoadInput } from "./package.js";
import { evaluatePolicy, localActor, type Actor, type PolicyDecision, type PolicyOptions } from "./policy.js";
import { evaluateQuery, type KnowledgeView, type QueryLimits } from "./query.js";
import { createMemoryStore, type EntityMatch, type OntologyStore } from "./store.js";
import { renderReport, validateOntologyPackage, type ValidateOptions } from "./validate.js";
import { OPENONTOLOGY_VERSION } from "./types.js";
import type {
  Approval,
  BuiltPackage,
  ChangeOperation,
  ChangeSet,
  Claim,
  Entity,
  Evidence,
  LoadedPackage,
  OntologyEvent,
  QueryBody,
  QueryResult,
  Review,
  SavedQuery,
  Source,
  ValidationReport
} from "./types.js";

export class OntologyPermissionError extends Error {
  readonly code = "OO-A-DENIED";
  constructor(message: string, readonly decision: PolicyDecision) {
    super(message);
    this.name = "OntologyPermissionError";
  }
}

export class OntologyApprovalError extends Error {
  readonly code = "OO-A-APPROVAL-REQUIRED";
  constructor(message: string, readonly decision: PolicyDecision, readonly have: number) {
    super(message);
    this.name = "OntologyApprovalError";
  }
}

export class OntologyNotFoundError extends Error {
  readonly code = "OO-A-NOT-FOUND";
  constructor(message: string) {
    super(message);
    this.name = "OntologyNotFoundError";
  }
}

export interface EngineOptions {
  /** A loaded package, a directory, or a pre-built store. */
  package?: LoadedPackage | string | LoadInput;
  store?: OntologyStore;
  actor?: Actor;
  policy?: PolicyOptions;
  limits?: Partial<QueryLimits>;
  /** Injected for determinism: tests and conformance runs pin both. */
  clock?: () => string;
  idFactory?: (kind: "claim" | "event" | "entity" | "changeset" | "review" | "approval") => string;
  client?: string;
  requestId?: string;
}

export interface ExplainedClaim {
  claim: Claim;
  sources: Source[];
  evidence: Evidence[];
  history: Array<{ status: string; at: string; by: string; reason?: string }>;
}

export interface Explanation {
  resultId: string;
  ontology: string;
  row: number;
  bindings: Record<string, unknown>;
  claims: ExplainedClaim[];
  filters: QueryResult["explanation"]["filters"];
  claimStatus: QueryResult["explanation"]["claimStatus"];
  asOf?: string;
}

export interface OntologyEngine {
  readonly store: OntologyStore;
  readonly actor: Actor;

  getOntologyManifest(): LoadedPackage["manifest"];
  getOntologySchema(): LoadedPackage["schema"];

  getEntity(id: string): Entity;
  findEntities(input: { text?: string; type?: string; externalId?: Record<string, string>; limit?: number }): EntityMatch[];
  getClaim(id: string): Claim;
  claimHistory(id: string): ReturnType<OntologyStore["claimHistory"]>;

  queryOntology(query: QueryBody | SavedQuery | string, params?: Record<string, unknown>): QueryResult & { id: string };
  explainOntologyResult(resultId: string, row?: number): Explanation;

  createOntologyChangeSet(input: {
    title: string;
    rationale?: string;
    operations: ChangeOperation[];
    requiredApprovals?: number;
    runId?: string;
  }): ChangeSet;
  validateOntologyChangeSet(id: string): ValidationReport;
  diffOntologyChangeSet(id: string): SemanticDiff;
  reviewOntologyChangeSet(id: string, review: { state: Review["state"]; comment?: string; operationDecisions?: Review["operationDecisions"] }): Review;
  approveOntologyChangeSet(id: string, approval?: { comment?: string }): Approval;
  rejectOntologyChangeSet(id: string, comment?: string): ChangeSet;
  applyOntologyChangeSet(id: string, options?: { skipRejectedOperations?: boolean }): ApplyResult;

  validateOntologyPackage(options?: ValidateOptions): ValidationReport;
  buildOntologyPackage(): BuiltPackage;
  exportOntology(format: "json" | "jsonld"): { format: string; document: unknown; lossy: JsonLdExport["lossy"] };
  importOntology(input: { format: "jsonld"; document: Record<string, unknown> }): { entities: number; claims: number; operations: ChangeOperation[] };

  subscribeOntologyEvents(listener: (event: OntologyEvent) => void, filter?: { type?: string[] }): () => void;
  listEvents(filter?: { type?: string[]; changeSet?: string; limit?: number }): OntologyEvent[];

  view(): KnowledgeView;
}

export function createOntologyEngine(options: EngineOptions = {}): OntologyEngine {
  const loaded: LoadedPackage | undefined = options.store
    ? undefined
    : normalizePackage(options.package);

  const store =
    options.store ??
    createMemoryStore(
      loaded ?? {
        manifest: {
          openontology: OPENONTOLOGY_VERSION,
          kind: "OntologyPackage",
          id: "untitled",
          name: "Untitled ontology",
          version: "0.0.0",
          namespace: "https://logicsrc.com/ontology/untitled/",
          description: "In-memory ontology",
          license: "unknown",
          maintainers: [{ id: "urn:logicsrc:anonymous" }]
        },
        schema: {
          namespaces: [],
          entityTypes: [],
          properties: [],
          relationships: [],
          constraints: [],
          queries: [],
          actions: []
        },
        data: { entities: [], claims: [], sources: [], evidence: [] },
        files: []
      }
    );

  const actor = options.actor ?? localActor();
  const clock = options.clock ?? (() => new Date().toISOString());
  const counters = new Map<string, () => string>();
  const idFactory =
    options.idFactory ??
    ((kind: string) => {
      if (!counters.has(kind)) counters.set(kind, createIdFactory(kind));
      return (counters.get(kind) as () => string)();
    });

  const results = new Map<string, QueryResult>();
  const listeners = new Set<{ fn: (event: OntologyEvent) => void; types?: string[] }>();

  const baseAppendEvent = store.appendEvent.bind(store);
  store.appendEvent = (event: OntologyEvent) => {
    baseAppendEvent(event);
    for (const listener of listeners) {
      if (listener.types && !listener.types.includes(event.type)) continue;
      listener.fn(event);
    }
  };

  const requirePolicy = (operation: Parameters<typeof evaluatePolicy>[0]): PolicyDecision => {
    const decision = evaluatePolicy(operation, actor, options.policy);
    if (decision.decision === "deny") {
      throw new OntologyPermissionError(
        `${decision.reason}${decision.missingScopes.length ? ` (missing: ${decision.missingScopes.join(", ")})` : ""}`,
        decision
      );
    }
    return decision;
  };

  const emit = (
    type: OntologyEvent["type"],
    subject?: string,
    data?: Record<string, unknown>,
    decision?: PolicyDecision,
    changeSetId?: string
  ) => {
    const event: OntologyEvent = {
      openontology: OPENONTOLOGY_VERSION,
      kind: "Event",
      id: idFactory("event"),
      type,
      ontology: store.getManifest().id,
      at: clock(),
      actor: actor.id,
      actorType: actor.type,
      client: options.client ?? actor.client,
      requestId: options.requestId,
      subject,
      ...(changeSetId ? { changeSet: changeSetId } : {}),
      revision: store.revision(),
      ...(decision
        ? { policyDecision: { rule: decision.rule, decision: decision.decision, reason: decision.reason } }
        : {}),
      ...(data ? { data } : {})
    };
    store.appendEvent(event);
    return event;
  };

  const resolveQuery = (query: QueryBody | SavedQuery | string, params?: Record<string, unknown>): QueryBody => {
    if (typeof query === "string") {
      const saved = store.getSchema().queries.find((q) => q.id === query);
      if (!saved) throw new OntologyNotFoundError(`Unknown saved query ${query}`);
      return bindParameters(saved, params);
    }
    if ("kind" in query && query.kind === "SavedQuery") return bindParameters(query, params);
    return query as QueryBody;
  };

  return {
    store,
    actor,

    getOntologyManifest: () => store.getManifest(),
    getOntologySchema: () => store.getSchema(),

    getEntity(id) {
      requirePolicy({ kind: "read" });
      const entity = store.getEntity(id);
      if (!entity) throw new OntologyNotFoundError(`Unknown entity ${id}`);
      return entity;
    },

    findEntities(input) {
      requirePolicy({ kind: "read" });
      return store.findEntities(input);
    },

    getClaim(id) {
      requirePolicy({ kind: "read" });
      const claim = store.getClaim(id);
      if (!claim) throw new OntologyNotFoundError(`Unknown claim ${id}`);
      return claim;
    },

    claimHistory(id) {
      requirePolicy({ kind: "read" });
      return store.claimHistory(id);
    },

    queryOntology(query, params) {
      requirePolicy({ kind: "query" });
      const body = resolveQuery(query, params);
      const result = evaluateQuery(store.view(), body, options.limits);
      const id = idFactory("event");
      results.set(id, result);
      return { ...result, id };
    },

    explainOntologyResult(resultId, row = 0) {
      requirePolicy({ kind: "read" });
      const result = results.get(resultId);
      if (!result) throw new OntologyNotFoundError(`Unknown query result ${resultId}`);
      const target = result.rows[row];
      if (!target) throw new OntologyNotFoundError(`Result ${resultId} has no row ${row}`);

      const claims: ExplainedClaim[] = target.claims.map((claimId) => {
        const claim = store.getClaim(claimId);
        if (!claim) throw new OntologyNotFoundError(`Unknown claim ${claimId}`);
        return {
          claim,
          sources: (claim.sources ?? []).map((s) => store.getSource(s)).filter(Boolean) as Source[],
          evidence: (claim.evidence ?? []).map((e) => store.getEvidence(e)).filter(Boolean) as Evidence[],
          history: store.claimHistory(claimId).map((t) => ({
            status: String(t.status),
            at: t.at,
            by: t.by,
            reason: t.reason
          }))
        };
      });

      return {
        resultId,
        ontology: `${store.getManifest().id}@${store.getManifest().version}`,
        row,
        bindings: target.bindings,
        claims,
        filters: result.explanation.filters,
        claimStatus: result.explanation.claimStatus,
        asOf: result.explanation.asOf
      };
    },

    createOntologyChangeSet(input) {
      const decision = requirePolicy({ kind: "propose" });
      const changeSet: ChangeSet = {
        openontology: OPENONTOLOGY_VERSION,
        kind: "ChangeSet",
        id: idFactory("changeset"),
        ontology: `${store.getManifest().id}@${store.getManifest().version}`,
        title: input.title,
        rationale: input.rationale,
        createdAt: clock(),
        createdBy: actor.id,
        actorType: actor.type,
        runId: input.runId,
        operations: canonicalObject(input.operations),
        requiredApprovals: input.requiredApprovals ?? (actor.type === "agent" ? 1 : 0),
        // R92: anything an agent creates starts as a proposal, never applied.
        status: "proposed",
        baseRevision: store.revision()
      };
      store.putChangeSet(changeSet);
      emit("changeset.created", changeSet.id, { operations: changeSet.operations.length }, decision, changeSet.id);
      return changeSet;
    },

    validateOntologyChangeSet(id) {
      requirePolicy({ kind: "read" });
      const changeSet = mustGetChangeSet(store, id);
      // Validate the package as it would look after the change set applies.
      const preview = previewPackage(store, changeSet, clock());
      return validateOntologyPackage(preview);
    },

    diffOntologyChangeSet(id) {
      requirePolicy({ kind: "read" });
      return diffChangeSet(store, mustGetChangeSet(store, id));
    },

    reviewOntologyChangeSet(id, input) {
      const decision = requirePolicy({ kind: "review" });
      const changeSet = mustGetChangeSet(store, id);
      const review: Review = {
        openontology: OPENONTOLOGY_VERSION,
        kind: "Review",
        id: idFactory("review"),
        changeSet: changeSet.id,
        reviewer: actor.id,
        state: input.state,
        comment: input.comment,
        createdAt: clock(),
        operationDecisions: input.operationDecisions
      };
      store.putReview(review);
      emit("changeset.reviewed", changeSet.id, { state: review.state }, decision, changeSet.id);
      return review;
    },

    approveOntologyChangeSet(id, input) {
      const decision = requirePolicy({ kind: "approve" });
      const changeSet = mustGetChangeSet(store, id);
      const approval: Approval = {
        openontology: OPENONTOLOGY_VERSION,
        kind: "Approval",
        id: idFactory("approval"),
        changeSet: changeSet.id,
        approver: actor.id,
        approverType: actor.type,
        scopes: actor.scopes,
        createdAt: clock(),
        comment: input?.comment
      };
      store.putApproval(approval);
      store.putChangeSet({ ...changeSet, status: "approved" });
      emit("changeset.approved", changeSet.id, undefined, decision, changeSet.id);
      return approval;
    },

    rejectOntologyChangeSet(id, comment) {
      const decision = requirePolicy({ kind: "review" });
      const changeSet = mustGetChangeSet(store, id);
      const rejected: ChangeSet = { ...changeSet, status: "rejected" };
      store.putChangeSet(rejected);
      store.putReview({
        openontology: OPENONTOLOGY_VERSION,
        kind: "Review",
        id: idFactory("review"),
        changeSet: changeSet.id,
        reviewer: actor.id,
        state: "rejected",
        comment,
        createdAt: clock()
      });
      emit("changeset.rejected", changeSet.id, { comment }, decision, changeSet.id);
      return rejected;
    },

    applyOntologyChangeSet(id, applyOptions) {
      const changeSet = mustGetChangeSet(store, id);
      const decision = requirePolicy({ kind: "apply", changeSet });

      if (decision.decision === "require-approval") {
        const approvals = store.listApprovals(changeSet.id).length;
        if (approvals < decision.requiredApprovals) {
          // R107: unattended/--yolo does not reach this branch differently.
          throw new OntologyApprovalError(
            `${decision.reason}: ${approvals}/${decision.requiredApprovals} approvals recorded`,
            decision,
            approvals
          );
        }
      }

      const rejectedOps = applyOptions?.skipRejectedOperations
        ? store
            .listReviews(changeSet.id)
            .flatMap((review) => review.operationDecisions ?? [])
            .filter((d) => d.decision === "reject")
            .map((d) => d.index)
        : [];

      return applyChangeSet(store, changeSet, {
        actorId: actor.id,
        actorType: actor.type,
        now: clock(),
        nextId: (kind) => idFactory(kind),
        requestId: options.requestId,
        client: options.client ?? actor.client,
        skipOperations: rejectedOps
      });
    },

    validateOntologyPackage(validateOptions) {
      requirePolicy({ kind: "read" });
      const report = validateOntologyPackage(currentPackage(store), validateOptions);
      emit("package.validated", store.getManifest().id, {
        ok: report.ok,
        errors: report.counts.error,
        warnings: report.counts.warning
      });
      return report;
    },

    buildOntologyPackage() {
      requirePolicy({ kind: "read" });
      return buildOntologyPackage(currentPackage(store));
    },

    exportOntology(format) {
      requirePolicy({ kind: "read" });
      const pkg = currentPackage(store);
      if (format === "jsonld") {
        const exported = exportJsonLd(pkg);
        emit("export.completed", store.getManifest().id, { format, lossy: exported.lossy.length });
        return { format, document: exported.document, lossy: exported.lossy };
      }
      emit("export.completed", store.getManifest().id, { format, lossy: 0 });
      return { format, document: buildOntologyPackage(pkg), lossy: [] };
    },

    importOntology(input) {
      const decision = requirePolicy({ kind: "propose" });
      const manifest = store.getManifest();
      const { entities, claims } = importJsonLd(input.document, {
        ...manifest,
        prefix: packagePrefix(currentPackage(store))
      });

      // R113: an import proposes; it never silently becomes application state.
      const operations: ChangeOperation[] = [
        ...entities
          .filter((entity) => !store.getEntity(entity.id))
          .map((entity) => ({ op: "add-entity" as const, value: entity as unknown as Record<string, unknown> })),
        ...claims
          .filter((claim) => !store.getClaim(claim.id))
          .map((claim) => ({ op: "assert-claim" as const, value: claim as unknown as Record<string, unknown> }))
      ];

      emit("import.completed", manifest.id, { entities: entities.length, claims: claims.length }, decision);
      return { entities: entities.length, claims: claims.length, operations };
    },

    subscribeOntologyEvents(listener, filter) {
      const entry = { fn: listener, types: filter?.type };
      listeners.add(entry);
      return () => void listeners.delete(entry);
    },

    listEvents: (filter) => store.listEvents(filter),
    view: () => store.view()
  };
}

function normalizePackage(input: EngineOptions["package"]): LoadedPackage | undefined {
  if (!input) return undefined;
  if (typeof input === "string") return loadOntologyPackage(input);
  if ("manifest" in input && "schema" in input && "data" in input && "files" in input) {
    return input as LoadedPackage;
  }
  return loadOntologyPackage(input as LoadInput);
}

function currentPackage(store: OntologyStore): LoadedPackage {
  return {
    manifest: store.getManifest(),
    schema: store.getSchema(),
    data: {
      entities: store.listEntities(),
      claims: store.listClaims({
        status: ["asserted", "proposed", "disputed", "retracted", "superseded", "derived"]
      }),
      sources: store.listSources(),
      evidence: store.listEvidence()
    },
    files: []
  };
}

function previewPackage(store: OntologyStore, changeSet: ChangeSet, now: string): LoadedPackage {
  const pkg = currentPackage(store);
  const entities = [...pkg.data.entities];
  const claims = [...pkg.data.claims];
  let n = 0;

  for (const op of changeSet.operations) {
    if (op.op === "add-entity") {
      const input = op.value as unknown as Partial<Entity>;
      entities.push({
        ...input,
        openontology: input.openontology ?? OPENONTOLOGY_VERSION,
        kind: "Entity",
        id: input.id as string,
        type: input.type as string,
        canonicalName: input.canonicalName as string,
        createdAt: input.createdAt ?? now,
        createdBy: input.createdBy ?? changeSet.createdBy
      });
    }
    if (op.op === "assert-claim") {
      const input = op.value as unknown as Partial<Claim>;
      claims.push({
        ...input,
        openontology: input.openontology ?? OPENONTOLOGY_VERSION,
        kind: "Claim",
        id: input.id ?? `preview:claim:${++n}`,
        subject: input.subject as string,
        predicate: input.predicate as string,
        object: input.object as Claim["object"],
        status: input.status ?? "asserted",
        assertedAt: input.assertedAt ?? now,
        assertedBy: input.assertedBy ?? changeSet.createdBy
      });
    }
  }

  return { ...pkg, data: { ...pkg.data, entities, claims } };
}

function mustGetChangeSet(store: OntologyStore, id: string): ChangeSet {
  const changeSet = store.getChangeSet(id);
  if (!changeSet) throw new OntologyNotFoundError(`Unknown change set ${id}`);
  return changeSet;
}

function bindParameters(saved: SavedQuery, params?: Record<string, unknown>): QueryBody {
  if (!params || Object.keys(params).length === 0) return saved.query;

  const substitute = (value: unknown): unknown => {
    if (typeof value === "string" && value.startsWith("$")) {
      const key = value.slice(1);
      return key in params ? params[key] : value;
    }
    if (Array.isArray(value)) return value.map(substitute);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v)]));
    }
    return value;
  };

  return substitute(saved.query) as QueryBody;
}

export { renderReport };
