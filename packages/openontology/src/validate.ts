import { validate as validateSchema, type SchemaKind } from "@logicsrc/validators";
import { isValidId } from "./ids.js";
import { evaluateQuery, type KnowledgeView } from "./query.js";
import type {
  Claim,
  Finding,
  LoadedPackage,
  Severity,
  ValidationReport,
  ValueType
} from "./types.js";

export interface ValidateOptions {
  /**
   * Strict mode fails on unknown entity types, unknown predicates, unresolved
   * references, and unnamespaced extension keys. Non-strict downgrades the
   * "unknown" family to warnings so a package can be authored incrementally.
   */
  strict?: boolean;
  /** Excerpts longer than this raise a policy finding. */
  maxExcerptLength?: number;
  /** Verify the manifest digest against a freshly computed one. */
  expectedDigest?: string;
}

const SCHEMA_KIND: Record<string, SchemaKind> = {
  Namespace: "openontology-namespace",
  EntityType: "openontology-entity-type",
  Property: "openontology-property",
  RelationshipType: "openontology-relationship-type",
  Constraint: "openontology-constraint",
  SavedQuery: "openontology-query",
  Action: "openontology-action",
  Entity: "openontology-entity",
  Claim: "openontology-claim",
  Source: "openontology-source",
  Evidence: "openontology-evidence"
};

export function validateOntologyPackage(
  pkg: LoadedPackage,
  options: ValidateOptions = {}
): ValidationReport {
  const findings: Finding[] = [];
  const strict = options.strict ?? false;
  const unknownSeverity: Severity = strict ? "error" : "warning";
  const maxExcerpt = options.maxExcerptLength ?? 500;

  const add = (finding: Finding) => findings.push(finding);

  /* ── 1. Schema structure ───────────────────────────────────────────── */

  const manifestResult = validateSchema("openontology-manifest", pkg.manifest);
  if (!manifestResult.ok) {
    for (const error of manifestResult.errors) {
      add({
        code: "OO-S-MANIFEST",
        severity: "error",
        objectId: pkg.manifest?.id,
        file: "openontology.yaml",
        path: error.instancePath || "/",
        message: `Manifest ${error.instancePath || "/"} ${error.message ?? "failed validation"}`,
        hint: "See https://logicsrc.com/schemas/openontology/manifest.schema.json"
      });
    }
  }

  const sections: Array<[string, unknown[]]> = [
    ["namespaces", pkg.schema.namespaces],
    ["entityTypes", pkg.schema.entityTypes],
    ["properties", pkg.schema.properties],
    ["relationships", pkg.schema.relationships],
    ["constraints", pkg.schema.constraints],
    ["queries", pkg.schema.queries],
    ["actions", pkg.schema.actions],
    ["entities", pkg.data.entities],
    ["claims", pkg.data.claims],
    ["sources", pkg.data.sources],
    ["evidence", pkg.data.evidence]
  ];

  for (const [section, items] of sections) {
    items.forEach((item, index) => {
      const kind = (item as { kind?: string }).kind;
      const schemaKind = kind ? SCHEMA_KIND[kind] : undefined;
      if (!schemaKind) {
        add({
          code: "OO-S-KIND",
          severity: "error",
          file: section,
          path: `/${index}`,
          message: `Object in ${section}[${index}] has unknown kind ${JSON.stringify(kind ?? null)}`,
          hint: `Expected one of: ${Object.keys(SCHEMA_KIND).join(", ")}`
        });
        return;
      }
      const result = validateSchema(schemaKind, item);
      if (result.ok) return;
      for (const error of result.errors) {
        add({
          code: "OO-S-OBJECT",
          severity: "error",
          objectId: (item as { id?: string }).id,
          file: section,
          path: `/${index}${error.instancePath}`,
          message: `${kind} ${(item as { id?: string }).id ?? index}: ${error.instancePath || "/"} ${
            error.message ?? "failed validation"
          }`
        });
      }
    });
  }

  /* ── 2. Identity and uniqueness ────────────────────────────────────── */

  const seen = new Map<string, string>();
  const checkUnique = (id: string | undefined, section: string) => {
    if (!id) return;
    const key = `${section}:${id}`;
    if (seen.has(key)) {
      add({
        code: "OO-G-DUPLICATE-ID",
        severity: "error",
        objectId: id,
        file: section,
        message: `Duplicate id ${id} in ${section}`
      });
      return;
    }
    seen.set(key, section);
  };

  for (const t of pkg.schema.entityTypes) checkUnique(t.id, "entityTypes");
  for (const r of pkg.schema.relationships) checkUnique(r.id, "relationships");
  for (const p of pkg.schema.properties) checkUnique(p.id, "properties");
  for (const c of pkg.schema.constraints) checkUnique(c.id, "constraints");
  for (const q of pkg.schema.queries) checkUnique(q.id, "queries");
  for (const e of pkg.data.entities) checkUnique(e.id, "entities");
  for (const c of pkg.data.claims) checkUnique(c.id, "claims");
  for (const s of pkg.data.sources) checkUnique(s.id, "sources");
  for (const ev of pkg.data.evidence) checkUnique(ev.id, "evidence");

  for (const entity of pkg.data.entities) {
    if (!isValidId(entity.id)) {
      add({
        code: "OO-G-ID-FORM",
        severity: "error",
        objectId: entity.id,
        file: "entities",
        message: `Entity id ${JSON.stringify(entity.id)} is not a compact, IRI, or urn: identifier`,
        hint: "Use prefix:type:slug, an https:// IRI, or urn:logicsrc:..."
      });
    }
  }

  /* ── 3. Type system wiring ─────────────────────────────────────────── */

  const entityTypes = new Map(pkg.schema.entityTypes.map((t) => [t.id, t]));
  const relationships = new Map(pkg.schema.relationships.map((r) => [r.id, r]));
  const properties = new Map(pkg.schema.properties.map((p) => [p.id, p]));
  const entities = new Map(pkg.data.entities.map((e) => [e.id, e]));
  const sources = new Set(pkg.data.sources.map((s) => s.id));
  const evidenceIds = new Set(pkg.data.evidence.map((e) => e.id));
  const claims = new Map(pkg.data.claims.map((c) => [c.id, c]));

  for (const entity of pkg.data.entities) {
    if (!entityTypes.has(entity.type)) {
      add({
        code: "OO-G-UNKNOWN-ENTITY-TYPE",
        severity: unknownSeverity,
        objectId: entity.id,
        file: "entities",
        message: `Entity ${entity.id} has undeclared type ${entity.type}`,
        hint: `Declared types: ${[...entityTypes.keys()].join(", ") || "(none)"}`
      });
    }
    if (entity.supersededBy && !entities.has(entity.supersededBy)) {
      add({
        code: "OO-G-DANGLING-REF",
        severity: "error",
        objectId: entity.id,
        file: "entities",
        message: `Entity ${entity.id} is supersededBy unknown entity ${entity.supersededBy}`
      });
    }
  }

  for (const type of pkg.schema.entityTypes) {
    for (const parent of type.extends ?? []) {
      if (!entityTypes.has(parent)) {
        add({
          code: "OO-G-UNKNOWN-ENTITY-TYPE",
          severity: unknownSeverity,
          objectId: type.id,
          file: "entityTypes",
          message: `Entity type ${type.id} extends undeclared type ${parent}`
        });
      }
    }
  }

  for (const rel of pkg.schema.relationships) {
    for (const [side, list] of [
      ["from", rel.from],
      ["to", rel.to]
    ] as const) {
      for (const typeId of list) {
        if (!entityTypes.has(typeId)) {
          add({
            code: "OO-G-UNKNOWN-ENTITY-TYPE",
            severity: unknownSeverity,
            objectId: rel.id,
            file: "relationships",
            message: `Relationship ${rel.id} declares undeclared ${side} type ${typeId}`
          });
        }
      }
    }
    if (rel.inverse && !relationships.has(rel.inverse)) {
      add({
        code: "OO-G-UNKNOWN-PREDICATE",
        severity: unknownSeverity,
        objectId: rel.id,
        file: "relationships",
        message: `Relationship ${rel.id} declares undeclared inverse ${rel.inverse}`
      });
    }
  }

  /* ── 4. Claims: predicates, domain/range, datatypes, provenance ────── */

  for (const claim of pkg.data.claims) {
    const isRelationship = "entity" in claim.object;
    const rel = relationships.get(claim.predicate);
    const prop = properties.get(claim.predicate);
    const subjectEntity = entities.get(claim.subject);

    if (!subjectEntity) {
      add({
        code: "OO-G-DANGLING-REF",
        severity: "error",
        objectId: claim.id,
        file: "claims",
        message: `Claim ${claim.id} references unknown subject entity ${claim.subject}`
      });
    }

    if (!rel && !prop) {
      add({
        code: "OO-G-UNKNOWN-PREDICATE",
        severity: unknownSeverity,
        objectId: claim.id,
        file: "claims",
        message: `Claim ${claim.id} uses undeclared predicate ${claim.predicate}`,
        hint: "Declare it as a relationship type (entity object) or property (value object)"
      });
    }

    if (isRelationship && !rel) {
      if (prop && prop.type !== "entity-reference") {
        add({
          code: "OO-G-OBJECT-KIND",
          severity: "error",
          objectId: claim.id,
          file: "claims",
          message: `Claim ${claim.id} has an entity object but ${claim.predicate} is a ${prop.type} property`
        });
      }
    }
    if (!isRelationship && rel) {
      add({
        code: "OO-G-OBJECT-KIND",
        severity: "error",
        objectId: claim.id,
        file: "claims",
        message: `Claim ${claim.id} has a value object but ${claim.predicate} is a relationship type`,
        hint: "Relationship claims must use { entity: <id> }"
      });
    }

    if (isRelationship && rel) {
      const objectId = (claim.object as { entity: string }).entity;
      const objectEntity = entities.get(objectId);
      if (!objectEntity) {
        add({
          code: "OO-G-DANGLING-REF",
          severity: "error",
          objectId: claim.id,
          file: "claims",
          message: `Claim ${claim.id} references unknown object entity ${objectId}`
        });
      }
      if (subjectEntity && !rel.from.includes(subjectEntity.type)) {
        add({
          code: "OO-G-DOMAIN",
          severity: "error",
          objectId: claim.id,
          file: "claims",
          message: `Claim ${claim.id}: ${rel.id} does not accept subject type ${subjectEntity.type}`,
          hint: `Allowed: ${rel.from.join(", ")}`
        });
      }
      if (objectEntity && !rel.to.includes(objectEntity.type)) {
        add({
          code: "OO-G-RANGE",
          severity: "error",
          objectId: claim.id,
          file: "claims",
          message: `Claim ${claim.id}: ${rel.id} does not accept object type ${objectEntity.type}`,
          hint: `Allowed: ${rel.to.join(", ")}`
        });
      }
      if (rel.temporal && !claim.validTime?.from && !claim.observedAt) {
        add({
          code: "OO-G-TEMPORAL-MISSING",
          severity: "warning",
          objectId: claim.id,
          file: "claims",
          message: `Claim ${claim.id} uses temporal relationship ${rel.id} without validTime.from or observedAt`
        });
      }
    }

    if (!isRelationship && prop) {
      const value = (claim.object as { value: unknown; datatype?: ValueType }).value;
      const declared = (claim.object as { datatype?: ValueType }).datatype ?? prop.type;
      if (!datatypeMatches(value, declared)) {
        add({
          code: "OO-G-DATATYPE",
          severity: "error",
          objectId: claim.id,
          file: "claims",
          message: `Claim ${claim.id}: value ${JSON.stringify(value)} is not a valid ${declared}`
        });
      }
      if (prop.enum && !prop.enum.some((v) => JSON.stringify(v) === JSON.stringify(value))) {
        add({
          code: "OO-G-ENUM",
          severity: "error",
          objectId: claim.id,
          file: "claims",
          message: `Claim ${claim.id}: ${JSON.stringify(value)} is not an allowed value for ${prop.id}`,
          hint: `Allowed: ${prop.enum.map((v) => JSON.stringify(v)).join(", ")}`
        });
      }
    }

    // Provenance: R54 — a source, or an explicit first-party declaration.
    if ((claim.sources?.length ?? 0) === 0 && !claim.firstParty && claim.status !== "derived") {
      add({
        code: "OO-P-NO-SOURCE",
        severity: "error",
        objectId: claim.id,
        file: "claims",
        message: `Claim ${claim.id} has no source and is not marked firstParty`,
        hint: "Add sources: [<source-id>] or firstParty: true"
      });
    }
    for (const sourceId of claim.sources ?? []) {
      if (!sources.has(sourceId)) {
        add({
          code: "OO-G-DANGLING-REF",
          severity: "error",
          objectId: claim.id,
          file: "claims",
          message: `Claim ${claim.id} references unknown source ${sourceId}`
        });
      }
    }
    for (const evId of claim.evidence ?? []) {
      if (!evidenceIds.has(evId)) {
        add({
          code: "OO-G-DANGLING-REF",
          severity: "error",
          objectId: claim.id,
          file: "claims",
          message: `Claim ${claim.id} references unknown evidence ${evId}`
        });
      }
    }

    // R55 — agent-authored claims must be traceable to a run.
    if (claim.assertedBy.startsWith("agent:") && !claim.runId) {
      add({
        code: "OO-P-NO-RUN",
        severity: "error",
        objectId: claim.id,
        file: "claims",
        message: `Claim ${claim.id} was asserted by ${claim.assertedBy} but carries no runId`
      });
    }

    // R56 — derived claims must say what produced them.
    if (claim.status === "derived" && !claim.derivedFrom) {
      add({
        code: "OO-P-NO-DERIVATION",
        severity: "error",
        objectId: claim.id,
        file: "claims",
        message: `Derived claim ${claim.id} does not declare derivedFrom`
      });
    }

    for (const [field, target] of [
      ["supersedes", claim.supersedes],
      ["supersededBy", claim.supersededBy],
      ["disputes", claim.disputes]
    ] as const) {
      if (target && !claims.has(target)) {
        add({
          code: "OO-G-DANGLING-REF",
          severity: "error",
          objectId: claim.id,
          file: "claims",
          message: `Claim ${claim.id}.${field} points at unknown claim ${target}`
        });
      }
    }

    if (claim.validTime?.from && claim.validTime.to && claim.validTime.to < claim.validTime.from) {
      add({
        code: "OO-G-TEMPORAL-ORDER",
        severity: "error",
        objectId: claim.id,
        file: "claims",
        message: `Claim ${claim.id} has validTime.to before validTime.from`
      });
    }
  }

  /* ── 5. Evidence and source policy ─────────────────────────────────── */

  const sourceById = new Map(pkg.data.sources.map((s) => [s.id, s]));
  for (const ev of pkg.data.evidence) {
    const source = sourceById.get(ev.source);
    if (!source) {
      add({
        code: "OO-G-DANGLING-REF",
        severity: "error",
        objectId: ev.id,
        file: "evidence",
        message: `Evidence ${ev.id} references unknown source ${ev.source}`
      });
      continue;
    }
    if (ev.excerpt && ev.excerpt.length > maxExcerpt) {
      add({
        code: "OO-P-EXCERPT-LENGTH",
        severity: "policy",
        objectId: ev.id,
        file: "evidence",
        message: `Evidence ${ev.id} excerpt is ${ev.excerpt.length} chars, above the ${maxExcerpt} limit`,
        hint: "Shorten the excerpt or drop it and keep the selector"
      });
    }
    if (ev.excerpt && source.license === "unknown") {
      add({
        code: "OO-P-EXCERPT-LICENSE",
        severity: "policy",
        objectId: ev.id,
        file: "evidence",
        message: `Evidence ${ev.id} carries an excerpt from ${source.id}, whose license is unknown`,
        hint: "Record a license on the source, or keep only the selector"
      });
    }
    if (source.visibility === "private" && (ev.visibility ?? "public") === "public") {
      add({
        code: "OO-P-VISIBILITY",
        severity: "error",
        objectId: ev.id,
        file: "evidence",
        message: `Evidence ${ev.id} is public but its source ${source.id} is private`
      });
    }
  }

  for (const source of pkg.data.sources) {
    if (!source.stale) continue;
    const affected = pkg.data.claims.filter((claim) => claim.sources?.includes(source.id)).length;
    add({
      code: "OO-P-STALE-SOURCE",
      severity: "warning",
      objectId: source.id,
      file: "sources",
      message: `Source ${source.id} is marked stale; ${affected} claim(s) resting on it need re-verification`,
      hint: source.lastCheckedAt ? `Last checked ${source.lastCheckedAt}` : undefined
    });
  }

  /* ── 6. Declared constraints ───────────────────────────────────────── */

  const view: KnowledgeView = {
    entities,
    claims: pkg.data.claims,
    relationships,
    properties
  };

  for (const constraint of pkg.schema.constraints) {
    for (const finding of evaluateConstraint(constraint, view, pkg)) add(finding);
  }

  /* ── 7. Extension namespacing (strict) ─────────────────────────────── */

  if (strict) {
    const objectsWithExtensions: Array<{ id?: string; extensions?: Record<string, unknown> }> = [
      ...pkg.schema.entityTypes,
      ...pkg.schema.relationships,
      ...pkg.data.entities,
      ...pkg.data.claims
    ];
    for (const obj of objectsWithExtensions) {
      for (const key of Object.keys(obj.extensions ?? {})) {
        if (!key.includes(":") && !key.includes(".")) {
          add({
            code: "OO-S-EXTENSION-NS",
            severity: "error",
            objectId: obj.id,
            message: `Extension key ${JSON.stringify(key)} is not namespaced`,
            hint: "Use vendor:key or vendor.key to prevent future collisions"
          });
        }
      }
    }
  }

  if (options.expectedDigest && pkg.manifest.digest && options.expectedDigest !== pkg.manifest.digest) {
    add({
      code: "OO-S-DIGEST",
      severity: "error",
      objectId: pkg.manifest.id,
      message: `Manifest digest ${pkg.manifest.digest} does not match computed ${options.expectedDigest}`,
      hint: "Re-run `logicsrc ontology build` after editing package files"
    });
  }

  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0, policy: 0 };
  for (const finding of findings) counts[finding.severity] += 1;

  return {
    ok: counts.error === 0,
    findings,
    counts,
    checked: {
      entityTypes: pkg.schema.entityTypes.length,
      relationshipTypes: pkg.schema.relationships.length,
      entities: pkg.data.entities.length,
      claims: pkg.data.claims.length,
      sources: pkg.data.sources.length,
      evidence: pkg.data.evidence.length,
      constraints: pkg.schema.constraints.length,
      queries: pkg.schema.queries.length
    },
    digest: pkg.manifest.digest
  };
}

function evaluateConstraint(
  constraint: LoadedPackage["schema"]["constraints"][number],
  view: KnowledgeView,
  pkg: LoadedPackage
): Finding[] {
  const severity = constraint.severity ?? "error";
  const code = constraint.code ?? `OO-C-${constraint.rule.type.toUpperCase()}`;
  const out: Finding[] = [];
  const live = (claim: Claim) => claim.status === "asserted" || claim.status === "derived";

  const fail = (message: string, objectId?: string) => {
    out.push({
      code,
      severity,
      objectId,
      file: "constraints",
      message: `${constraint.id}: ${message}`,
      hint: constraint.remediation
    });
  };

  switch (constraint.rule.type) {
    case "required-predicate": {
      const { entityType, predicate } = constraint.rule;
      for (const entity of pkg.data.entities) {
        if (entity.type !== entityType) continue;
        if (entity.status && entity.status !== "active") continue;
        const has = pkg.data.claims.some(
          (c) => live(c) && c.subject === entity.id && c.predicate === predicate
        );
        if (!has) fail(`entity ${entity.id} is missing required predicate ${predicate}`, entity.id);
      }
      break;
    }
    case "cardinality": {
      const { predicate, entityType, min, max } = constraint.rule;
      const bySubject = new Map<string, number>();
      for (const claim of pkg.data.claims) {
        if (!live(claim) || claim.predicate !== predicate) continue;
        bySubject.set(claim.subject, (bySubject.get(claim.subject) ?? 0) + 1);
      }
      for (const entity of pkg.data.entities) {
        if (entityType && entity.type !== entityType) continue;
        const count = bySubject.get(entity.id) ?? 0;
        if (min !== undefined && count < min) {
          fail(`entity ${entity.id} has ${count} ${predicate} claims, below the minimum of ${min}`, entity.id);
        }
        if (max !== undefined && count > max) {
          fail(`entity ${entity.id} has ${count} ${predicate} claims, above the maximum of ${max}`, entity.id);
        }
      }
      break;
    }
    case "unique": {
      const { predicate } = constraint.rule;
      const byValue = new Map<string, string[]>();
      for (const claim of pkg.data.claims) {
        if (!live(claim) || claim.predicate !== predicate) continue;
        const key = "entity" in claim.object ? claim.object.entity : JSON.stringify(claim.object.value);
        byValue.set(key, [...(byValue.get(key) ?? []), claim.subject]);
      }
      for (const [key, subjects] of byValue) {
        if (subjects.length > 1) {
          fail(`${predicate} value ${key} is shared by ${subjects.length} entities: ${subjects.join(", ")}`);
        }
      }
      break;
    }
    case "allowed-values": {
      const { predicate, values } = constraint.rule;
      const allowed = values.map((v) => JSON.stringify(v));
      for (const claim of pkg.data.claims) {
        if (!live(claim) || claim.predicate !== predicate) continue;
        if ("entity" in claim.object) continue;
        if (!allowed.includes(JSON.stringify(claim.object.value))) {
          fail(`claim ${claim.id} has disallowed value ${JSON.stringify(claim.object.value)}`, claim.id);
        }
      }
      break;
    }
    case "domain-range": {
      const { predicate, from, to } = constraint.rule;
      for (const claim of pkg.data.claims) {
        if (!live(claim) || claim.predicate !== predicate) continue;
        const subject = view.entities.get(claim.subject);
        if (from && subject && !from.includes(subject.type)) {
          fail(`claim ${claim.id} subject type ${subject.type} is outside the declared domain`, claim.id);
        }
        if (to && "entity" in claim.object) {
          const object = view.entities.get(claim.object.entity);
          if (object && !to.includes(object.type)) {
            fail(`claim ${claim.id} object type ${object.type} is outside the declared range`, claim.id);
          }
        }
      }
      break;
    }
    case "temporal-bounds": {
      const { predicate, notBefore, notAfter, requireValidFrom } = constraint.rule;
      for (const claim of pkg.data.claims) {
        if (!live(claim) || claim.predicate !== predicate) continue;
        const from = claim.validTime?.from ?? undefined;
        if (requireValidFrom && !from) {
          fail(`claim ${claim.id} is missing validTime.from`, claim.id);
        }
        if (from && notBefore && from < notBefore) {
          fail(`claim ${claim.id} starts ${from}, before the allowed ${notBefore}`, claim.id);
        }
        const to = claim.validTime?.to ?? undefined;
        if (to && notAfter && to > notAfter) {
          fail(`claim ${claim.id} ends ${to}, after the allowed ${notAfter}`, claim.id);
        }
      }
      break;
    }
    case "query": {
      const rule = constraint.rule;
      const saved = pkg.schema.queries.find((q) => q.id === rule.query);
      if (!saved) {
        out.push({
          code: "OO-C-UNKNOWN-QUERY",
          severity: "error",
          objectId: constraint.id,
          file: "constraints",
          message: `${constraint.id}: references unknown saved query ${rule.query}`
        });
        break;
      }
      const expect = rule.expect ?? "empty";
      const result = evaluateQuery(view, saved.query);
      if (expect === "empty" && result.rows.length > 0) {
        fail(`query ${saved.id} returned ${result.rows.length} violating row(s)`);
      }
      if (expect === "non-empty" && result.rows.length === 0) {
        fail(`query ${saved.id} returned no rows but was expected to`);
      }
      break;
    }
    default:
      break;
  }

  return out;
}

function datatypeMatches(value: unknown, type: ValueType): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case "date-time":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "duration":
      return typeof value === "string" && /^P/.test(value);
    case "url":
      return typeof value === "string" && /^[a-z][a-z0-9+.-]*:/i.test(value);
    case "email":
      return typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
    case "enum":
      return value !== undefined && value !== null;
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "binary-reference":
      return typeof value === "string";
    case "entity-reference":
      return typeof value === "string";
    default:
      return true;
  }
}

/* ── Report rendering ──────────────────────────────────────────────────── */

export type ReportFormat = "text" | "json" | "yaml" | "markdown";

export function renderReport(report: ValidationReport, format: ReportFormat = "text"): string {
  if (format === "json") return JSON.stringify(report, null, 2);

  if (format === "yaml") {
    const lines = [
      `ok: ${report.ok}`,
      "counts:",
      ...Object.entries(report.counts).map(([k, v]) => `  ${k}: ${v}`),
      "findings:"
    ];
    for (const f of report.findings) {
      lines.push(`  - code: ${f.code}`);
      lines.push(`    severity: ${f.severity}`);
      lines.push(`    message: ${JSON.stringify(f.message)}`);
      if (f.objectId) lines.push(`    objectId: ${f.objectId}`);
      if (f.file) lines.push(`    file: ${f.file}`);
      if (f.path) lines.push(`    path: ${f.path}`);
      if (f.hint) lines.push(`    hint: ${JSON.stringify(f.hint)}`);
    }
    return lines.join("\n");
  }

  if (format === "markdown") {
    const lines = [
      `# Validation ${report.ok ? "passed" : "failed"}`,
      "",
      `- errors: ${report.counts.error}`,
      `- warnings: ${report.counts.warning}`,
      `- policy: ${report.counts.policy}`,
      `- info: ${report.counts.info}`,
      ""
    ];
    if (report.findings.length > 0) {
      lines.push("| severity | code | object | message |", "| --- | --- | --- | --- |");
      for (const f of report.findings) {
        lines.push(`| ${f.severity} | ${f.code} | ${f.objectId ?? ""} | ${f.message.replace(/\|/g, "\\|")} |`);
      }
    }
    return lines.join("\n");
  }

  const lines: string[] = [];
  const tick = (label: string, n: number) => `  ✓ ${n} ${label}`;
  lines.push(tick("entity types", report.checked.entityTypes));
  lines.push(tick("relationship types", report.checked.relationshipTypes));
  lines.push(tick("entities", report.checked.entities));
  lines.push(tick("claims", report.checked.claims));
  lines.push(tick("sources", report.checked.sources));
  lines.push(tick("evidence records", report.checked.evidence));
  lines.push(tick("constraints", report.checked.constraints));

  for (const f of report.findings) {
    const mark = f.severity === "error" ? "✗" : f.severity === "warning" ? "!" : "·";
    lines.push(`  ${mark} [${f.severity}] ${f.code} ${f.message}${f.hint ? `\n      hint: ${f.hint}` : ""}`);
  }

  lines.push(
    report.ok
      ? "OpenOntology package is valid."
      : `OpenOntology package is INVALID (${report.counts.error} error(s), ${report.counts.warning} warning(s)).`
  );
  return lines.join("\n");
}
