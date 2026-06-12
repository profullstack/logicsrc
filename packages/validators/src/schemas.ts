import agentSchema from "../../schemas/schemas/logicsrc-agent.schema.json" with { type: "json" };
import accountAuditEventSchema from "../../schemas/schemas/logicsrc-account-audit-event.schema.json" with { type: "json" };
import accountGrantSchema from "../../schemas/schemas/logicsrc-account-grant.schema.json" with { type: "json" };
import accountProviderSchema from "../../schemas/schemas/logicsrc-account-provider.schema.json" with { type: "json" };
import connectedAccountSchema from "../../schemas/schemas/logicsrc-connected-account.schema.json" with { type: "json" };
import emailMessageSchema from "../../schemas/schemas/logicsrc-email-message.schema.json" with { type: "json" };
import eventSchema from "../../schemas/schemas/logicsrc-event.schema.json" with { type: "json" };
import pluginSchema from "../../schemas/schemas/logicsrc-plugin.schema.json" with { type: "json" };
import runSchema from "../../schemas/schemas/logicsrc-run.schema.json" with { type: "json" };
import socialPostSchema from "../../schemas/schemas/logicsrc-social-post.schema.json" with { type: "json" };
import taskSchema from "../../schemas/schemas/logicsrc-task.schema.json" with { type: "json" };

export const schemas = {
  agent: agentSchema,
  "account-audit-event": accountAuditEventSchema,
  "account-grant": accountGrantSchema,
  "account-provider": accountProviderSchema,
  "connected-account": connectedAccountSchema,
  "email-message": emailMessageSchema,
  event: eventSchema,
  plugin: pluginSchema,
  run: runSchema,
  "social-post": socialPostSchema,
  task: taskSchema
} as const;

export type SchemaKind = keyof typeof schemas;

export function isSchemaKind(value: string): value is SchemaKind {
  return Object.hasOwn(schemas, value);
}
