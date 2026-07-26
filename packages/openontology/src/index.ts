/**
 * @logicsrc/openontology — reference implementation of the LogicSRC
 * OpenOntology standard.
 *
 * This package IMPLEMENTS the standard; it does not define it. The normative
 * contracts are the JSON Schemas published in @logicsrc/schemas under
 * https://logicsrc.com/schemas/openontology/. Any implementation that
 * satisfies those schemas and the conformance suite conforms, whether or not
 * it uses a single line of this code.
 */

export { OPENONTOLOGY_VERSION } from "./types.js";
export type * from "./types.js";

export { canonicalize, canonicalObject, digest, packageDigest } from "./canonical.js";

export {
  createIdFactory,
  idForm,
  idPrefix,
  isValidId,
  isVariable,
  revisionId,
  toIri,
  type IdForm
} from "./ids.js";

export {
  buildOntologyPackage,
  loadOntologyPackage,
  verifyPackageDigest,
  PackageLoadError,
  SCHEMA_SECTIONS,
  DATA_SECTIONS,
  type LoadInput
} from "./package.js";

export {
  renderReport,
  validateOntologyPackage,
  type ReportFormat,
  type ValidateOptions
} from "./validate.js";

export {
  DEFAULT_LIMITS,
  evaluateQuery,
  validAt,
  QueryLimitError,
  type KnowledgeView,
  type QueryLimits
} from "./query.js";

export {
  createMemoryStore,
  type ClaimFilter,
  type EntityFilter,
  type EntityMatch,
  type OntologyStore,
  type StatusTransition
} from "./store.js";

export {
  evaluatePolicy,
  localActor,
  proposerActor,
  readOnlyActor,
  SCOPES,
  type Actor,
  type Operation,
  type PolicyDecision,
  type PolicyOptions,
  type Scope
} from "./policy.js";

export {
  applyChangeSet,
  diffChangeSet,
  ChangeSetApplyError,
  ChangeSetConflictError,
  type ApplyContext,
  type ApplyResult,
  type SemanticDiff
} from "./changeset.js";

export {
  buildContext,
  exportJsonLd,
  importJsonLd,
  packagePrefix,
  OO,
  PROV,
  type JsonLdExport
} from "./jsonld.js";

export {
  createEd25519Provider,
  generateEd25519KeyPair,
  signDigest,
  verifyDigestSignature,
  verifyPackageSignatures,
  type SignatureProvider,
  type VerificationResult
} from "./signature.js";

export {
  createOntologyEngine,
  OntologyApprovalError,
  OntologyNotFoundError,
  OntologyPermissionError,
  type EngineOptions,
  type Explanation,
  type ExplainedClaim,
  type OntologyEngine
} from "./engine.js";

export { initOntologyPackage, type InitOptions, type InitResult } from "./scaffold.js";
