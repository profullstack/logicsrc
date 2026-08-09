/**
 * Validation: schema conformance plus the rules JSON Schema cannot express.
 *
 * Errors are written to be acted on. Each one names the file, the object, the
 * field, what was expected, what was found, and what to do about it — because a
 * validator that says "must match pattern" to someone who mistyped an id has
 * technically reported the problem and practically wasted their afternoon.
 */

import { validate as validateSchema } from "@logicsrc/validators";
import type { ContextStore, Diagnostic, LoadedObject, Manifest } from "./types.js";
import { AUTHORITIES } from "./types.js";
import { detectConflicts, isSuperseded, resolveSupersession } from "./authority.js";
import { isValidId, parseRef } from "./ids.js";
import { detectSecrets } from "./redact.js";
import { schemeOf } from "./adapters/index.js";
import { matchesAny } from "./ids.js";

export interface ValidateOptions {
  /** Strict mode also rejects unknown extension namespaces and treats warnings as failures. */
  strict?: boolean;
}

export function validateStore(store: ContextStore, options: ValidateOptions = {}): Diagnostic[] {
  const findings: Diagnostic[] = [...store.loadDiagnostics];
  const { manifest } = store;

  findings.push(...validateObjectSchemas(store, options));
  findings.push(...validateDuplicates(store));
  findings.push(...validateReferences(store));

  const supersession = resolveSupersession(store.objects, store.byId);
  findings.push(...supersession.diagnostics);

  const active = store.objects.filter((entry) => !isSuperseded(entry.object, supersession.superseded));
  findings.push(...detectConflicts(active, manifest).diagnostics);

  findings.push(...validateGovernance(store, options));
  findings.push(...validateSecurity(store));

  return sortDiagnostics(findings);
}

function validateObjectSchemas(store: ContextStore, options: ValidateOptions): Diagnostic[] {
  const findings: Diagnostic[] = [];

  for (const entry of store.objects) {
    const object = entry.object;
    const kind = object.type === "decision" ? "opencontext-decision" : "opencontext-object";
    const result = validateSchema(kind, object);

    if (!result.ok) {
      for (const error of result.errors) {
        const field = error.instancePath.replace(/^\//, "").replace(/\//g, ".");
        findings.push({
          code: "schema-invalid",
          severity: "error",
          message: `${object.id}: ${field || "object"} ${error.message ?? "is invalid"}`,
          id: object.id,
          file: entry.file,
          line: entry.line,
          field: field || undefined,
          expected: error.params,
          actual: field ? readPath(object as unknown as Record<string, unknown>, field) : undefined,
          remediation:
            error.keyword === "additionalProperties"
              ? `Unknown field. Move custom data under extensions with a namespaced key, e.g. extensions."com.example.thing".`
              : undefined
        });
      }
    }

    if (!isValidId(object.id)) {
      findings.push({
        code: "schema-invalid",
        severity: "error",
        message: `"${object.id}" is not a valid object id.`,
        id: object.id,
        file: entry.file,
        field: "id",
        expected: "lowercase dotted segments, e.g. policy.refunds",
        actual: object.id,
        remediation: entry.derivedId
          ? `The id was derived from the filename. Rename the file, or declare an explicit id in front matter.`
          : "Rename the id."
      });
    }

    if (object.authority && !(AUTHORITIES as readonly string[]).includes(object.authority)) {
      findings.push({
        code: "unknown-authority",
        severity: "error",
        message: `${object.id} declares authority "${object.authority}".`,
        id: object.id,
        file: entry.file,
        field: "authority",
        expected: [...AUTHORITIES],
        actual: object.authority
      });
    }

    if (options.strict) {
      for (const namespace of Object.keys(object.extensions ?? {})) {
        if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(namespace)) {
          findings.push({
            code: "unknown-extension",
            severity: "error",
            message: `${object.id}: extension "${namespace}" is not reverse-DNS namespaced.`,
            id: object.id,
            file: entry.file,
            field: `extensions.${namespace}`,
            expected: "com.example.thing",
            actual: namespace,
            remediation: "Namespace the extension so independent tools never collide."
          });
        }
      }
    }
  }

  return findings;
}

/** Same id *and* version twice is a duplicate; same id at different versions is history. */
function validateDuplicates(store: ContextStore): Diagnostic[] {
  const findings: Diagnostic[] = [];

  for (const [id, entries] of store.byId) {
    if (entries.length < 2) continue;

    const seen = new Map<number, LoadedObject[]>();
    for (const entry of entries) {
      const version = entry.object.version ?? 1;
      const list = seen.get(version);
      if (list) list.push(entry);
      else seen.set(version, [entry]);
    }

    for (const [version, duplicates] of seen) {
      if (duplicates.length < 2) continue;
      findings.push({
        code: "duplicate-id",
        severity: "error",
        message: `${duplicates.length} objects share the id "${id}" at version ${version}: ${duplicates
          .map((entry) => entry.file ?? "inline")
          .join(", ")}.`,
        id,
        ids: duplicates.map((entry) => entry.file ?? id),
        file: duplicates[0]?.file,
        remediation: duplicates.some((entry) => entry.derivedId)
          ? `At least one id was derived from its filename. Declare explicit ids, or rename the files.`
          : `Give each object a distinct id, or bump one to a new version and add supersedes.`
      });
    }
  }

  return findings;
}

/** Every declared relationship must point at something that exists. */
function validateReferences(store: ContextStore): Diagnostic[] {
  const findings: Diagnostic[] = [];
  const fields = ["references", "depends_on", "conflicts_with"] as const;

  for (const entry of store.objects) {
    for (const field of fields) {
      for (const ref of entry.object[field] ?? []) {
        const parsed = parseRef(ref);
        if (!parsed) {
          findings.push({
            code: "broken-reference",
            severity: "error",
            message: `${entry.object.id}: "${ref}" in ${field} is not a valid reference.`,
            id: entry.object.id,
            file: entry.file,
            field,
            actual: ref,
            remediation: "Use an id, or id@version."
          });
          continue;
        }
        if (!store.byId.has(parsed.id)) {
          findings.push({
            code: "broken-reference",
            severity: "error",
            message: `${entry.object.id}: ${field} points at "${ref}", which does not exist.`,
            id: entry.object.id,
            ids: [entry.object.id, parsed.id],
            file: entry.file,
            field,
            actual: ref,
            remediation: `Create ${parsed.id}, fix the reference, or remove it.`
          });
        }
      }
    }
  }

  return findings;
}

/** Ownership, provenance, and reachability — the checks that keep context governable. */
function validateGovernance(store: ContextStore, options: ValidateOptions): Diagnostic[] {
  const findings: Diagnostic[] = [];
  const { manifest } = store;
  const requireOwner = manifest.health?.require_owner === true;
  const provenanceRequired = manifest.provenance?.required === true;
  const requireDigest = manifest.provenance?.require_digest === true;

  const referenced = new Set<string>();
  for (const entry of store.objects) {
    for (const ref of [...(entry.object.references ?? []), ...(entry.object.depends_on ?? [])]) {
      const parsed = parseRef(ref);
      if (parsed) referenced.add(parsed.id);
    }
  }

  const rolePatterns = Object.values(manifest.roles ?? {}).flatMap((role) => role.include ?? []);

  for (const entry of store.objects) {
    const object = entry.object;

    if (!object.owner) {
      findings.push({
        code: "missing-owner",
        severity: requireOwner ? "error" : "warning",
        message: `${object.id} has no owner.`,
        id: object.id,
        file: entry.file,
        field: "owner",
        remediation: `Add owner: <team or role>. Unowned context is what goes stale.`
      });
    }

    // Judged against what the author wrote, never against the file:// source the
    // loader attaches — otherwise the requirement would always be satisfied.
    if (provenanceRequired && !entry.raw.canonical_source && (entry.raw.sources ?? []).length === 0) {
      findings.push({
        code: "missing-provenance",
        severity: "error",
        message: `${object.id} declares no source, and provenance.required is true.`,
        id: object.id,
        file: entry.file,
        field: "sources",
        remediation: `Add sources: [...], or canonical_source: true if this object is itself the origin.`
      });
    }

    for (const source of entry.raw.sources ?? []) {
      const scheme = schemeOf(source.uri);
      const isRemote = scheme === "http" || scheme === "https";
      if (requireDigest && isRemote && !source.digest) {
        findings.push({
          code: "missing-digest",
          severity: "error",
          message: `${object.id}: remote source ${source.uri} has no integrity digest.`,
          id: object.id,
          file: entry.file,
          field: "sources",
          remediation: `Add digest: sha256:<hex>, so a change at the source is detectable.`
        });
      }
    }

    // Context nobody can ever receive and nothing points at is dead weight.
    if (rolePatterns.length > 0 && !matchesAny(rolePatterns, object.id) && !referenced.has(object.id)) {
      findings.push({
        code: "orphaned",
        severity: "warning",
        message: `${object.id} is not included by any role and nothing references it, so no consumer can ever receive it.`,
        id: object.id,
        file: entry.file,
        remediation: `Add it to a role's include list, reference it from another object, or delete it.`
      });
    }

    if (options.strict && object.status === "draft") {
      findings.push({
        code: "unapproved",
        severity: "warning",
        message: `${object.id} is still a draft.`,
        id: object.id,
        file: entry.file,
        field: "status"
      });
    }

    for (const principal of [
      ...(object.permissions?.read ?? []),
      ...(object.permissions?.write ?? []),
      ...(object.permissions?.deny ?? [])
    ]) {
      if (principal === "*" || principal.endsWith(".*")) continue;
      const known = Boolean(manifest.roles?.[principal] ?? manifest.agents?.[principal]);
      if (!known) {
        findings.push({
          code: "invalid-permission",
          severity: "warning",
          message: `${object.id} grants access to "${principal}", which is neither a defined role nor a defined agent.`,
          id: object.id,
          file: entry.file,
          field: "permissions",
          actual: principal,
          remediation: `Define roles.${principal}, or correct the name — a typo here silently denies access.`
        });
      }
    }
  }

  return findings;
}

/** Security checks that run on every validate, not only under --strict. */
function validateSecurity(store: ContextStore): Diagnostic[] {
  const findings: Diagnostic[] = [];

  for (const entry of store.objects) {
    const object = entry.object;

    for (const label of detectSecrets(object.content)) {
      findings.push({
        code: "secret-detected",
        severity: "error",
        message: `${object.id} appears to contain a ${label}.`,
        id: object.id,
        file: entry.file,
        field: "content",
        remediation:
          "Remove it and reference a secret manager instead. Context repositories are usually far more widely readable than the systems they describe."
      });
    }

    // Canonical means "this organization vouches for it". Content fetched from a
    // system that can carry attacker-controlled text cannot be vouched for.
    if (object.authority === "canonical" && object.trust === "untrusted") {
      findings.push({
        code: "untrusted-canonical",
        severity: "error",
        message: `${object.id} is canonical but its content is untrusted (${object.content_uri ?? "external source"}).`,
        id: object.id,
        file: entry.file,
        field: "authority",
        remediation:
          "Lower the authority to observed or reference, or mirror the content into the repository where it can be reviewed.",
      });
    }
  }

  return findings;
}

function readPath(object: Record<string, unknown>, path: string): unknown {
  let node: unknown = object;
  for (const segment of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

/** Most severe first, then by code, then by id — so two runs produce identical reports. */
export function sortDiagnostics(findings: Diagnostic[]): Diagnostic[] {
  return [...findings].sort((a, b) => {
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severity !== 0) return severity;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return (a.id ?? "") < (b.id ?? "") ? -1 : (a.id ?? "") > (b.id ?? "") ? 1 : 0;
  });
}

export function hasFailure(findings: Diagnostic[], failOn: "info" | "warning" | "error"): boolean {
  const threshold = SEVERITY_ORDER[failOn];
  return findings.some((finding) => SEVERITY_ORDER[finding.severity] <= threshold);
}

export function isManifestUsable(manifest: Manifest): boolean {
  return typeof manifest.opencontext === "string" && typeof manifest.id === "string";
}
