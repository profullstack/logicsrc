import agentSchema from "../../schemas/schemas/logicsrc-agent.schema.json" with { type: "json" };
import eventSchema from "../../schemas/schemas/logicsrc-event.schema.json" with { type: "json" };
import pluginSchema from "../../schemas/schemas/logicsrc-plugin.schema.json" with { type: "json" };
import runSchema from "../../schemas/schemas/logicsrc-run.schema.json" with { type: "json" };
import taskSchema from "../../schemas/schemas/logicsrc-task.schema.json" with { type: "json" };

export const schemas = {
  agent: agentSchema,
  event: eventSchema,
  plugin: pluginSchema,
  run: runSchema,
  task: taskSchema
} as const;

export type SchemaKind = keyof typeof schemas;

export function isSchemaKind(value: string): value is SchemaKind {
  return value in schemas;
}
