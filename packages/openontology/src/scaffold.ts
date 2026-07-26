import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify as toYaml } from "yaml";
import { OPENONTOLOGY_VERSION } from "./types.js";
import type { Claim, Entity, EntityType, RelationshipType, SavedQuery, Source } from "./types.js";

export interface InitOptions {
  id: string;
  name?: string;
  namespace?: string;
  maintainer?: string;
  license?: string;
  /** Pinned so `init` output is byte-identical across runs and runtimes. */
  now?: string;
}

export interface InitResult {
  dir: string;
  files: string[];
  counts: { entityTypes: number; relationshipTypes: number; entities: number; claims: number; sources: number };
}

/**
 * Create a starter package that passes `validate --strict` with no edits.
 *
 * The shape is deliberately tiny — three types, three relationships, eight
 * entities, fourteen claims — so a newcomer can read the whole thing in a
 * minute and still see temporal claims, provenance, and a saved query.
 */
export function initOntologyPackage(dir: string, options: InitOptions): InitResult {
  const now = options.now ?? new Date().toISOString();
  const id = options.id;
  const name = options.name ?? titleize(id);
  const namespace = options.namespace ?? `https://logicsrc.com/ontology/${id}/`;
  const maintainer = options.maintainer ?? "urn:logicsrc:local";
  const prefix = id.split("-")[0] as string;

  // Binds the compact prefix to the namespace, so ids survive an IRI round trip.
  const namespaces = [
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "Namespace" as const,
      prefix,
      uri: namespace,
      description: `Compact id prefix for ${name}.`
    }
  ];

  const entityTypes: EntityType[] = [
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "EntityType",
      id: "Person",
      label: "Person",
      description: "A human participant.",
      keyProperties: ["canonicalName"],
      properties: { role: { type: "string", description: "Current role, if known." } }
    },
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "EntityType",
      id: "Organization",
      label: "Organization",
      description: "A company, foundation, working group, or other collective."
    },
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "EntityType",
      id: "Project",
      label: "Project",
      description: "A named body of work that people and organizations contribute to.",
      properties: { homepage: { type: "url", description: "Canonical project URL." } }
    }
  ];

  const relationships: RelationshipType[] = [
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "RelationshipType",
      id: "worksAt",
      label: "works at",
      description: "A person is affiliated with an organization.",
      from: ["Person"],
      to: ["Organization"],
      cardinality: "many-to-many",
      temporal: true
    },
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "RelationshipType",
      id: "worksOn",
      label: "works on",
      description: "A person actively contributes work to a project.",
      from: ["Person"],
      to: ["Project"],
      cardinality: "many-to-many",
      temporal: true,
      inverse: "hasContributor"
    },
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "RelationshipType",
      id: "hasContributor",
      label: "has contributor",
      description: "Inverse of worksOn.",
      from: ["Project"],
      to: ["Person"],
      cardinality: "many-to-many",
      inverse: "worksOn"
    },
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "RelationshipType",
      id: "maintains",
      label: "maintains",
      description: "An organization is responsible for a project.",
      from: ["Organization"],
      to: ["Project"],
      cardinality: "one-to-many"
    }
  ];

  const properties = [
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "Property" as const,
      id: "homepage",
      label: "homepage",
      description: "Canonical URL for a project.",
      type: "url" as const
    },
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "Property" as const,
      id: "role",
      label: "role",
      description: "A person's stated role.",
      type: "string" as const
    }
  ];

  const person = (slug: string, canonicalName: string): Entity => ({
    openontology: OPENONTOLOGY_VERSION,
    kind: "Entity",
    id: `${prefix}:person:${slug}`,
    type: "Person",
    canonicalName,
    createdAt: now,
    createdBy: maintainer
  });
  const org = (slug: string, canonicalName: string): Entity => ({
    openontology: OPENONTOLOGY_VERSION,
    kind: "Entity",
    id: `${prefix}:org:${slug}`,
    type: "Organization",
    canonicalName,
    createdAt: now,
    createdBy: maintainer
  });
  const project = (slug: string, canonicalName: string): Entity => ({
    openontology: OPENONTOLOGY_VERSION,
    kind: "Entity",
    id: `${prefix}:project:${slug}`,
    type: "Project",
    canonicalName,
    createdAt: now,
    createdBy: maintainer
  });

  const entities: Entity[] = [
    person("alice", "Alice Reyes"),
    person("bob", "Bob Nakamura"),
    person("carol", "Carol Okonkwo"),
    org("northwind", "Northwind Labs"),
    org("bluebird", "Bluebird Foundation"),
    project("zk-prover", "ZK Prover"),
    project("ledger-indexer", "Ledger Indexer"),
    project("docs-portal", "Docs Portal")
  ];

  const sources: Source[] = [
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "Source",
      id: `${prefix}:source:team-page`,
      sourceType: "web-page",
      uri: "https://example.org/team",
      title: "Team page",
      publisher: "example.org",
      retrievedAt: now,
      mediaType: "text/html",
      license: "CC-BY-4.0"
    },
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "Source",
      id: `${prefix}:source:repo`,
      sourceType: "git-commit",
      uri: "https://example.org/repo/commit/0000000",
      title: "Repository commit",
      publisher: "example.org",
      retrievedAt: now,
      mediaType: "text/plain",
      license: "MIT"
    }
  ];

  let claimSeq = 0;
  const nextClaimId = () => `${prefix}:claim:${String(++claimSeq).padStart(4, "0")}`;

  const rel = (
    subject: string,
    predicate: string,
    object: string,
    extra: Partial<Claim> = {}
  ): Claim => ({
    openontology: OPENONTOLOGY_VERSION,
    kind: "Claim",
    id: nextClaimId(),
    ontology: `${id}@0.1.0`,
    subject: `${prefix}:${subject}`,
    predicate,
    object: { entity: `${prefix}:${object}` },
    status: "asserted",
    confidence: 0.9,
    validTime: { from: "2026-01-01T00:00:00Z", to: null },
    assertedAt: now,
    assertedBy: maintainer,
    sources: [`${prefix}:source:team-page`],
    ...extra
  });

  const value = (subject: string, predicate: string, val: unknown): Claim => ({
    openontology: OPENONTOLOGY_VERSION,
    kind: "Claim",
    id: nextClaimId(),
    ontology: `${id}@0.1.0`,
    subject: `${prefix}:${subject}`,
    predicate,
    object: { value: val },
    status: "asserted",
    assertedAt: now,
    assertedBy: maintainer,
    firstParty: true
  });

  const claims: Claim[] = [
    rel("person:alice", "worksAt", "org:northwind"),
    rel("person:bob", "worksAt", "org:northwind"),
    rel("person:carol", "worksAt", "org:bluebird"),
    rel("person:alice", "worksOn", "project:zk-prover"),
    rel("person:bob", "worksOn", "project:zk-prover"),
    rel("person:bob", "worksOn", "project:ledger-indexer"),
    rel("person:carol", "worksOn", "project:docs-portal"),
    rel("org:northwind", "maintains", "project:zk-prover", { validTime: undefined }),
    rel("org:northwind", "maintains", "project:ledger-indexer", { validTime: undefined }),
    rel("org:bluebird", "maintains", "project:docs-portal", { validTime: undefined }),
    value("project:zk-prover", "homepage", "https://example.org/zk-prover"),
    value("project:ledger-indexer", "homepage", "https://example.org/ledger-indexer"),
    value("project:docs-portal", "homepage", "https://example.org/docs-portal"),
    value("person:alice", "role", "Protocol engineer")
  ];

  const queries: SavedQuery[] = [
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "SavedQuery",
      id: "contributors",
      label: "Contributors by project",
      description: "Every person actively working on a project, with the organization they work at.",
      query: {
        match: [
          { subject: "?person", predicate: "worksOn", object: "?project" },
          { subject: "?person", predicate: "worksAt", object: "?org" }
        ],
        select: ["?person", "?project", "?org"],
        include: { claimStatus: ["asserted"], labels: true },
        orderBy: [{ variable: "?person", direction: "asc" }]
      }
    }
  ];

  const constraints = [
    {
      openontology: OPENONTOLOGY_VERSION,
      kind: "Constraint" as const,
      id: "project-has-homepage",
      description: "Every project should record a homepage so readers can verify it exists.",
      severity: "warning" as const,
      remediation: "Add a homepage claim for the project.",
      rule: { type: "required-predicate" as const, entityType: "Project", predicate: "homepage" }
    }
  ];

  const manifest = {
    openontology: OPENONTOLOGY_VERSION,
    kind: "OntologyPackage",
    id,
    name,
    version: "0.1.0",
    namespace,
    description: `${name} — a starter OpenOntology package.`,
    license: options.license ?? "CC-BY-4.0",
    maintainers: [{ id: maintainer }],
    imports: [],
    schema: {
      namespaces: "schema/namespaces.yaml",
      entityTypes: "schema/entity-types.yaml",
      properties: "schema/properties.yaml",
      relationships: "schema/relationships.yaml",
      constraints: "schema/constraints.yaml",
      queries: "schema/queries.yaml"
    },
    data: {
      entities: "data/entities.ndjson",
      claims: "data/claims.ndjson",
      sources: "data/sources.ndjson"
    }
  };

  mkdirSync(join(dir, "schema"), { recursive: true });
  mkdirSync(join(dir, "data"), { recursive: true });

  const written: string[] = [];
  const writeYaml = (relPath: string, value_: unknown) => {
    writeFileSync(join(dir, relPath), toYaml(value_, { lineWidth: 100 }), "utf8");
    written.push(relPath);
  };
  const writeNdjson = (relPath: string, rows: unknown[]) => {
    writeFileSync(join(dir, relPath), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
    written.push(relPath);
  };

  writeYaml("openontology.yaml", manifest);
  writeYaml("schema/namespaces.yaml", namespaces);
  writeYaml("schema/entity-types.yaml", entityTypes);
  writeYaml("schema/properties.yaml", properties);
  writeYaml("schema/relationships.yaml", relationships);
  writeYaml("schema/constraints.yaml", constraints);
  writeYaml("schema/queries.yaml", queries);
  writeNdjson("data/entities.ndjson", entities);
  writeNdjson("data/claims.ndjson", claims);
  writeNdjson("data/sources.ndjson", sources);

  writeFileSync(join(dir, "README.md"), readme(id, name), "utf8");
  written.push("README.md");

  return {
    dir,
    files: written,
    counts: {
      entityTypes: entityTypes.length,
      relationshipTypes: relationships.length,
      entities: entities.length,
      claims: claims.length,
      sources: sources.length
    }
  };
}

function titleize(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readme(id: string, name: string): string {
  return `# ${name}

A [LogicSRC OpenOntology](https://logicsrc.com/openontology) package.

\`\`\`bash
logicsrc ontology validate . --strict
logicsrc ontology query run contributors --format table
logicsrc ontology query explain contributors --row 0 --format markdown
\`\`\`

## Layout

| Path | What it holds |
| --- | --- |
| \`openontology.yaml\` | Package identity, namespace, license, and file map |
| \`schema/\` | Entity types, properties, relationship types, constraints, saved queries |
| \`data/\` | Entities, claims, and sources as newline-delimited JSON |

## Model

Five nouns are enough to read everything here:

- **Type** — what kind of thing something is (\`Person\`, \`Organization\`, \`Project\`)
- **Entity** — a specific thing with a stable id (\`${id.split("-")[0]}:person:alice\`)
- **Claim** — a typed statement about an entity, or between two entities
- **Source** — where the claim came from
- **Change set** — a reviewable proposal to add, correct, merge, dispute, or retract

Claims are append-only. Corrections are expressed as a dispute, retraction, or
supersession, so the record of what was believed and when is never overwritten.
`;
}
