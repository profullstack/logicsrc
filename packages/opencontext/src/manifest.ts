/**
 * Finding, reading, and normalizing `opencontext.yaml`.
 *
 * Discovery walks upward from the working directory the way git finds `.git`,
 * so `opencontext resolve` works from anywhere inside a project without a flag.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { validate } from "@logicsrc/validators";
import type { Authority, Classification, Diagnostic, Manifest, Severity, TieBreaker } from "./types.js";
import { AUTHORITIES } from "./types.js";
import { findFieldLine } from "./parse.js";

/** Canonical first: an implementation MAY support JSON, but YAML is the name people type. */
export const MANIFEST_FILENAMES = ["opencontext.yaml", "opencontext.yml", "opencontext.json"] as const;

export const SPEC_VERSION = "1.0";

export const DEFAULT_PRECEDENCE: Authority[] = [
  "canonical",
  "approved",
  "reference",
  "observed",
  "inferred",
  "historical"
];

export const DEFAULT_TIE_BREAKERS: TieBreaker[] = ["version", "updated", "confidence", "id"];

export const DEFAULT_MAX_CLASSIFICATION: Classification = "internal";

export class ManifestNotFoundError extends Error {
  constructor(startDir: string) {
    super(
      `No opencontext.yaml found in ${startDir} or any parent directory. ` +
        `Run \`opencontext init\` to create one.`
    );
    this.name = "ManifestNotFoundError";
  }
}

export class ManifestInvalidError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(message: string, diagnostics: Diagnostic[]) {
    super(message);
    this.name = "ManifestInvalidError";
    this.diagnostics = diagnostics;
  }
}

/** Walk upward from `startDir` looking for a manifest. Returns the absolute path. */
export function discoverManifest(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);

  // A directory that *is* a manifest path is accepted too, so callers can pass
  // either `./project` or `./project/opencontext.yaml`.
  if (isManifestPath(dir) && existsSync(dir)) return dir;

  for (;;) {
    for (const name of MANIFEST_FILENAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new ManifestNotFoundError(resolve(startDir));
    dir = parent;
  }
}

function isManifestPath(path: string): boolean {
  return MANIFEST_FILENAMES.some((name) => path.endsWith(name));
}

export interface LoadedManifest {
  manifest: Manifest;
  path: string;
  dir: string;
  raw: string;
}

/**
 * Read and validate a manifest.
 *
 * Schema failures are raised rather than collected: nothing downstream is
 * meaningful if the manifest itself is wrong, and a half-understood control
 * plane is exactly the situation the specification is trying to prevent.
 */
export function loadManifest(pathOrDir: string = process.cwd()): LoadedManifest {
  const path = isManifestPath(pathOrDir) ? resolve(pathOrDir) : discoverManifest(pathOrDir);
  const raw = readFileSync(path, "utf8");

  let data: unknown;
  try {
    data = path.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
  } catch (error) {
    throw new ManifestInvalidError(`${path}: ${(error as Error).message}`, [
      { code: "manifest-invalid", severity: "error", message: (error as Error).message, file: path }
    ]);
  }

  const diagnostics = validateManifestData(data, raw, path);
  const errors = diagnostics.filter((finding) => finding.severity === "error");
  if (errors.length > 0) {
    throw new ManifestInvalidError(
      `${path} is not a valid OpenContext manifest:\n${errors.map((e) => `  - ${e.message}`).join("\n")}`,
      diagnostics
    );
  }

  return { manifest: data as Manifest, path, dir: dirname(path), raw };
}

/** Schema validation plus the cross-field rules JSON Schema cannot express. */
export function validateManifestData(data: unknown, raw: string, file: string): Diagnostic[] {
  const findings: Diagnostic[] = [];
  const result = validate("opencontext-manifest", data);

  if (!result.ok) {
    for (const error of result.errors) {
      const field = error.instancePath.replace(/^\//, "").replace(/\//g, ".");
      findings.push({
        code: "manifest-invalid",
        severity: "error",
        message: `${field || "manifest"} ${error.message ?? "is invalid"}`,
        file,
        field: field || undefined,
        line: field ? findFieldLine(raw, field.split(".")[0]!) : undefined,
        expected: error.params,
        remediation: remediationFor(error.keyword, field)
      });
    }
    return findings;
  }

  const manifest = data as Manifest;

  const major = manifest.opencontext.split(".")[0];
  if (major !== SPEC_VERSION.split(".")[0]) {
    findings.push({
      code: "manifest-invalid",
      severity: "error",
      message: `Manifest declares OpenContext ${manifest.opencontext}, but this implementation supports ${SPEC_VERSION}.`,
      file,
      field: "opencontext",
      line: findFieldLine(raw, "opencontext"),
      remediation: `Set opencontext: "${SPEC_VERSION}", or use a runtime that implements ${major}.x.`
    });
  }

  // Precedence must stay a permutation of the standard levels. Dropping one
  // would leave objects at that authority unrankable; inventing one would let a
  // repository define something that outranks canonical.
  const precedence = manifest.authority?.precedence;
  if (precedence) {
    const missing = AUTHORITIES.filter((level) => !precedence.includes(level));
    if (missing.length > 0) {
      findings.push({
        code: "manifest-invalid",
        severity: "error",
        message: `authority.precedence omits ${missing.join(", ")}. It must list every authority level exactly once.`,
        file,
        field: "authority.precedence",
        line: findFieldLine(raw, "authority"),
        expected: [...AUTHORITIES],
        actual: precedence,
        remediation: "List all six levels, reordered as you need them."
      });
    }
  }

  findings.push(...validateRoleGraph(manifest, raw, file));

  for (const [name, binding] of Object.entries(manifest.agents ?? {})) {
    for (const role of binding.roles) {
      if (!manifest.roles?.[role]) {
        findings.push({
          code: "unknown-role",
          severity: "error",
          message: `Agent "${name}" holds role "${role}", which is not defined under roles.`,
          file,
          field: `agents.${name}.roles`,
          line: findFieldLine(raw, "agents"),
          remediation: `Define roles.${role}, or remove it from agents.${name}.`
        });
      }
    }
  }

  return findings;
}

/** Role inheritance must terminate, and every parent must exist. */
function validateRoleGraph(manifest: Manifest, raw: string, file: string): Diagnostic[] {
  const findings: Diagnostic[] = [];
  const roles = manifest.roles ?? {};

  for (const [name, role] of Object.entries(roles)) {
    for (const parent of role.inherits ?? []) {
      if (!roles[parent]) {
        findings.push({
          code: "unknown-role",
          severity: "error",
          message: `Role "${name}" inherits "${parent}", which is not defined.`,
          file,
          field: `roles.${name}.inherits`,
          line: findFieldLine(raw, "roles"),
          remediation: `Define roles.${parent}, or remove it from roles.${name}.inherits.`
        });
      }
    }

    if ((role.include ?? []).length === 0 && (role.inherits ?? []).length === 0) {
      findings.push({
        code: "empty-scope",
        severity: "warning",
        message: `Role "${name}" includes nothing, so it resolves to an empty bundle.`,
        file,
        field: `roles.${name}.include`,
        line: findFieldLine(raw, "roles"),
        remediation: `Add include patterns, or inherit from another role. Scope is opt-in by design.`
      });
    }
  }

  for (const name of Object.keys(roles)) {
    const cycle = findCycle(name, roles, new Set(), []);
    if (cycle) {
      findings.push({
        code: "role-cycle",
        severity: "error",
        message: `Role inheritance cycle: ${cycle.join(" -> ")}.`,
        file,
        field: `roles.${name}.inherits`,
        line: findFieldLine(raw, "roles"),
        remediation: "Break the cycle — inheritance must form a tree."
      });
      break;
    }
  }

  return findings;
}

function findCycle(
  name: string,
  roles: Record<string, { inherits?: string[] }>,
  seen: Set<string>,
  path: string[]
): string[] | null {
  if (seen.has(name)) return [...path, name];
  seen.add(name);
  for (const parent of roles[name]?.inherits ?? []) {
    if (!roles[parent]) continue;
    const cycle = findCycle(parent, roles, new Set(seen), [...path, name]);
    if (cycle) return cycle;
  }
  return null;
}

function remediationFor(keyword: string, field: string): string | undefined {
  switch (keyword) {
    case "additionalProperties":
      return `Remove the unrecognised key, or move it under extensions with a namespaced name such as com.example.${field || "custom"}.`;
    case "required":
      return "Add the missing required field.";
    case "enum":
      return "Use one of the listed values.";
    case "pattern":
      return "Check the format — ids are lowercase dotted slugs and durations look like 30d.";
    default:
      return undefined;
  }
}

/** Precedence with defaults applied, highest authority first. */
export function precedenceOf(manifest: Manifest): Authority[] {
  return manifest.authority?.precedence ?? DEFAULT_PRECEDENCE;
}

/** Tie breakers with defaults applied. `id` is always appended so ordering is total. */
export function tieBreakersOf(manifest: Manifest): TieBreaker[] {
  const configured = manifest.authority?.tie_breakers ?? DEFAULT_TIE_BREAKERS;
  return configured.includes("id") ? configured : [...configured, "id"];
}

export function failOnSeverityOf(manifest: Manifest): Severity {
  return manifest.health?.fail_on ?? "error";
}
