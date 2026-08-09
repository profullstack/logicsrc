/**
 * Core OpenContext types.
 *
 * These mirror the published JSON Schemas under
 * `https://logicsrc.com/schemas/opencontext/`. The schemas are normative; these
 * types are the TypeScript projection of them.
 */

export const LAYERS = ["L0", "L1", "L2", "L3", "L4", "L5"] as const;
export type Layer = (typeof LAYERS)[number];

export const AUTHORITIES = ["canonical", "approved", "reference", "observed", "inferred", "historical"] as const;
export type Authority = (typeof AUTHORITIES)[number];

export const TRUST_LEVELS = ["trusted", "verified", "untrusted"] as const;
export type Trust = (typeof TRUST_LEVELS)[number];

export const DURABILITIES = ["ephemeral", "session", "operational", "long-lived", "permanent"] as const;
export type Durability = (typeof DURABILITIES)[number];

export const CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const OBJECT_STATUSES = ["draft", "pending", "approved", "rejected", "retired"] as const;
export type ObjectStatus = (typeof OBJECT_STATUSES)[number];

/** Computed against a timestamp — never stored on the object itself. */
export const LIFECYCLE_STATES = ["future", "current", "stale", "expired", "superseded"] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export const SEVERITIES = ["info", "warning", "error"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const TIE_BREAKERS = ["version", "updated", "created", "confidence", "id"] as const;
export type TieBreaker = (typeof TIE_BREAKERS)[number];

export interface Source {
  uri: string;
  type?: string;
  retrieved_at?: string;
  digest?: string;
  label?: string;
  trust?: Trust;
  author?: string;
  extensions?: Record<string, unknown>;
}

export interface Redaction {
  path: string;
  mode?: "remove" | "mask" | "hash";
  replacement?: string;
  reason?: string;
}

export interface Approver {
  role?: string;
  id?: string;
  at?: string;
}

export interface Approval {
  required?: boolean;
  roles?: string[];
  minimum?: number;
  approved_by?: Approver[];
}

export interface Review {
  interval?: string;
  required_approvers?: number;
  next_review?: string;
  last_review?: string;
}

export interface ObjectPermissions {
  read?: string[];
  write?: string[];
  deny?: string[];
}

export interface ContextObject {
  id: string;
  type: string;
  layer?: Layer;
  title?: string;
  summary?: string;
  content?: unknown;
  content_type?: string;
  content_uri?: string;
  authority?: Authority;
  trust?: Trust;
  owner?: string;
  status?: ObjectStatus;
  version?: number;
  created?: string;
  updated?: string;
  valid_from?: string;
  expires?: string | null;
  ttl?: string;
  durability?: Durability;
  classification?: Classification;
  permissions?: ObjectPermissions;
  redact?: Redaction[];
  sources?: Source[];
  canonical_source?: boolean;
  supersedes?: string[];
  superseded_by?: string;
  conflicts_with?: string[];
  references?: string[];
  depends_on?: string[];
  applies_to?: string[];
  confidence?: number;
  tags?: string[];
  approval?: Approval;
  review?: Review;
  language?: string;
  extensions?: Record<string, unknown>;
  /** Decision records carry these in addition to the object fields. */
  decision?: string;
  rationale?: string | string[];
  consequences?: string | string[];
  alternatives?: Array<{ option: string; rejected_because?: string }>;
  approved_by?: Approver[];
  decided_by?: { type?: string; id?: string };
  bundle?: { bundle_id?: string; digest?: string; generated_at?: string; uri?: string };
}

export interface RoleDefinition {
  id?: string;
  description?: string;
  include?: string[];
  exclude?: string[];
  permissions?: string[];
  max_classification?: Classification;
  redact?: Redaction[];
  inherits?: string[];
  extensions?: Record<string, unknown>;
}

export interface CollectionSpec {
  source: string;
  type?: string;
  layer?: Layer;
  authority?: Authority;
  classification?: Classification;
  durability?: Durability;
  trust?: Trust;
  owner?: string;
  ttl?: string;
}

export interface AdapterConfig {
  enabled?: boolean;
  package?: string;
  offline?: boolean;
  trust?: Trust;
  timeout_ms?: number;
  [key: string]: unknown;
}

export interface Manifest {
  opencontext: string;
  id: string;
  name?: string;
  description?: string;
  context?: Record<string, string>;
  collections?: Record<string, string | CollectionSpec>;
  roles?: Record<string, RoleDefinition>;
  agents?: Record<string, { roles: string[]; description?: string; extensions?: Record<string, unknown> }>;
  authority?: { precedence?: Authority[]; tie_breakers?: TieBreaker[] };
  freshness?: { default_ttl?: string; stale_is_error?: boolean; exclude_expired?: boolean };
  provenance?: { required?: boolean; digest?: "sha256"; require_digest?: boolean };
  audit?: {
    context_reads?: boolean;
    context_writes?: boolean;
    decisions?: boolean;
    conflicts?: boolean;
    sink?: string;
  };
  redact?: Redaction[];
  review?: Review;
  adapters?: Record<string, AdapterConfig>;
  defaults?: {
    layer?: Layer;
    authority?: Authority;
    classification?: Classification;
    durability?: Durability;
    trust?: Trust;
    owner?: string;
    ttl?: string;
  };
  health?: {
    minimum_score?: number;
    weights?: Record<string, number>;
    fail_on?: Severity;
    require_owner?: boolean;
  };
  related?: { prd?: string; topology?: string; ontology?: string };
  extensions?: Record<string, unknown>;
}

/** An object as loaded, with where it came from kept alongside it. */
export interface LoadedObject {
  /** Normalized: manifest and collection defaults applied. */
  object: ContextObject;
  /** Exactly as authored, before defaults. Doctor reports against this. */
  raw: ContextObject;
  /** Path relative to the manifest directory, when loaded from a file. */
  file?: string;
  line?: number;
  /** Collection key this came from, when it came from one. */
  collection?: string;
  /** True when the id was derived from the file path rather than declared. */
  derivedId?: boolean;
}

export interface ContextStore {
  manifest: Manifest;
  /** Absolute directory the manifest lives in. All relative paths resolve from here. */
  dir: string;
  manifestPath: string;
  objects: LoadedObject[];
  /** id -> every version of that id, ascending by version. */
  byId: Map<string, LoadedObject[]>;
  /** Load-time problems: unreadable files, unknown schemes, parse errors. */
  loadDiagnostics: Diagnostic[];
}

export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  id?: string;
  ids?: string[];
  file?: string;
  line?: number;
  column?: number;
  field?: string;
  expected?: unknown;
  actual?: unknown;
  remediation?: string;
}

export type DiagnosticCode =
  | "schema-invalid"
  | "manifest-invalid"
  | "duplicate-id"
  | "duplicate-canonical"
  | "unknown-authority"
  | "conflict-declared"
  | "conflict-ambiguous"
  | "broken-supersession"
  | "supersession-cycle"
  | "multiple-active-versions"
  | "broken-reference"
  | "orphaned"
  | "missing-owner"
  | "missing-provenance"
  | "missing-digest"
  | "stale"
  | "expired"
  | "not-yet-valid"
  | "review-overdue"
  | "unapproved"
  | "unknown-scheme"
  | "source-unavailable"
  | "path-traversal"
  | "invalid-permission"
  | "unknown-role"
  | "role-cycle"
  | "empty-scope"
  | "secret-detected"
  | "untrusted-canonical"
  | "unknown-extension";

export interface DiagnosticReport {
  opencontext: string;
  ok: boolean;
  generated_at?: string;
  namespace?: string;
  score?: number;
  counts?: Record<string, number>;
  findings: Diagnostic[];
}

export type ExclusionReason =
  | "permission-denied"
  | "classification-denied"
  | "scope-exclusion"
  | "not-in-scope"
  | "superseded"
  | "expired"
  | "not-yet-valid"
  | "outranked"
  | "unapproved"
  | "not-relevant"
  | "conflict"
  | "source-unavailable";

export interface Exclusion {
  id: string;
  reason: ExclusionReason;
  detail?: string;
  outranked_by?: string;
}

export interface BundleWarning {
  code: string;
  message: string;
  id?: string;
  severity?: Severity;
}

export interface ProvenanceEntry {
  id: string;
  canonical_source?: boolean;
  sources?: Source[];
}

export interface BundledObject extends Omit<ContextObject, "redact"> {
  lifecycle?: LifecycleState;
  /** Paths that were removed or masked. Discloses that redaction happened, not what was redacted. */
  redacted?: string[];
}

export interface ContextBundle {
  opencontext: string;
  bundle_id: string;
  generated_at: string;
  namespace?: string;
  consumer: { type: "agent" | "human" | "role" | "service"; id: string; roles?: string[] };
  task?: string;
  as_of?: string;
  objects: BundledObject[];
  excluded?: Exclusion[];
  warnings?: BundleWarning[];
  provenance?: ProvenanceEntry[];
  permissions?: string[];
  stats?: {
    considered?: number;
    included?: number;
    excluded?: number;
    redacted?: number;
    characters?: number;
  };
  digest: string;
  extensions?: Record<string, unknown>;
}

/** The scope one consumer resolves against, after roles are flattened. */
export interface EffectiveScope {
  consumer: { type: "agent" | "human" | "role" | "service"; id: string; roles: string[] };
  include: string[];
  exclude: string[];
  permissions: string[];
  maxClassification: Classification;
  redact: Redaction[];
  /** Names matched against object-level permissions: the consumer id plus its roles. */
  principals: string[];
}

export interface ResolveOptions {
  agent?: string;
  role?: string | string[];
  consumerType?: "agent" | "human" | "role" | "service";
  task?: string;
  at?: string | Date;
  includeHistorical?: boolean;
  explain?: boolean;
  offline?: boolean;
  limit?: number;
  minRelevance?: number;
  include?: string[];
  /** Ids the caller explicitly asked for; they still pass authorization. */
  requested?: string[];
}

export interface AdapterContext {
  /** Directory the manifest lives in. File adapters MUST NOT escape it. */
  dir: string;
  offline: boolean;
  config: AdapterConfig;
  timeoutMs?: number;
}

export interface AdapterResult {
  content: string;
  contentType?: string;
  digest?: string;
  retrievedAt?: string;
  /** Trust the adapter asserts for these bytes. Remote adapters return untrusted. */
  trust?: Trust;
}

/**
 * The adapter contract. An adapter claims one or more URI schemes and returns
 * bytes as data — never as instructions, and never executed.
 */
export interface Adapter {
  name: string;
  schemes: string[];
  /** Adapters that reach the network are skipped, not failed, in --offline runs. */
  remote?: boolean;
  load(uri: string, ctx: AdapterContext): Promise<AdapterResult>;
}
