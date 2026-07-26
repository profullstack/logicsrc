/**
 * TypeScript surface for the LogicSRC OpenOntology contracts.
 *
 * These types mirror the JSON Schemas in @logicsrc/schemas — the schemas are
 * the normative contract, these are the ergonomic view of the same objects.
 * `verifyTypesAgainstSchemas` in schema-parity.test.ts keeps the two in sync.
 */

export const OPENONTOLOGY_VERSION = "0.1";

export type Visibility = "public" | "internal" | "private";
export type ActorType = "human" | "service" | "agent";

export type ValueType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "date-time"
  | "duration"
  | "url"
  | "email"
  | "enum"
  | "object"
  | "array"
  | "binary-reference"
  | "entity-reference";

export type LanguageMap = Record<string, string>;

export interface Maintainer {
  id: string;
  name?: string;
}

export interface PackageImport {
  id: string;
  version?: string;
  digest?: string;
  namespace?: string;
  prefix?: string;
}

export interface Signature {
  algorithm: string;
  signer: string;
  value: string;
  created?: string;
  keyId?: string;
}

export interface Manifest {
  openontology: string;
  kind: "OntologyPackage";
  id: string;
  name: string;
  version: string;
  namespace: string;
  description: string;
  license: string;
  maintainers: Maintainer[];
  imports?: PackageImport[];
  schema?: Partial<Record<SchemaSection, string | object[]>>;
  data?: Partial<Record<DataSection, string | object[]>>;
  context?: string;
  digest?: string;
  signatures?: Signature[];
  extensions?: Record<string, unknown>;
}

export type SchemaSection =
  | "namespaces"
  | "entityTypes"
  | "properties"
  | "relationships"
  | "constraints"
  | "queries"
  | "actions";

export type DataSection = "entities" | "claims" | "sources" | "evidence";

export interface PropertyDefinition {
  label?: string;
  labels?: LanguageMap;
  description?: string;
  descriptions?: LanguageMap;
  type: ValueType;
  items?: { type?: ValueType; entityType?: string; enum?: unknown[] };
  entityType?: string | string[];
  required?: boolean;
  cardinality?: "one" | "many";
  unique?: boolean;
  default?: unknown;
  examples?: unknown[];
  enum?: unknown[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  deprecated?: boolean;
  deprecationNote?: string;
  extensions?: Record<string, unknown>;
}

export interface Property extends PropertyDefinition {
  openontology: string;
  kind: "Property";
  id: string;
  label: string;
}

export interface EntityType {
  openontology: string;
  kind: "EntityType";
  id: string;
  label: string;
  labels?: LanguageMap;
  description: string;
  descriptions?: LanguageMap;
  extends?: string[];
  keyProperties?: string[];
  properties?: Record<string, PropertyDefinition>;
  deprecated?: boolean;
  deprecationNote?: string;
  extensions?: Record<string, unknown>;
}

export interface RelationshipType {
  openontology: string;
  kind: "RelationshipType";
  id: string;
  label: string;
  labels?: LanguageMap;
  description: string;
  descriptions?: LanguageMap;
  from: string[];
  to: string[];
  cardinality?: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
  temporal?: boolean;
  inverse?: string;
  symmetric?: boolean;
  transitive?: boolean;
  deprecated?: boolean;
  deprecationNote?: string;
  extensions?: Record<string, unknown>;
}

export interface Namespace {
  openontology: string;
  kind: "Namespace";
  prefix: string;
  uri: string;
  description?: string;
  extensions?: Record<string, unknown>;
}

export type ConstraintRule =
  | { type: "required-predicate"; entityType: string; predicate: string }
  | { type: "cardinality"; predicate: string; entityType?: string; min?: number; max?: number }
  | { type: "unique"; predicate: string; entityType?: string; scope?: "ontology" | "entity-type" }
  | { type: "allowed-values"; predicate: string; values: unknown[] }
  | { type: "domain-range"; predicate: string; from?: string[]; to?: string[] }
  | {
      type: "temporal-bounds";
      predicate: string;
      notBefore?: string;
      notAfter?: string;
      requireValidFrom?: boolean;
    }
  | { type: "query"; query: string; expect?: "empty" | "non-empty" };

export interface Constraint {
  openontology: string;
  kind: "Constraint";
  id: string;
  description: string;
  severity?: Severity;
  code?: string;
  remediation?: string;
  rule: ConstraintRule;
  extensions?: Record<string, unknown>;
}

export interface Action {
  openontology: string;
  kind: "Action";
  id: string;
  label: string;
  description?: string;
  input?: Record<string, ActionParameter>;
  output?: Record<string, ActionParameter>;
  preconditions?: { query?: string; constraints?: string[] };
  executor: { type: "logicsrc-plugin-tool" | "mcp-tool" | "http"; plugin?: string; tool?: string; endpoint?: string };
  permissions: { required: string[] };
  approval: { mode: "none" | "policy" | "always"; approvals?: number };
  sideEffects?: string[];
  idempotencyKey?: string;
  events?: string[];
  extensions?: Record<string, unknown>;
}

export interface ActionParameter {
  type?: string;
  entityType?: string;
  required?: boolean;
  description?: string;
  default?: unknown;
}

export type EntityStatus = "active" | "archived" | "tombstone" | "superseded" | "merged";

export interface Entity {
  openontology: string;
  kind: "Entity";
  id: string;
  type: string;
  canonicalName: string;
  labels?: LanguageMap;
  aliases?: string[];
  externalIds?: Record<string, string>;
  status?: EntityStatus;
  supersededBy?: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  visibility?: Visibility;
  tags?: string[];
  extensions?: Record<string, unknown>;
}

export type ClaimStatus = "asserted" | "proposed" | "disputed" | "retracted" | "superseded" | "derived";

export type ClaimObject =
  | { entity: string }
  | { value: unknown; datatype?: Exclude<ValueType, "entity-reference">; language?: string; unit?: string };

export interface ModelProvenance {
  provider: string;
  model: string;
  modelVersion?: string;
  promptVersion?: string;
  extractedAt?: string;
  rationale?: string;
}

export interface Claim {
  openontology: string;
  kind: "Claim";
  id: string;
  ontology?: string;
  subject: string;
  predicate: string;
  object: ClaimObject;
  status: ClaimStatus;
  confidence?: number;
  validTime?: { from?: string | null; to?: string | null };
  observedAt?: string;
  assertedAt: string;
  assertedBy: string;
  runId?: string;
  sources?: string[];
  evidence?: string[];
  firstParty?: boolean;
  derivedFrom?: { rule?: string; query?: string; transformation?: string; inputs?: string[] };
  supersedes?: string;
  supersededBy?: string;
  disputes?: string;
  retractionReason?: string;
  changeSet?: string;
  license?: string;
  visibility?: Visibility;
  retention?: string;
  tags?: string[];
  model?: ModelProvenance;
  extensions?: Record<string, unknown>;
}

export interface Source {
  openontology: string;
  kind: "Source";
  id: string;
  sourceType: string;
  uri: string;
  title?: string;
  publisher?: string;
  author?: string;
  retrievedAt: string;
  publishedAt?: string;
  contentHash?: string;
  mediaType?: string;
  license?: string;
  visibility?: Visibility;
  stale?: boolean;
  lastCheckedAt?: string;
  adapter?: string;
  extensions?: Record<string, unknown>;
}

export type EvidenceSelector =
  | { type: "line-range"; start: number; end: number; path?: string }
  | { type: "page"; page: number }
  | { type: "time-range"; start: number; end: number }
  | { type: "json-pointer"; pointer: string }
  | { type: "xpath"; expression: string }
  | { type: "css-selector"; expression: string }
  | { type: "database-key"; key: string; table?: string }
  | { type: "commit-path"; path: string; commit?: string }
  | { type: "api-field"; field: string; endpoint?: string }
  | { type: "whole-document" };

export interface Evidence {
  openontology: string;
  kind: "Evidence";
  id: string;
  source: string;
  selector: EvidenceSelector;
  excerpt?: string;
  contentHash?: string;
  visibility?: Visibility;
  extensions?: Record<string, unknown>;
}

export type ChangeSetStatus =
  | "draft"
  | "proposed"
  | "approved"
  | "applied"
  | "rejected"
  | "conflicted"
  | "withdrawn";

export type ChangeOperation =
  | { op: "add-entity"; value: Record<string, unknown>; note?: string }
  | { op: "update-metadata"; target: string; value: Record<string, unknown>; note?: string }
  | { op: "assert-claim"; value: Record<string, unknown>; note?: string }
  | { op: "dispute-claim"; target: string; reason?: string; value?: Record<string, unknown>; note?: string }
  | { op: "retract-claim"; target: string; reason?: string; note?: string }
  | { op: "supersede-claim"; target: string; value: Record<string, unknown>; reason?: string; note?: string }
  | { op: "merge-entity"; source: string; target: string; reason?: string; note?: string }
  | { op: "archive-entity"; target: string; reason?: string; note?: string }
  | { op: "schema-migration"; value: Record<string, unknown>; breaking?: boolean; note?: string };

export interface ChangeSet {
  openontology: string;
  kind: "ChangeSet";
  id: string;
  ontology?: string;
  title: string;
  rationale?: string;
  createdAt: string;
  createdBy: string;
  actorType?: ActorType;
  runId?: string;
  operations: ChangeOperation[];
  requiredApprovals?: number;
  status: ChangeSetStatus;
  baseRevision?: string;
  resultRevision?: string;
  validation?: ValidationSummary;
  appliedAt?: string;
  appliedBy?: string;
  compensates?: string;
  conflictsWith?: string[];
  signatures?: Signature[];
  extensions?: Record<string, unknown>;
}

export interface ValidationSummary {
  ok?: boolean;
  errors?: number;
  warnings?: number;
  info?: number;
  policy?: number;
  validatedAt?: string;
}

export interface Review {
  openontology: string;
  kind: "Review";
  id: string;
  changeSet: string;
  reviewer: string;
  state: "commented" | "changes-requested" | "approved" | "rejected";
  comment?: string;
  createdAt: string;
  operationDecisions?: Array<{ index: number; decision: "accept" | "reject"; comment?: string }>;
  extensions?: Record<string, unknown>;
}

export interface Approval {
  openontology: string;
  kind: "Approval";
  id: string;
  changeSet: string;
  approver: string;
  approverType?: ActorType;
  scopes?: string[];
  policy?: string;
  createdAt: string;
  comment?: string;
  signature?: Signature;
  extensions?: Record<string, unknown>;
}

export type EventType =
  | "package.validated"
  | "entity.proposed"
  | "entity.added"
  | "entity.merged"
  | "entity.archived"
  | "claim.proposed"
  | "claim.asserted"
  | "claim.disputed"
  | "claim.retracted"
  | "claim.superseded"
  | "changeset.created"
  | "changeset.reviewed"
  | "changeset.approved"
  | "changeset.rejected"
  | "changeset.applied"
  | "import.completed"
  | "export.completed"
  | "constraint.violated"
  | "action.executed"
  | "schema.migrated";

export interface OntologyEvent {
  openontology: string;
  kind: "Event";
  id: string;
  type: EventType;
  ontology?: string;
  at: string;
  actor: string;
  actorType?: ActorType;
  client?: string;
  requestId?: string;
  runId?: string;
  changeSet?: string;
  subject?: string;
  revision?: string;
  policyDecision?: { rule?: string; decision?: "allow" | "deny" | "require-approval"; reason?: string };
  data?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

/* ── Query AST ────────────────────────────────────────────────────────── */

export interface TriplePattern {
  subject: string;
  predicate: string;
  object: string | { entity?: string; value?: unknown; variable?: string };
  optional?: boolean;
  bindClaim?: string;
}

export type WhereOperator =
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "in"
  | "not-in"
  | "exists"
  | "not-exists"
  | "contains"
  | "starts-with"
  | "matches"
  | "before"
  | "after";

export interface WhereClause {
  variable: string;
  field?: string;
  operator: WhereOperator;
  value?: unknown;
}

export interface QueryInclude {
  claimStatus?: ClaimStatus[];
  derived?: boolean;
  labels?: boolean;
  properties?: string[];
  visibility?: Visibility[];
}

export interface OrderBy {
  variable: string;
  field?: string;
  direction?: "asc" | "desc";
}

export interface QueryBody {
  match: TriplePattern[];
  where?: WhereClause[];
  select?: string[];
  include?: QueryInclude;
  orderBy?: OrderBy[];
  distinct?: boolean;
  asOf?: string;
  recordedAsOf?: string;
  limit?: number;
  offset?: number;
  maxDepth?: number;
}

export interface AdHocQuery extends QueryBody {
  openontologyQuery: string;
  ontology?: string;
  explain?: boolean;
}

export interface SavedQuery {
  openontology: string;
  kind: "SavedQuery";
  id: string;
  label?: string;
  description: string;
  version?: string;
  parameters?: Record<string, { type?: string; required?: boolean; default?: unknown; description?: string }>;
  expects?: { columns?: string[]; minRows?: number; maxRows?: number };
  query: QueryBody;
  extensions?: Record<string, unknown>;
}

export interface QueryRow {
  bindings: Record<string, unknown>;
  claims: string[];
}

export interface QueryExplanation {
  ontology?: string;
  asOf?: string;
  recordedAsOf?: string;
  claimStatus: ClaimStatus[];
  derivedIncluded: boolean;
  patterns: Array<{ pattern: TriplePattern; matchedClaims: string[]; bindingsAfter: number }>;
  filters: WhereClause[];
  truncated: boolean;
}

export interface QueryResult {
  columns: string[];
  rows: QueryRow[];
  explanation: QueryExplanation;
}

/* ── Validation ───────────────────────────────────────────────────────── */

export type Severity = "error" | "warning" | "info" | "policy";

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  objectId?: string;
  file?: string;
  path?: string;
  hint?: string;
}

export interface ValidationReport {
  ok: boolean;
  findings: Finding[];
  counts: Record<Severity, number>;
  checked: {
    entityTypes: number;
    relationshipTypes: number;
    entities: number;
    claims: number;
    sources: number;
    evidence: number;
    constraints: number;
    queries: number;
  };
  digest?: string;
}

/* ── Packages ─────────────────────────────────────────────────────────── */

export interface LoadedPackage {
  manifest: Manifest;
  dir?: string;
  schema: {
    namespaces: Namespace[];
    entityTypes: EntityType[];
    properties: Property[];
    relationships: RelationshipType[];
    constraints: Constraint[];
    queries: SavedQuery[];
    actions: Action[];
  };
  data: {
    entities: Entity[];
    claims: Claim[];
    sources: Source[];
    evidence: Evidence[];
  };
  context?: Record<string, unknown>;
  files: Array<{ path: string; digest: string; count: number }>;
}

export interface BuiltPackage {
  openontology: string;
  kind: "BuiltOntologyPackage";
  manifest: Manifest;
  digest: string;
  builtAt?: string;
  files: Array<{ path: string; digest: string; count: number }>;
  schema: LoadedPackage["schema"];
  data: LoadedPackage["data"];
  context?: Record<string, unknown>;
  signatures?: Signature[];
}
