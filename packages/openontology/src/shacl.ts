import { packagePrefix, OO } from "./jsonld.js";
import type { BuiltPackage, Constraint, LoadedPackage } from "./types.js";

/**
 * SHACL mapping for the constraint kinds whose semantics genuinely match.
 *
 * Four of the seven map cleanly onto node/property shapes. `unique` and the
 * query-based checks do not — SHACL has no portable "this value appears once
 * across the graph" without SPARQL constraints, and an OpenOntology saved
 * query is not a SPARQL query. Those are reported as unmapped rather than
 * approximated, because a shape that silently means something else is worse
 * than no shape at all.
 */

export interface ShaclExport {
  turtle: string;
  mapped: Array<{ constraint: string; shape: string }>;
  unmapped: Array<{ constraint: string; rule: string; reason: string }>;
}

export function constraintsToShacl(pkg: BuiltPackage | LoadedPackage): ShaclExport {
  const manifest = pkg.manifest;
  const ns = manifest.namespace.endsWith("/") ? manifest.namespace : `${manifest.namespace}/`;
  const prefix = packagePrefix(pkg);

  const mapped: ShaclExport["mapped"] = [];
  const unmapped: ShaclExport["unmapped"] = [];
  const body: string[] = [];

  const shapeName = (constraint: Constraint) =>
    `ns:${toPascal(constraint.id)}Shape`;

  for (const constraint of pkg.schema.constraints) {
    const severity = shaclSeverity(constraint.severity ?? "error");
    const shape = shapeName(constraint);
    const rule = constraint.rule;

    switch (rule.type) {
      case "required-predicate": {
        body.push(
          `${shape}`,
          `    a sh:NodeShape ;`,
          `    sh:targetClass ns:${rule.entityType} ;`,
          `    rdfs:comment ${JSON.stringify(constraint.description)} ;`,
          `    sh:property [`,
          `        sh:path ns:${rule.predicate} ;`,
          `        sh:minCount 1 ;`,
          `        sh:severity ${severity} ;`,
          `        sh:message ${JSON.stringify(constraint.description)} ;`,
          `    ] .`,
          ""
        );
        mapped.push({ constraint: constraint.id, shape });
        break;
      }

      case "cardinality": {
        const counts = [
          rule.min !== undefined ? `        sh:minCount ${rule.min} ;` : null,
          rule.max !== undefined ? `        sh:maxCount ${rule.max} ;` : null
        ].filter(Boolean) as string[];
        body.push(
          `${shape}`,
          `    a sh:NodeShape ;`,
          rule.entityType ? `    sh:targetClass ns:${rule.entityType} ;` : `    sh:targetSubjectsOf ns:${rule.predicate} ;`,
          `    rdfs:comment ${JSON.stringify(constraint.description)} ;`,
          `    sh:property [`,
          `        sh:path ns:${rule.predicate} ;`,
          ...counts,
          `        sh:severity ${severity} ;`,
          `        sh:message ${JSON.stringify(constraint.description)} ;`,
          `    ] .`,
          ""
        );
        mapped.push({ constraint: constraint.id, shape });
        break;
      }

      case "allowed-values": {
        body.push(
          `${shape}`,
          `    a sh:NodeShape ;`,
          `    sh:targetSubjectsOf ns:${rule.predicate} ;`,
          `    rdfs:comment ${JSON.stringify(constraint.description)} ;`,
          `    sh:property [`,
          `        sh:path ns:${rule.predicate} ;`,
          `        sh:in (${rule.values.map((value) => JSON.stringify(String(value))).join(" ")}) ;`,
          `        sh:severity ${severity} ;`,
          `        sh:message ${JSON.stringify(constraint.description)} ;`,
          `    ] .`,
          ""
        );
        mapped.push({ constraint: constraint.id, shape });
        break;
      }

      case "domain-range": {
        const lines = [`${shape}`, `    a sh:NodeShape ;`];
        lines.push(`    sh:targetSubjectsOf ns:${rule.predicate} ;`);
        lines.push(`    rdfs:comment ${JSON.stringify(constraint.description)} ;`);
        if (rule.from?.length) {
          lines.push(
            `    sh:or (${rule.from.map((type) => `[ sh:class ns:${type} ]`).join(" ")}) ;`
          );
        }
        if (rule.to?.length) {
          lines.push(
            `    sh:property [`,
            `        sh:path ns:${rule.predicate} ;`,
            `        sh:or (${rule.to.map((type) => `[ sh:class ns:${type} ]`).join(" ")}) ;`,
            `        sh:severity ${severity} ;`,
            `    ] ;`
          );
        }
        lines.push(`    sh:severity ${severity} .`, "");
        body.push(...lines);
        mapped.push({ constraint: constraint.id, shape });
        break;
      }

      case "temporal-bounds": {
        const props: string[] = [];
        if (rule.notBefore) props.push(`        sh:minInclusive ${JSON.stringify(rule.notBefore)} ;`);
        if (rule.notAfter) props.push(`        sh:maxInclusive ${JSON.stringify(rule.notAfter)} ;`);
        if (rule.requireValidFrom) props.push(`        sh:minCount 1 ;`);
        if (props.length === 0) {
          unmapped.push({
            constraint: constraint.id,
            rule: rule.type,
            reason: "temporal-bounds with no bounds has nothing to express"
          });
          break;
        }
        body.push(
          `${shape}`,
          `    a sh:NodeShape ;`,
          `    sh:targetObjectsOf ns:${rule.predicate} ;`,
          `    rdfs:comment ${JSON.stringify(constraint.description)} ;`,
          `    sh:property [`,
          `        sh:path oo:validFrom ;`,
          ...props,
          `        sh:severity ${severity} ;`,
          `    ] .`,
          ""
        );
        mapped.push({ constraint: constraint.id, shape });
        break;
      }

      case "unique":
        unmapped.push({
          constraint: constraint.id,
          rule: rule.type,
          reason:
            "graph-wide uniqueness has no portable SHACL Core equivalent; it needs a sh:SPARQLConstraint"
        });
        break;

      case "query":
        unmapped.push({
          constraint: constraint.id,
          rule: rule.type,
          reason: "an OpenOntology saved query is a triple-pattern AST, not SPARQL"
        });
        break;

      default:
        unmapped.push({ constraint: (constraint as Constraint).id, rule: "unknown", reason: "unrecognized rule type" });
    }
  }

  const header = [
    "@prefix sh: <http://www.w3.org/ns/shacl#> .",
    "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
    "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
    `@prefix oo: <${OO}> .`,
    `@prefix ns: <${ns}> .`,
    "",
    `# SHACL shapes generated from ${manifest.id}@${manifest.version} (compact prefix: ${prefix})`,
    `# ${mapped.length} constraint(s) mapped, ${unmapped.length} not mappable to SHACL Core.`,
    ...unmapped.map((entry) => `# unmapped: ${entry.constraint} (${entry.rule}) — ${entry.reason}`),
    ""
  ];

  return {
    turtle: `${[...header, ...body].join("\n").trimEnd()}\n`,
    mapped,
    unmapped
  };
}

function shaclSeverity(severity: string): string {
  switch (severity) {
    case "warning":
      return "sh:Warning";
    case "info":
    case "policy":
      return "sh:Info";
    default:
      return "sh:Violation";
  }
}

function toPascal(id: string): string {
  return id
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}
