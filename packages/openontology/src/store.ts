import { revisionId } from "./ids.js";
import type { KnowledgeView } from "./query.js";
import type {
  Approval,
  ChangeSet,
  Claim,
  ClaimStatus,
  Entity,
  EntityStatus,
  Evidence,
  LoadedPackage,
  Manifest,
  OntologyEvent,
  Review,
  Source
} from "./types.js";

/**
 * Append-only status transitions.
 *
 * Claims themselves are never mutated: a dispute, retraction, or supersession
 * appends an entry here and the *effective* status is the latest entry. That
 * is what makes "history is append-only" true at the contract layer while
 * still letting a query ask for the current accepted view.
 */
export interface StatusTransition {
  objectId: string;
  status: ClaimStatus | EntityStatus;
  at: string;
  by: string;
  changeSet?: string;
  reason?: string;
}

export interface EntityMatch {
  entity: Entity;
  score: number;
  matchedOn: "id" | "external-id" | "canonical-name" | "alias" | "text";
  evidence: string;
}

export interface EntityFilter {
  type?: string;
  status?: EntityStatus[];
  limit?: number;
}

export interface ClaimFilter {
  subject?: string;
  predicate?: string;
  object?: string;
  status?: ClaimStatus[];
  source?: string;
  limit?: number;
}

/**
 * The storage contract. Neo4j, a vector database, and hosted graph services
 * are all optional: an implementation only has to satisfy this interface.
 */
export interface OntologyStore {
  getManifest(): Manifest;
  getSchema(): LoadedPackage["schema"];

  getEntity(id: string): Entity | undefined;
  listEntities(filter?: EntityFilter): Entity[];
  findEntities(input: { text?: string; type?: string; externalId?: Record<string, string>; limit?: number }): EntityMatch[];
  addEntity(entity: Entity): void;
  updateEntityMetadata(id: string, patch: Partial<Entity>): Entity;
  setEntityStatus(transition: StatusTransition): void;
  resolveEntityId(id: string): string;

  getClaim(id: string): Claim | undefined;
  listClaims(filter?: ClaimFilter): Claim[];
  appendClaim(claim: Claim): void;
  setClaimStatus(transition: StatusTransition): void;
  claimHistory(id: string): StatusTransition[];

  getSource(id: string): Source | undefined;
  getEvidence(id: string): Evidence | undefined;
  listSources(): Source[];
  listEvidence(): Evidence[];
  addSource(source: Source): void;
  addEvidence(evidence: Evidence): void;

  putChangeSet(changeSet: ChangeSet): void;
  getChangeSet(id: string): ChangeSet | undefined;
  listChangeSets(filter?: { status?: ChangeSet["status"][] }): ChangeSet[];
  putReview(review: Review): void;
  listReviews(changeSetId: string): Review[];
  putApproval(approval: Approval): void;
  listApprovals(changeSetId: string): Approval[];

  appendEvent(event: OntologyEvent): void;
  listEvents(filter?: { type?: string[]; changeSet?: string; limit?: number }): OntologyEvent[];

  revision(): string;
  bumpRevision(): string;

  /** Read model for the query evaluator, with effective statuses applied. */
  view(): KnowledgeView;
}

export function createMemoryStore(pkg: LoadedPackage): OntologyStore {
  const manifest = pkg.manifest;
  const schema = pkg.schema;

  const entities = new Map<string, Entity>(pkg.data.entities.map((e) => [e.id, e]));
  const claims = new Map<string, Claim>(pkg.data.claims.map((c) => [c.id, c]));
  const sources = new Map<string, Source>(pkg.data.sources.map((s) => [s.id, s]));
  const evidence = new Map<string, Evidence>(pkg.data.evidence.map((e) => [e.id, e]));

  const claimStatusLog: StatusTransition[] = [];
  const entityStatusLog: StatusTransition[] = [];
  const redirects = new Map<string, string>();
  const changeSets = new Map<string, ChangeSet>();
  const reviews: Review[] = [];
  const approvals: Approval[] = [];
  const events: OntologyEvent[] = [];

  let revisionCounter = 0;

  // Seed redirects from any merges already recorded in the package data.
  for (const entity of entities.values()) {
    if (entity.supersededBy) redirects.set(entity.id, entity.supersededBy);
  }

  const effectiveClaimStatus = (claim: Claim): ClaimStatus => {
    let status = claim.status;
    for (const t of claimStatusLog) {
      if (t.objectId === claim.id) status = t.status as ClaimStatus;
    }
    return status;
  };

  const effectiveEntityStatus = (entity: Entity): EntityStatus => {
    let status = entity.status ?? "active";
    for (const t of entityStatusLog) {
      if (t.objectId === entity.id) status = t.status as EntityStatus;
    }
    return status;
  };

  const resolveEntityId = (id: string): string => {
    let current = id;
    const seenIds = new Set<string>();
    while (redirects.has(current)) {
      if (seenIds.has(current)) break; // defensive: never loop on a cyclic merge
      seenIds.add(current);
      current = redirects.get(current) as string;
    }
    return current;
  };

  const currentClaims = (): Claim[] =>
    [...claims.values()].map((claim) => {
      const status = effectiveClaimStatus(claim);
      return status === claim.status ? claim : { ...claim, status };
    });

  const currentEntities = (): Entity[] =>
    [...entities.values()].map((entity) => {
      const status = effectiveEntityStatus(entity);
      return status === (entity.status ?? "active") ? entity : { ...entity, status };
    });

  return {
    getManifest: () => manifest,
    getSchema: () => schema,

    getEntity(id) {
      const resolved = resolveEntityId(id);
      const entity = entities.get(resolved);
      if (!entity) return undefined;
      const status = effectiveEntityStatus(entity);
      return status === (entity.status ?? "active") ? entity : { ...entity, status };
    },

    listEntities(filter = {}) {
      let out = currentEntities();
      if (filter.type) out = out.filter((e) => e.type === filter.type);
      if (filter.status) out = out.filter((e) => filter.status?.includes(e.status ?? "active"));
      return filter.limit ? out.slice(0, filter.limit) : out;
    },

    findEntities({ text, type, externalId, limit = 20 }) {
      const matches: EntityMatch[] = [];
      const needle = text?.toLowerCase().trim();

      for (const entity of currentEntities()) {
        if (type && entity.type !== type) continue;

        if (externalId) {
          for (const [ns, value] of Object.entries(externalId)) {
            if (entity.externalIds?.[ns] === value) {
              matches.push({
                entity,
                score: 1,
                matchedOn: "external-id",
                evidence: `externalIds.${ns} = ${value}`
              });
            }
          }
        }

        if (!needle) continue;
        if (entity.id.toLowerCase() === needle) {
          matches.push({ entity, score: 1, matchedOn: "id", evidence: entity.id });
        } else if (entity.canonicalName.toLowerCase() === needle) {
          matches.push({ entity, score: 0.95, matchedOn: "canonical-name", evidence: entity.canonicalName });
        } else if (entity.aliases?.some((a) => a.toLowerCase() === needle)) {
          matches.push({ entity, score: 0.85, matchedOn: "alias", evidence: `alias ${needle}` });
        } else if (entity.canonicalName.toLowerCase().includes(needle)) {
          matches.push({ entity, score: 0.5, matchedOn: "text", evidence: entity.canonicalName });
        }
      }

      // Ranked candidates with evidence — never a silent single match (R45).
      const deduped = new Map<string, EntityMatch>();
      for (const match of matches) {
        const existing = deduped.get(match.entity.id);
        if (!existing || existing.score < match.score) deduped.set(match.entity.id, match);
      }
      return [...deduped.values()].sort((a, b) => b.score - a.score).slice(0, limit);
    },

    addEntity(entity) {
      if (entities.has(entity.id)) throw new Error(`Entity ${entity.id} already exists`);
      entities.set(entity.id, entity);
    },

    updateEntityMetadata(id, patch) {
      const existing = entities.get(resolveEntityId(id));
      if (!existing) throw new Error(`Unknown entity ${id}`);
      // Identity-bearing fields are not patchable: ids are stable by contract.
      const { id: _id, type: _type, createdAt: _createdAt, createdBy: _createdBy, ...safe } = patch;
      const updated = { ...existing, ...safe };
      entities.set(existing.id, updated);
      return updated;
    },

    setEntityStatus(transition) {
      entityStatusLog.push(transition);
      if (transition.status === "merged") {
        const entity = entities.get(transition.objectId);
        if (entity?.supersededBy) redirects.set(entity.id, entity.supersededBy);
      }
    },

    resolveEntityId,

    getClaim(id) {
      const claim = claims.get(id);
      if (!claim) return undefined;
      const status = effectiveClaimStatus(claim);
      return status === claim.status ? claim : { ...claim, status };
    },

    listClaims(filter = {}) {
      let out = currentClaims();
      if (filter.subject) {
        const subject = resolveEntityId(filter.subject);
        out = out.filter((c) => resolveEntityId(c.subject) === subject);
      }
      if (filter.predicate) out = out.filter((c) => c.predicate === filter.predicate);
      if (filter.object) {
        out = out.filter((c) => "entity" in c.object && resolveEntityId(c.object.entity) === resolveEntityId(filter.object as string));
      }
      if (filter.status) out = out.filter((c) => filter.status?.includes(c.status));
      if (filter.source) out = out.filter((c) => c.sources?.includes(filter.source as string));
      return filter.limit ? out.slice(0, filter.limit) : out;
    },

    appendClaim(claim) {
      if (claims.has(claim.id)) throw new Error(`Claim ${claim.id} already exists`);
      claims.set(claim.id, claim);
    },

    setClaimStatus(transition) {
      if (!claims.has(transition.objectId)) throw new Error(`Unknown claim ${transition.objectId}`);
      claimStatusLog.push(transition);
    },

    claimHistory(id) {
      const claim = claims.get(id);
      if (!claim) return [];
      return [
        { objectId: id, status: claim.status, at: claim.assertedAt, by: claim.assertedBy, changeSet: claim.changeSet },
        ...claimStatusLog.filter((t) => t.objectId === id)
      ];
    },

    getSource: (id) => sources.get(id),
    getEvidence: (id) => evidence.get(id),
    listSources: () => [...sources.values()],
    listEvidence: () => [...evidence.values()],
    addSource: (source) => void sources.set(source.id, source),
    addEvidence: (record) => void evidence.set(record.id, record),

    putChangeSet: (changeSet) => void changeSets.set(changeSet.id, changeSet),
    getChangeSet: (id) => changeSets.get(id),
    listChangeSets(filter = {}) {
      const out = [...changeSets.values()];
      return filter.status ? out.filter((c) => filter.status?.includes(c.status)) : out;
    },
    putReview: (review) => void reviews.push(review),
    listReviews: (changeSetId) => reviews.filter((r) => r.changeSet === changeSetId),
    putApproval: (approval) => void approvals.push(approval),
    listApprovals: (changeSetId) => approvals.filter((a) => a.changeSet === changeSetId),

    appendEvent: (event) => void events.push(event),
    listEvents(filter = {}) {
      let out = events;
      if (filter.type) out = out.filter((e) => filter.type?.includes(e.type));
      if (filter.changeSet) out = out.filter((e) => e.changeSet === filter.changeSet);
      return filter.limit ? out.slice(-filter.limit) : [...out];
    },

    revision: () => revisionId("data", revisionCounter),
    bumpRevision: () => revisionId("data", ++revisionCounter),

    view(): KnowledgeView {
      return {
        entities: new Map(currentEntities().map((e) => [e.id, e])),
        claims: currentClaims(),
        relationships: new Map(schema.relationships.map((r) => [r.id, r])),
        properties: new Map(schema.properties.map((p) => [p.id, p])),
        resolveEntityId
      };
    }
  };
}
