// Runtime validation against the canonical AgentAd JSON Schemas. Mirrors the
// approach in @logicsrc/validators: import the schema documents directly from
// @logicsrc/schemas and compile them with Ajv 2020. Keeping this local (rather
// than importing the built @logicsrc/validators dist) lets the exchange and its
// tests run straight from source with no cross-package build step.

import * as Ajv2020Module from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import type { ErrorObject } from "ajv";

import adSchema from "../../schemas/schemas/agentad-ad.schema.json" with { type: "json" };
import placementSchema from "../../schemas/schemas/agentad-placement.schema.json" with { type: "json" };
import adRequestSchema from "../../schemas/schemas/agentad-ad-request.schema.json" with { type: "json" };
import adResponseSchema from "../../schemas/schemas/agentad-ad-response.schema.json" with { type: "json" };
import impressionSchema from "../../schemas/schemas/agentad-impression.schema.json" with { type: "json" };
import clickSchema from "../../schemas/schemas/agentad-click.schema.json" with { type: "json" };
import campaignSchema from "../../schemas/schemas/agentad-campaign.schema.json" with { type: "json" };

type CompiledValidator = { (data: unknown): boolean; errors?: ErrorObject[] | null };
const Ajv2020 = (Ajv2020Module as unknown as {
  default: new (options: Record<string, unknown>) => { compile: (schema: unknown) => CompiledValidator };
}).default;
const addFormats = (addFormatsModule as unknown as { default: (ajv: unknown) => void }).default;

export const agentAdSchemas = {
  "agentad-ad": adSchema,
  "agentad-placement": placementSchema,
  "agentad-ad-request": adRequestSchema,
  "agentad-ad-response": adResponseSchema,
  "agentad-impression": impressionSchema,
  "agentad-click": clickSchema,
  "agentad-campaign": campaignSchema
} as const;

export type AgentAdSchemaKind = keyof typeof agentAdSchemas;

export type ValidationResult =
  | { ok: true; kind: AgentAdSchemaKind; data: unknown }
  | { ok: false; kind: AgentAdSchemaKind; errors: ErrorObject[] };

const cache = new Map<AgentAdSchemaKind, CompiledValidator>();

function compiled(kind: AgentAdSchemaKind): CompiledValidator {
  const existing = cache.get(kind);
  if (existing) return existing;

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const fn = ajv.compile(agentAdSchemas[kind]);
  cache.set(kind, fn);
  return fn;
}

export function validate(kind: AgentAdSchemaKind, data: unknown): ValidationResult {
  const fn = compiled(kind);
  const ok = fn(data);
  return ok
    ? { ok: true, kind, data }
    : { ok: false, kind, errors: fn.errors ?? [] };
}

/** Validate or throw with a readable message. Returns the value narrowed to T. */
export function assertValid<T>(kind: AgentAdSchemaKind, data: T): T {
  const result = validate(kind, data);
  if (!result.ok) {
    const detail = result.errors
      .map((e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`)
      .join("; ");
    throw new Error(`Invalid ${kind} document: ${detail}`);
  }
  return data;
}
