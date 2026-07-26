import agentSchema from "../../schemas/schemas/logicsrc-agent.schema.json" with { type: "json" };
import accountAuditEventSchema from "../../schemas/schemas/logicsrc-account-audit-event.schema.json" with { type: "json" };
import accountGrantSchema from "../../schemas/schemas/logicsrc-account-grant.schema.json" with { type: "json" };
import accountProviderSchema from "../../schemas/schemas/logicsrc-account-provider.schema.json" with { type: "json" };
import connectedAccountSchema from "../../schemas/schemas/logicsrc-connected-account.schema.json" with { type: "json" };
import emailMessageSchema from "../../schemas/schemas/logicsrc-email-message.schema.json" with { type: "json" };
import eventSchema from "../../schemas/schemas/logicsrc-event.schema.json" with { type: "json" };
import pluginSchema from "../../schemas/schemas/logicsrc-plugin.schema.json" with { type: "json" };
import pullRequestSchema from "../../schemas/schemas/logicsrc-pull-request.schema.json" with { type: "json" };
import repoSchema from "../../schemas/schemas/logicsrc-repo.schema.json" with { type: "json" };
import runSchema from "../../schemas/schemas/logicsrc-run.schema.json" with { type: "json" };
import socialPostSchema from "../../schemas/schemas/logicsrc-social-post.schema.json" with { type: "json" };
import taskSchema from "../../schemas/schemas/logicsrc-task.schema.json" with { type: "json" };
import agentadAdSchema from "../../schemas/schemas/agentad-ad.schema.json" with { type: "json" };
import agentadPlacementSchema from "../../schemas/schemas/agentad-placement.schema.json" with { type: "json" };
import agentadAdRequestSchema from "../../schemas/schemas/agentad-ad-request.schema.json" with { type: "json" };
import agentadAdResponseSchema from "../../schemas/schemas/agentad-ad-response.schema.json" with { type: "json" };
import agentadImpressionSchema from "../../schemas/schemas/agentad-impression.schema.json" with { type: "json" };
import agentadClickSchema from "../../schemas/schemas/agentad-click.schema.json" with { type: "json" };
import agentadCampaignSchema from "../../schemas/schemas/agentad-campaign.schema.json" with { type: "json" };
import credentialProviderSchema from "../../schemas/schemas/logicsrc-credential-provider.schema.json" with { type: "json" };
import credentialSyncPlanSchema from "../../schemas/schemas/logicsrc-credential-sync-plan.schema.json" with { type: "json" };
import credentialSyncRunSchema from "../../schemas/schemas/logicsrc-credential-sync-run.schema.json" with { type: "json" };
import credentialAuditEventSchema from "../../schemas/schemas/logicsrc-credential-audit-event.schema.json" with { type: "json" };
import openprdPrdSchema from "../../schemas/schemas/openprd-prd.schema.json" with { type: "json" };
import ontologyManifestSchema from "../../schemas/schemas/logicsrc-openontology-manifest.schema.json" with { type: "json" };
import ontologyNamespaceSchema from "../../schemas/schemas/logicsrc-openontology-namespace.schema.json" with { type: "json" };
import ontologyEntityTypeSchema from "../../schemas/schemas/logicsrc-openontology-entity-type.schema.json" with { type: "json" };
import ontologyPropertySchema from "../../schemas/schemas/logicsrc-openontology-property.schema.json" with { type: "json" };
import ontologyRelationshipTypeSchema from "../../schemas/schemas/logicsrc-openontology-relationship-type.schema.json" with { type: "json" };
import ontologyConstraintSchema from "../../schemas/schemas/logicsrc-openontology-constraint.schema.json" with { type: "json" };
import ontologyQuerySchema from "../../schemas/schemas/logicsrc-openontology-query.schema.json" with { type: "json" };
import ontologyActionSchema from "../../schemas/schemas/logicsrc-openontology-action.schema.json" with { type: "json" };
import ontologyEntitySchema from "../../schemas/schemas/logicsrc-openontology-entity.schema.json" with { type: "json" };
import ontologyClaimSchema from "../../schemas/schemas/logicsrc-openontology-claim.schema.json" with { type: "json" };
import ontologySourceSchema from "../../schemas/schemas/logicsrc-openontology-source.schema.json" with { type: "json" };
import ontologyEvidenceSchema from "../../schemas/schemas/logicsrc-openontology-evidence.schema.json" with { type: "json" };
import ontologyChangeSetSchema from "../../schemas/schemas/logicsrc-openontology-changeset.schema.json" with { type: "json" };
import ontologyReviewSchema from "../../schemas/schemas/logicsrc-openontology-review.schema.json" with { type: "json" };
import ontologyApprovalSchema from "../../schemas/schemas/logicsrc-openontology-approval.schema.json" with { type: "json" };
import ontologyEventSchema from "../../schemas/schemas/logicsrc-openontology-event.schema.json" with { type: "json" };
import ontologyPackageSchema from "../../schemas/schemas/logicsrc-openontology-package.schema.json" with { type: "json" };

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
  "openontology-package": ontologyPackageSchema
} as const;

export type SchemaKind = keyof typeof schemas;

export function isSchemaKind(value: string): value is SchemaKind {
  return Object.hasOwn(schemas, value);
}
