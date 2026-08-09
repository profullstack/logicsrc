/**
 * Every LogicSRC JSON Schema, keyed by kind.
 *
 * Schemas are imported through @logicsrc/schemas package exports rather than by
 * a relative path across the repository. A relative import works in the
 * monorepo and breaks the moment this package is published: "../../schemas/..."
 * resolves outside the published tarball, so an installed @logicsrc/validators
 * could not load a single schema.
 */
import agentSchema from "@logicsrc/schemas/agent" with { type: "json" };
import accountAuditEventSchema from "@logicsrc/schemas/account-audit-event" with { type: "json" };
import accountGrantSchema from "@logicsrc/schemas/account-grant" with { type: "json" };
import accountProviderSchema from "@logicsrc/schemas/account-provider" with { type: "json" };
import connectedAccountSchema from "@logicsrc/schemas/connected-account" with { type: "json" };
import emailMessageSchema from "@logicsrc/schemas/email-message" with { type: "json" };
import eventSchema from "@logicsrc/schemas/event" with { type: "json" };
import pluginSchema from "@logicsrc/schemas/plugin" with { type: "json" };
import pullRequestSchema from "@logicsrc/schemas/pull-request" with { type: "json" };
import repoSchema from "@logicsrc/schemas/repo" with { type: "json" };
import runSchema from "@logicsrc/schemas/run" with { type: "json" };
import socialPostSchema from "@logicsrc/schemas/social-post" with { type: "json" };
import taskSchema from "@logicsrc/schemas/task" with { type: "json" };
import agentadAdSchema from "@logicsrc/schemas/agentad-ad" with { type: "json" };
import agentadPlacementSchema from "@logicsrc/schemas/agentad-placement" with { type: "json" };
import agentadAdRequestSchema from "@logicsrc/schemas/agentad-ad-request" with { type: "json" };
import agentadAdResponseSchema from "@logicsrc/schemas/agentad-ad-response" with { type: "json" };
import agentadImpressionSchema from "@logicsrc/schemas/agentad-impression" with { type: "json" };
import agentadClickSchema from "@logicsrc/schemas/agentad-click" with { type: "json" };
import agentadCampaignSchema from "@logicsrc/schemas/agentad-campaign" with { type: "json" };
import credentialProviderSchema from "@logicsrc/schemas/credential-provider" with { type: "json" };
import credentialSyncPlanSchema from "@logicsrc/schemas/credential-sync-plan" with { type: "json" };
import credentialSyncRunSchema from "@logicsrc/schemas/credential-sync-run" with { type: "json" };
import credentialAuditEventSchema from "@logicsrc/schemas/credential-audit-event" with { type: "json" };
import openprdPrdSchema from "@logicsrc/schemas/openprd-prd" with { type: "json" };
import ontologyManifestSchema from "@logicsrc/schemas/openontology-manifest" with { type: "json" };
import ontologyNamespaceSchema from "@logicsrc/schemas/openontology-namespace" with { type: "json" };
import ontologyEntityTypeSchema from "@logicsrc/schemas/openontology-entity-type" with { type: "json" };
import ontologyPropertySchema from "@logicsrc/schemas/openontology-property" with { type: "json" };
import ontologyRelationshipTypeSchema from "@logicsrc/schemas/openontology-relationship-type" with { type: "json" };
import ontologyConstraintSchema from "@logicsrc/schemas/openontology-constraint" with { type: "json" };
import ontologyQuerySchema from "@logicsrc/schemas/openontology-query" with { type: "json" };
import ontologyActionSchema from "@logicsrc/schemas/openontology-action" with { type: "json" };
import ontologyEntitySchema from "@logicsrc/schemas/openontology-entity" with { type: "json" };
import ontologyClaimSchema from "@logicsrc/schemas/openontology-claim" with { type: "json" };
import ontologySourceSchema from "@logicsrc/schemas/openontology-source" with { type: "json" };
import ontologyEvidenceSchema from "@logicsrc/schemas/openontology-evidence" with { type: "json" };
import ontologyChangeSetSchema from "@logicsrc/schemas/openontology-changeset" with { type: "json" };
import ontologyReviewSchema from "@logicsrc/schemas/openontology-review" with { type: "json" };
import ontologyApprovalSchema from "@logicsrc/schemas/openontology-approval" with { type: "json" };
import ontologyEventSchema from "@logicsrc/schemas/openontology-event" with { type: "json" };
import ontologyPackageSchema from "@logicsrc/schemas/openontology-package" with { type: "json" };

import ocManifestSchema from "@logicsrc/schemas/opencontext-manifest" with { type: "json" };
import ocObjectSchema from "@logicsrc/schemas/opencontext-object" with { type: "json" };
import ocBundleSchema from "@logicsrc/schemas/opencontext-bundle" with { type: "json" };
import ocRoleSchema from "@logicsrc/schemas/opencontext-role" with { type: "json" };
import ocProvenanceSchema from "@logicsrc/schemas/opencontext-provenance" with { type: "json" };
import ocDecisionSchema from "@logicsrc/schemas/opencontext-decision" with { type: "json" };
import ocDiagnosticSchema from "@logicsrc/schemas/opencontext-diagnostic" with { type: "json" };
import ocAuditEventSchema from "@logicsrc/schemas/opencontext-audit-event" with { type: "json" };

export const schemas = {
  agent: agentSchema,
  "account-audit-event": accountAuditEventSchema,
  "account-grant": accountGrantSchema,
  "account-provider": accountProviderSchema,
  "connected-account": connectedAccountSchema,
  "email-message": emailMessageSchema,
  event: eventSchema,
  plugin: pluginSchema,
  "pull-request": pullRequestSchema,
  repo: repoSchema,
  run: runSchema,
  "social-post": socialPostSchema,
  task: taskSchema,
  "agentad-ad": agentadAdSchema,
  "agentad-placement": agentadPlacementSchema,
  "agentad-ad-request": agentadAdRequestSchema,
  "agentad-ad-response": agentadAdResponseSchema,
  "agentad-impression": agentadImpressionSchema,
  "agentad-click": agentadClickSchema,
  "agentad-campaign": agentadCampaignSchema,
  "credential-provider": credentialProviderSchema,
  "credential-sync-plan": credentialSyncPlanSchema,
  "credential-sync-run": credentialSyncRunSchema,
  "credential-audit-event": credentialAuditEventSchema,
  "openprd-prd": openprdPrdSchema,
  "openontology-manifest": ontologyManifestSchema,
  "openontology-namespace": ontologyNamespaceSchema,
  "openontology-entity-type": ontologyEntityTypeSchema,
  "openontology-property": ontologyPropertySchema,
  "openontology-relationship-type": ontologyRelationshipTypeSchema,
  "openontology-constraint": ontologyConstraintSchema,
  "openontology-query": ontologyQuerySchema,
  "openontology-action": ontologyActionSchema,
  "openontology-entity": ontologyEntitySchema,
  "openontology-claim": ontologyClaimSchema,
  "openontology-source": ontologySourceSchema,
  "openontology-evidence": ontologyEvidenceSchema,
  "openontology-changeset": ontologyChangeSetSchema,
  "openontology-review": ontologyReviewSchema,
  "openontology-approval": ontologyApprovalSchema,
  "openontology-event": ontologyEventSchema,
  "openontology-package": ontologyPackageSchema,
  "opencontext-manifest": ocManifestSchema,
  "opencontext-object": ocObjectSchema,
  "opencontext-bundle": ocBundleSchema,
  "opencontext-role": ocRoleSchema,
  "opencontext-provenance": ocProvenanceSchema,
  "opencontext-decision": ocDecisionSchema,
  "opencontext-diagnostic": ocDiagnosticSchema,
  "opencontext-audit-event": ocAuditEventSchema
} as const;

export type SchemaKind = keyof typeof schemas;

export function isSchemaKind(value: string): value is SchemaKind {
  return Object.hasOwn(schemas, value);
}
