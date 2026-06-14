import * as Ajv2020Module from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import type { ErrorObject } from "ajv";
import { parse } from "yaml";
import { isSchemaKind, schemas, type SchemaKind } from "./schemas.js";

const Ajv2020 = (Ajv2020Module as unknown as { default: new (options: Record<string, unknown>) => { compile: (schema: unknown) => { (data: unknown): boolean; errors?: ErrorObject[] | null } } }).default;
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
const _compiledValidators = new Map<SchemaKind, ReturnType<typeof _ajv.compile>>();

function getCompiledValidator(kind: SchemaKind) {
  if (!_compiledValidators.has(kind)) {
    _compiledValidators.set(kind, _ajv.compile(schemas[kind]));
  }
  return _compiledValidators.get(kind)!;
}

export function parseDocument(input: string, fileName = "document") {
  if (fileName.endsWith(".json")) {
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
