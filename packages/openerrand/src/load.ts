/**
 * Loading an errand file: parse, validate with @logicsrc/validators (the same
 * schema and semantic checks `logicsrc-validate openerrand` runs), hash, and
 * describe it for the person before anything runs (rule 1).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validate } from "@logicsrc/validators";
import { isGate } from "./pages.js";
import type { Errand, Source } from "./types.js";
import { ErrandError } from "./util.js";

export interface Loaded {
  errand: Errand;
  sha256: string;
  file: string;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Validation errors as one line each: `/steps/2/solver: a captcha solver is never allowed on a tax site`. */
export function validateErrand(data: unknown): string[] {
  const result = validate("openerrand", data);
  if (result.ok) return [];
  return result.errors.map((e) => `${e.instancePath || "/"}: ${e.message ?? e.keyword}`);
}

export function loadErrand(file: string): Loaded {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new ErrandError(`cannot read ${file}: ${(error as Error).message}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new ErrandError(`${file} is not JSON: ${(error as Error).message}`);
  }
  const errors = validateErrand(data);
  if (errors.length) throw new ErrandError(`${file} is not a valid OpenErrand 0.1 file:\n${errors.map((e) => `  ${e}`).join("\n")}`);
  return { errand: data as Errand, sha256: sha256(text), file };
}

function describeSource(source: Source): string {
  switch (source.from) {
    case "document":
      return `document ${source.form} ${source.field}`;
    case "vault":
      return `vault ${source.key}`;
    case "prompt":
      return "asked at the terminal";
    case "generate":
      return `generated (${source.length} chars)`;
    case "derive":
      return `from ${source.input} (${source.transform})`;
    case "candidate":
      return `the ${source.part} of the ${source.input} candidate`;
    case "literal":
      return "fixed in the file";
  }
}

/**
 * What a person reads before the first run: title, publisher, verification,
 * every gate with its why, every input with its sensitivity and sources.
 */
export function summarize(errand: Errand, verification: string): string[] {
  const lines = [`${errand.title}  (${errand.name})`, `  site: ${errand.site.name}  ${errand.site.origins.join(" ")}${errand.site.sector ? `  [${errand.site.sector}]` : ""}`];
  lines.push(`  publisher: ${errand.publisher ?? "not stated"}   ${verification}`);
  const gates = errand.steps.filter(isGate);
  if (gates.length) {
    lines.push("  steps that are yours:");
    for (const gate of gates) lines.push(`    ${gate.kind} (${gate.id}): ${"why" in gate && gate.why ? gate.why : ("what" in gate ? gate.what : "")}`);
  }
  const inputs = Object.entries(errand.inputs ?? {});
  if (inputs.length) {
    lines.push("  inputs:");
    for (const [name, input] of inputs) {
      lines.push(`    ${name} [${input.sensitivity}${input.role ? `, ${input.role}` : ""}]: ${input.sources.map(describeSource).join(", then ")}`);
    }
  }
  return lines;
}
