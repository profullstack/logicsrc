import * as Ajv2020Module from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import type { ErrorObject } from "ajv";
import { parse } from "yaml";
import { isSchemaKind, schemas, type SchemaKind } from "./schemas.js";

type CompiledSchema = { (data: unknown): boolean; errors?: ErrorObject[] | null };

type AjvInstance = {
  compile: (schema: unknown) => CompiledSchema;
  addSchema: (schema: unknown) => unknown;
  getSchema: (id: string) => CompiledSchema | undefined;
};

const Ajv2020 = (Ajv2020Module as unknown as { default: new (options: Record<string, unknown>) => AjvInstance }).default;
const addFormats = (addFormatsModule as unknown as { default: (ajv: InstanceType<typeof Ajv2020>) => void }).default;

export type ValidationResult =
  | { ok: true; kind: SchemaKind; data: unknown }
  | { ok: false; kind: SchemaKind; errors: ErrorObject[] };

export function createValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv;
}

const _ajv = createValidator();

// Every schema is registered up front, by $id, so that a schema which $refs
// another one across files resolves. The OpenCreds database schema does this:
// it refers to the item and manifest schemas rather than restating them, and
// restating them is how two copies of a definition drift apart.
for (const schema of Object.values(schemas)) {
  _ajv.addSchema(schema);
}

const _compiledValidators = new Map<SchemaKind, CompiledSchema>();

function getCompiledValidator(kind: SchemaKind) {
  if (!_compiledValidators.has(kind)) {
    // Already registered above, so look it up by $id — compiling it a second
    // time would throw on the duplicate id.
    const id = (schemas[kind] as { $id?: string }).$id;
    const registered = id ? _ajv.getSchema(id) : undefined;
    _compiledValidators.set(kind, registered ?? _ajv.compile(schemas[kind]));
  }
  return _compiledValidators.get(kind)!;
}

export function parseDocument(input: string, fileName = "document") {
  if (fileName.toLowerCase().endsWith(".json")) {
    return JSON.parse(input) as unknown;
  }

  return parse(input) as unknown;
}

export function validate(kind: SchemaKind, data: unknown): ValidationResult {
  const validateDocument = getCompiledValidator(kind);
  const ok = validateDocument(data);

  if (ok) {
    return { ok: true, kind, data };
  }

  return {
    ok: false,
    kind,
    errors: validateDocument.errors ?? []
  };
}

export function assertSchemaKind(value: string): SchemaKind {
  if (!isSchemaKind(value)) {
    throw new Error(`Unknown schema kind "${value}". Expected one of: ${Object.keys(schemas).join(", ")}`);
  }

  return value;
}

export { schemas, type SchemaKind };
