---
openprd: "0.2"
id: "0001"
title: Add the LogicSRC OpenOntology specification
status: Draft
authors:
  - anthony@profullstack.com
repo: profullstack/logicsrc
created: 2026-07-26
updated: 2026-07-26
tags:
  - openontology
  - ontology
  - knowledge-graph
  - agents
  - mcp
  - schemas
---

# Add the LogicSRC OpenOntology specification

## Problem

AI agents can search documents, call tools, and generate text, but most agent systems still lack a portable, explicit model of the domain in which they operate. Important facts are scattered across Markdown, chats, tickets, APIs, databases, source code, and model context. Each agent must repeatedly infer what a person, organization, project, repository, protocol, task, or policy means and how those objects relate.

This creates recurring failures:

- the same real-world object is represented under multiple names or IDs;
- relationships are buried in prose rather than expressed as typed, queryable facts;
- agents cannot reliably distinguish current facts from historical, disputed, inferred, or retracted facts;
- sources, evidence, confidence, and authorship are lost after extraction;
- model-generated statements can silently become application state;
- every product invents a different graph, query, provenance, permission, and audit format;
- ontology implementations become tied to a particular graph database, model provider, or proprietary platform;
- humans cannot easily review what an agent proposes to add, merge, retract, or change.

LogicSRC already defines open coordination contracts for identities, agents, runs, permissions, events, plugins, tasks, and value exchange. It needs a complementary standard for representing durable domain knowledge that those humans and agents can share.

**LogicSRC OpenOntology** will define a provider-neutral, storage-agnostic contract for:

1. describing entity types, properties, relationship types, constraints, queries, and governed actions;
2. representing real entities and source-backed claims about them;
3. preserving provenance, temporal history, confidence, disputes, retractions, and supersession;
4. querying and explaining the resulting knowledge graph;
5. proposing, reviewing, approving, and applying ontology changes;
6. exposing the same contract through JSON Schema, CLI, SDK, MCP, REST, TUI, PWA, and event streams.

The motivating example is an open map of an ecosystem such as Ethereum: people, organizations, projects, codebases, research topics, protocols, networks, applications, funding programs, and the typed relationships among them. The specification must remain domain-neutral so the same primitives work for software projects, companies, research communities, customer operations, security data, infrastructure, or personal knowledge systems.

OpenOntology is a **LogicSRC standards surface**, not a new proprietary hosted graph product. Reference implementations prove the contract, but no database, AI provider, or hosted service owns the standard.

## Goals

1. Define a small, understandable, machine-readable ontology format that is useful without requiring RDF, OWL, SPARQL, Neo4j, or a specific AI platform.
2. Make entity identity, relationship meaning, provenance, confidence, valid time, and change history explicit instead of leaving them implicit in prose.
3. Let humans and AI agents query the same domain model through deterministic, auditable interfaces.
4. Make agent-generated knowledge safe by separating **proposal**, **review**, **approval**, and **application**.
5. Preserve facts as append-only claims so corrections create new history rather than silently rewriting the past.
6. Use JSON Schema as the LogicSRC contract source while supporting friendly YAML authoring and interoperable JSON-LD export.
7. Keep the specification storage-agnostic while shipping a practical SQLite/Turso reference engine that runs locally and on Railway.
8. Integrate OpenOntology with existing LogicSRC identities, permissions, agent runs, events, plugins, MCP resources, CLI conventions, TUI, and PWA.
9. Support reusable, versioned ontology packages that communities can publish, fork, extend, validate, diff, and migrate.
10. Ship an Ethereum ecosystem example that demonstrates people, organizations, projects, codebases, research directions, protocols, L2s, and DeFi applications without coupling the core standard to Ethereum.
11. Provide interoperability paths to JSON-LD, RDF, SHACL, PROV-O, external IDs, and existing knowledge-graph systems.
12. Make every important answer explainable: a consumer must be able to inspect which claims, sources, rules, and agent runs produced it.

## Non-Goals

1. OpenOntology will not attempt to define one universal ontology for every domain.
2. OpenOntology v0.1 will not implement a complete OWL reasoner or every feature of RDF, RDFS, OWL, SHACL, SPARQL, Cypher, or Datalog.
3. OpenOntology will not require a graph database; relational, document, in-memory, and graph-backed implementations may conform.
4. OpenOntology will not make vector embeddings or LLM output authoritative. Embeddings may improve discovery, but canonical facts remain explicit claims.
5. OpenOntology will not autonomously crawl the entire public web or publish extracted claims without review policy.
6. OpenOntology will not replace source systems of record. It provides a semantic and provenance layer that may reference or synchronize with them.
7. OpenOntology will not store model chain-of-thought. It stores inputs, outputs, evidence, tool calls, policy decisions, and concise explanations needed for audit.
8. OpenOntology will not expose secrets or private source content in public packages, logs, exports, embeddings, or screenshots.
9. OpenOntology will not require CoinPay, CommandBoard, uGig, c0mpute, or any other LogicSRC plugin, although compatible implementations may use them.
10. OpenOntology will not let `--yolo`, unattended mode, or model confidence bypass explicit approval requirements for high-risk mutations.
11. OpenOntology v0.1 will not provide a decentralized consensus protocol for resolving contradictory public claims.
12. OpenOntology will not claim compatibility with another project merely because it uses the words “open” and “ontology”; compatibility must be implemented and tested explicitly.

## Users

### Ontology authors

Developers, domain experts, standards groups, and community maintainers who define entity types, relationship types, constraints, saved queries, mappings, and package versions.

### Knowledge curators

Humans who add entities, review evidence, resolve duplicates, approve merges, dispute claims, retract incorrect facts, and maintain data quality.

### Agent developers

Developers building agents that need stable domain context, deterministic queries, typed tool boundaries, durable memory, and auditable write behavior.

### Agents and agent runtimes

Provider-neutral AI agents that read ontology resources, run queries, propose claims, create change sets, invoke approved actions, and record LogicSRC run/event references.

### Application developers

Teams building CLIs, PWAs, dashboards, search tools, workflow systems, research maps, recommendation systems, and APIs on top of a shared ontology contract.

### Domain communities

Open-source ecosystems, research groups, standards bodies, companies, and public-interest projects that want a collaborative map of people, organizations, projects, code, topics, products, and activity.

### Operators and security reviewers

People responsible for access control, auditability, retention, source licensing, privacy, approval policy, backups, imports, exports, and incident response.

### Data integrators

Teams mapping GitHub, CSV, JSON, databases, APIs, RDF, JSON-LD, and other systems into or out of OpenOntology packages.

## Requirements

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** describe intended conformance behavior. OpenOntology remains a draft until accepted through the LogicSRC/OpenPRD process.

### Product and specification identity

- **R1 [P0]** The specification MUST be named **LogicSRC OpenOntology** and use the slug `openontology`.
- **R2 [P0]** The canonical CLI namespace MUST be `logicsrc ontology` rather than a standalone proprietary command.
- **R3 [P0]** The canonical TypeScript package MUST be `@logicsrc/openontology`.
- **R4 [P0]** The public website MUST expose `/openontology` and the documentation MUST expose a stable OpenOntology specification page.
- **R5 [P0]** The specification MUST state that it is storage-agnostic, model-provider-neutral, and usable without a hosted LogicSRC account.
- **R6 [P0]** Reference implementations MUST be clearly labeled as implementations of the standard rather than the definition of the standard.
- **R7 [P1]** Public branding SHOULD consistently use “LogicSRC OpenOntology” to reduce confusion with unrelated projects using similar names.

### Layered conceptual model

OpenOntology has four layers:

1. **Schema layer** — ontology manifest, namespaces, entity types, property definitions, relationship types, constraints, query definitions, action definitions, mappings, and imports.
2. **Knowledge layer** — entities, claims, sources, evidence, aliases, external IDs, disputes, retractions, and derived/materialized views.
3. **Governance layer** — change sets, reviews, approvals, policies, permissions, signatures, versions, migrations, and audit events.
4. **Runtime layer** — queries, explanations, ingestion proposals, governed actions, LogicSRC agent runs, APIs, MCP, CLI, SDK, TUI, PWA, and events.

- **R8 [P0]** A conforming implementation MUST distinguish schema objects from knowledge instances and governance records.
- **R9 [P0]** A conforming implementation MUST preserve stable IDs across labels, aliases, package moves, and normal edits.
- **R10 [P0]** A conforming implementation MUST be able to return the ontology schema separately from the populated knowledge graph.
- **R11 [P0]** A conforming implementation MUST be able to export a package without including private runtime state or credentials.

### Canonical package manifest

Every package begins with `openontology.yaml` or a canonical JSON equivalent.

```yaml
openontology: "0.1"
kind: OntologyPackage
id: ethereum-ecosystem
name: Ethereum Ecosystem Ontology
version: 0.1.0
namespace: "https://logicsrc.com/ontology/ethereum/"
description: >-
  An open map of people, organizations, projects, codebases,
  research topics, protocols, networks, and applications.
license: CC-BY-4.0
maintainers:
  - id: "mailto:anthony@profullstack.com"
imports: []
schema:
  entityTypes: schema/entity-types.yaml
  properties: schema/properties.yaml
  relationships: schema/relationships.yaml
  constraints: schema/constraints.yaml
  queries: schema/queries.yaml
  actions: schema/actions.yaml
data:
  entities: data/entities.ndjson
  claims: data/claims.ndjson
  sources: data/sources.ndjson
context: mappings/context.jsonld
```

- **R12 [P0]** Every package manifest MUST declare `openontology`, `kind`, `id`, `name`, `version`, `namespace`, `description`, `license`, and at least one maintainer.
- **R13 [P0]** Package versions MUST use semantic versioning.
- **R14 [P0]** Package IDs MUST be lowercase kebab-case and globally disambiguated by namespace when imported.
- **R15 [P0]** Package manifests MUST support local relative files and immutable content-addressed artifacts.
- **R16 [P0]** A package MUST be valid when authored entirely in JSON; YAML MUST be accepted as a human-authoring format.
- **R17 [P0]** Implementations MUST compile authoring formats into deterministic canonical JSON before hashing, signing, diffing, or publishing.
- **R18 [P0]** Published packages MUST include a content digest covering the manifest and all declared files.
- **R19 [P1]** Published packages SHOULD support maintainer signatures without making a particular DID method, wallet, or certificate authority mandatory.
- **R20 [P1]** A package MAY import other ontology packages by immutable version or digest and MUST detect cyclic imports.

Recommended repository layout:

```text
openontology/
  openontology.yaml
  schema/
    entity-types.yaml
    properties.yaml
    relationships.yaml
    constraints.yaml
    queries.yaml
    actions.yaml
  data/
    entities.ndjson
    claims.ndjson
    sources.ndjson
  mappings/
    context.jsonld
    external-ids.yaml
  fixtures/
  tests/
  README.md
```

Small packages MAY place arrays inline in `openontology.yaml`. Large datasets SHOULD use newline-delimited JSON so implementations can stream validation and import.

### Required schema contracts

The initial schema set SHOULD live under `packages/schemas/schemas/`:

```text
logicsrc-openontology-manifest.schema.json
logicsrc-openontology-namespace.schema.json
logicsrc-openontology-entity-type.schema.json
logicsrc-openontology-property.schema.json
logicsrc-openontology-relationship-type.schema.json
logicsrc-openontology-constraint.schema.json
logicsrc-openontology-query.schema.json
logicsrc-openontology-action.schema.json
logicsrc-openontology-entity.schema.json
logicsrc-openontology-claim.schema.json
logicsrc-openontology-source.schema.json
logicsrc-openontology-evidence.schema.json
logicsrc-openontology-changeset.schema.json
logicsrc-openontology-review.schema.json
logicsrc-openontology-approval.schema.json
logicsrc-openontology-event.schema.json
logicsrc-openontology-package.schema.json
```

- **R21 [P0]** Every normative OpenOntology object MUST have a JSON Schema Draft 2020-12 contract.
- **R22 [P0]** Schemas MUST set `additionalProperties: false` except at explicitly declared extension points.
- **R23 [P0]** Extension fields MUST use namespaced keys or an `extensions` object to prevent future collisions.
- **R24 [P0]** Schemas MUST ship valid and invalid fixtures plus machine-readable validation errors.
- **R25 [P0]** Schema IDs MUST use stable `https://logicsrc.com/schemas/openontology/...` identifiers.
- **R26 [P0]** The TypeScript SDK MUST generate or verify types from the same schemas rather than maintaining a divergent hand-written model.
- **R27 [P1]** The project SHOULD publish a conformance bundle that third-party implementations can run without the LogicSRC runtime.

### Type system

An entity type defines the identity-bearing nouns of a domain. A property defines a scalar or structured attribute. A relationship type defines a typed connection whose object is another entity.

```yaml
id: Person
label: Person
description: A human participant in the ecosystem.
keyProperties: [canonicalName]
properties:
  canonicalName:
    type: string
    required: true
  aliases:
    type: array
    items: { type: string }
  location:
    type: string
    required: false
```

```yaml
id: worksOn
label: works on
description: A person or organization actively contributes work to a project.
from: [Person, Organization]
to: [Project]
cardinality: many-to-many
temporal: true
inverse: hasContributor
```

- **R28 [P0]** Entity types MUST declare a stable ID, human label, description, and allowed properties.
- **R29 [P0]** Property definitions MUST support string, number, integer, boolean, date, date-time, duration, URL, email, enum, object, array, binary reference, and entity reference types.
- **R30 [P0]** Property definitions MUST support required/optional status, cardinality, defaults, examples, deprecation, and validation constraints.
- **R31 [P0]** Relationship types MUST declare allowed source and destination entity types.
- **R32 [P0]** Relationship types MUST support labels, descriptions, inverse names, symmetry, transitivity metadata, cardinality, temporal behavior, and deprecation.
- **R33 [P0]** The standard MUST NOT infer transitivity, symmetry, equivalence, or inverses unless the schema declares it and the query explicitly permits inference.
- **R34 [P0]** Entity types, properties, and relationship types MUST support multilingual labels and descriptions.
- **R35 [P1]** Types SHOULD support inheritance or composition while preventing ambiguous property resolution.
- **R36 [P1]** Implementations SHOULD provide mappings between OpenOntology constraints and SHACL shapes where semantics are equivalent.
- **R37 [P2]** Implementations MAY expose OWL/RDFS mappings for consumers that need formal reasoning beyond the core standard.

### Entities and identity

```yaml
openontology: "0.1"
kind: Entity
id: "ethereum:person:vitalik-buterin"
type: Person
canonicalName: Vitalik Buterin
aliases:
  - vitalik.eth
externalIds:
  github: vitalik
  x: VitalikButerin
status: active
createdAt: 2026-07-26T00:00:00Z
createdBy: "did:example:curator"
```

- **R38 [P0]** Every entity MUST have a stable ID, entity type, canonical name or label, creation timestamp, and creator reference.
- **R39 [P0]** Entity IDs MUST remain stable when display names or aliases change.
- **R40 [P0]** Entities MUST support aliases and namespaced external IDs without treating external services as canonical identity authorities.
- **R41 [P0]** Entity lookup MUST support exact ID, canonical name, alias, and external ID.
- **R42 [P0]** Entity merges MUST create an auditable change set and preserve the old IDs as redirects or superseded identities.
- **R43 [P0]** Deleting an entity MUST NOT erase historical claims; implementations MUST use tombstone, archived, or superseded state.
- **R44 [P0]** `sameAs` MUST be represented as a reviewable claim rather than an irreversible implicit merge.
- **R45 [P1]** Entity resolution SHOULD return ranked candidates with evidence instead of silently selecting a match.
- **R46 [P1]** Public packages SHOULD support globally resolvable HTTP identifiers or deterministic URNs in addition to compact local IDs.

### Claims as the canonical fact model

OpenOntology represents properties and relationships as claims. A relationship is a claim whose object is an entity reference. A scalar property is a claim whose object is a typed value. Engines MAY materialize node and edge tables, but the portable record is the claim.

```yaml
openontology: "0.1"
kind: Claim
id: "claim:01J3EXAMPLE9X2S7V8Q"
ontology: ethereum-ecosystem@0.1.0
subject: "ethereum:person:alice"
predicate: worksOn
object:
  entity: "ethereum:project:zk-prover"
status: asserted
confidence: 0.94
validTime:
  from: 2026-04-01T00:00:00Z
  to: null
observedAt: 2026-07-25T19:42:00Z
assertedAt: 2026-07-25T19:43:12Z
assertedBy: "agent:research-mapper"
runId: "run_01J3EXAMPLE"
sources:
  - "source:github:org/repo:commit-sha"
evidence:
  - "evidence:01J3EXAMPLE"
license: CC-BY-4.0
visibility: public
tags: [ethereum, zk]
```

- **R47 [P0]** Claims MUST include `id`, `subject`, `predicate`, typed `object`, `status`, `assertedAt`, and `assertedBy`.
- **R48 [P0]** A claim object MUST contain either an entity reference or a typed scalar value, never both.
- **R49 [P0]** Claims MUST support `asserted`, `proposed`, `disputed`, `retracted`, `superseded`, and `derived` states.
- **R50 [P0]** Accepted claims MUST be append-only; corrections MUST be represented by dispute, retraction, or supersession records.
- **R51 [P0]** Claims MUST support domain valid time independently from the time the system recorded the claim.
- **R52 [P0]** Claims MUST support open-ended time ranges and point-in-time observations.
- **R53 [P0]** Claims MUST support a confidence value from `0` through `1` while making clear that confidence is metadata, not proof.
- **R54 [P0]** Claims MUST identify their source or explicitly declare that they are first-party/manual assertions.
- **R55 [P0]** Claims created by an agent MUST reference a LogicSRC-compatible run record or equivalent audit identifier.
- **R56 [P0]** Derived claims MUST identify the rule, query, or transformation that produced them and the input claim IDs.
- **R57 [P0]** A query MUST be able to exclude proposed, disputed, retracted, superseded, or derived claims independently.
- **R58 [P0]** Current state MUST be computed from claim status and temporal semantics rather than destructive row replacement.
- **R59 [P1]** Implementations SHOULD support bitemporal queries using valid time and recorded/system time.
- **R60 [P1]** Implementations SHOULD support claim-level visibility and retention policy.

### Sources, evidence, and provenance

```yaml
openontology: "0.1"
kind: Source
id: "source:github:ethereum/research:abc123"
sourceType: git-commit
uri: "https://github.com/ethereum/research/commit/abc123"
title: Research repository commit
publisher: ethereum
retrievedAt: 2026-07-25T19:40:00Z
contentHash: "sha256:..."
mediaType: text/html
license: unknown
```

```yaml
openontology: "0.1"
kind: Evidence
id: "evidence:01J3EXAMPLE"
source: "source:github:ethereum/research:abc123"
selector:
  type: line-range
  start: 41
  end: 48
excerpt: "Optional short excerpt permitted by policy"
contentHash: "sha256:..."
```

- **R61 [P0]** Source records MUST support URI, source type, retrieval time, content hash, publisher, media type, and license status.
- **R62 [P0]** Evidence MUST identify a source and a machine-readable selector such as line range, page, timestamp, JSON Pointer, XPath, CSS selector, database key, commit path, or API field.
- **R63 [P0]** Evidence excerpts MUST be optional and MUST obey source licensing, privacy, and configured excerpt limits.
- **R64 [P0]** A consumer MUST be able to traverse from an answer to claims, from claims to evidence, and from evidence to sources.
- **R65 [P0]** Content hashes MUST permit detection of changed or unavailable source material.
- **R66 [P0]** Public exports MUST redact private source URLs, excerpts, selectors, and identity data according to policy.
- **R67 [P1]** Provenance export SHOULD map equivalent fields to W3C PROV-O where practical.
- **R68 [P1]** Implementations SHOULD report stale sources and claims whose referenced source content has changed.

### Constraints and validation

- **R69 [P0]** Validation MUST check JSON Schema structure, manifest integrity, referenced files, unique IDs, declared types, predicate domain/range, object datatype, and package digest.
- **R70 [P0]** Validation MUST distinguish errors, warnings, informational findings, and policy findings.
- **R71 [P0]** Validation output MUST be available as human-readable text, JSON, YAML, and Markdown.
- **R72 [P0]** Validation errors MUST include a stable code, object ID, file, path, message, and remediation hint when known.
- **R73 [P0]** Constraints MUST support required predicates, cardinality, uniqueness, allowed values, domain/range, temporal bounds, and custom query-based checks.
- **R74 [P0]** Constraints MUST be deterministic and MUST NOT require an LLM to decide conformance.
- **R75 [P0]** Implementations MUST support strict mode that fails on unknown types, predicates, extension namespaces, or unresolved references.
- **R76 [P1]** Implementations SHOULD export equivalent graph constraints as SHACL when a lossless mapping exists.
- **R77 [P1]** Constraint violations SHOULD be representable as LogicSRC tasks or events for human or agent remediation.

### Portable query contract

OpenOntology v0.1 uses a JSON/YAML triple-pattern query AST rather than requiring SPARQL, Cypher, or a custom text parser.

```yaml
openontologyQuery: "0.1"
ontology: ethereum-ecosystem@0.1.0
match:
  - subject: "?person"
    predicate: worksOn
    object: "?project"
  - subject: "?project"
    predicate: investigates
    object: "ethereum:topic:zero-knowledge"
where:
  - variable: "?person"
    field: status
    operator: eq
    value: active
select:
  - "?person"
  - "?project"
include:
  claimStatus: [asserted]
  derived: false
asOf: 2026-07-26T00:00:00Z
limit: 100
```

- **R78 [P0]** The query contract MUST support triple patterns with variables, constants, and typed values.
- **R79 [P0]** The query contract MUST support equality, inequality, comparison, membership, existence, text search, temporal filtering, status filtering, sorting, projection, distinct results, pagination, and limits.
- **R80 [P0]** The query contract MUST support one-hop and multi-hop graph traversal without database-specific syntax.
- **R81 [P0]** Queries MUST accept an `asOf` time and claim-status inclusion policy.
- **R82 [P0]** Query results MUST include stable entity/claim IDs and MAY include expanded labels and selected properties.
- **R83 [P0]** Saved queries MUST be versioned schema objects with IDs, descriptions, parameters, and expected result shapes.
- **R84 [P0]** Query execution MUST support an explanation mode that returns the matched claim IDs and applied filters.
- **R85 [P0]** Implementations MUST enforce server-side limits for depth, cardinality, execution time, and output size.
- **R86 [P1]** Adapters SHOULD translate the portable AST to SQL, SPARQL, Cypher, or Datalog where supported.
- **R87 [P1]** Implementations SHOULD support path finding, aggregation, grouping, and faceting.
- **R88 [P2]** Full-text natural-language questions MAY be translated into the portable query AST, but the generated AST MUST be inspectable before execution.

### Change sets, review, and governance

```yaml
openontology: "0.1"
kind: ChangeSet
id: "changeset:01J3EXAMPLE"
ontology: ethereum-ecosystem@0.1.0
title: Add Alice as a contributor to the ZK prover project
rationale: Public repository activity and team page identify the contribution.
createdAt: 2026-07-25T19:45:00Z
createdBy: "agent:research-mapper"
runId: "run_01J3EXAMPLE"
operations:
  - op: add-entity
    value: { id: "ethereum:person:alice", type: Person, canonicalName: Alice }
  - op: assert-claim
    value: { subject: "ethereum:person:alice", predicate: worksOn, object: { entity: "ethereum:project:zk-prover" } }
requiredApprovals: 1
status: proposed
```

- **R89 [P0]** All multi-object writes MUST be expressible as an atomic change set.
- **R90 [P0]** Change sets MUST support add, update-metadata, assert-claim, dispute-claim, retract-claim, supersede-claim, merge-entity, archive-entity, and schema-migration operations.
- **R91 [P0]** Change sets MUST include author, timestamp, rationale, target ontology version, operations, validation result, and required approvals.
- **R92 [P0]** Agent-created change sets MUST default to `proposed` rather than applied.
- **R93 [P0]** Applying a change set MUST emit auditable events and produce a resulting ontology revision or data revision.
- **R94 [P0]** Rejected change sets MUST remain inspectable with reviewer comments.
- **R95 [P0]** Conflicting change sets MUST fail safely or enter a conflict state; last-write-wins MUST NOT be the default for canonical claims.
- **R96 [P0]** Reviewers MUST be able to inspect a semantic diff showing affected entities, claims, constraints, sources, and query results.
- **R97 [P0]** Rollback MUST create a new compensating change set rather than deleting audit history.
- **R98 [P1]** Maintainers SHOULD define branch protection-style policies for schema changes, public data changes, merges, and bulk ingestion.
- **R99 [P1]** Change sets SHOULD support cryptographic signatures and package-maintainer verification.
- **R100 [P1]** Public community packages SHOULD expose contribution guidelines, code of conduct, source policy, and dispute policy.

### Permissions, identities, and safety

Recommended scopes:

```text
ontology:read
ontology:schema:read
ontology:query
ontology:source:read
ontology:claim:propose
ontology:claim:write
ontology:changeset:review
ontology:changeset:approve
ontology:action:execute
ontology:publish
ontology:admin
```

- **R101 [P0]** Remote implementations MUST authenticate actors before non-public reads or any write.
- **R102 [P0]** Permissions MUST use explicit scopes and MUST support human, service, and agent actors.
- **R103 [P0]** LogicSRC DID identity, OAuth identity, or local keys MAY identify actors, but no single identity provider is mandatory.
- **R104 [P0]** Read-only MCP and API access MUST be separable from proposal, approval, and write access.
- **R105 [P0]** Agent confidence MUST NOT grant permission.
- **R106 [P0]** Bulk imports, entity merges, claim retractions, schema migrations, public publishing, and governed action execution MUST support explicit approval policy.
- **R107 [P0]** `--yolo` or unattended execution MUST NOT bypass a required approval.
- **R108 [P0]** Untrusted source content MUST be treated as data and MUST NOT be allowed to alter system instructions, permission policy, or tool boundaries.
- **R109 [P0]** Logs MUST redact credentials, private source excerpts, access tokens, and configured sensitive properties.
- **R110 [P0]** Every remote mutation MUST record actor, client, timestamp, request ID, policy decision, and resulting event IDs.
- **R111 [P1]** Implementations SHOULD support organization/workspace visibility and field-level access policies.
- **R112 [P1]** Implementations SHOULD support signed package verification and a trust policy for imported maintainers.

### AI-assisted ingestion and curation

- **R113 [P0]** AI extraction MUST produce proposed entities, claims, sources, evidence selectors, and confidence rather than silently applying facts.
- **R114 [P0]** Every AI proposal MUST record model provider, model identifier, model version when available, prompt/template version, run ID, source IDs, and extraction timestamp.
- **R115 [P0]** AI extraction MUST NOT store hidden chain-of-thought; it MAY store a concise user-facing rationale and structured evidence mapping.
- **R116 [P0]** Entity resolution MUST expose candidate matches and uncertainty to the reviewer.
- **R117 [P0]** An ingestion run MUST be repeatable from its declared sources, mappings, parser version, and model configuration when those inputs remain available.
- **R118 [P0]** Source adapters MUST declare whether they can read public data, private data, incremental changes, deletions, and source licenses.
- **R119 [P1]** Initial adapters SHOULD include Markdown, JSON, YAML, CSV, NDJSON, GitHub repositories, generic HTTP APIs, and existing OpenOntology packages.
- **R120 [P1]** Ingestion SHOULD support deduplication by stable ID, external ID, exact alias, normalized URL, and reviewed similarity candidates.
- **R121 [P1]** Curators SHOULD be able to accept or reject individual operations within an AI-generated change set before application.
- **R122 [P1]** AgentSwarm MAY coordinate extractor, entity-resolution, evidence-verification, and reviewer agents, but all agents MUST use the same OpenOntology change-set contract.

### Actions and operational ontologies

OpenOntology should support the transition from a passive knowledge map to a governed operational layer without embedding arbitrary code in the ontology package.

```yaml
id: createProjectReviewTask
label: Create project review task
input:
  project: { entityType: Project, required: true }
  reason: { type: string, required: true }
preconditions:
  query: project-needs-review
executor:
  type: logicsrc-plugin-tool
  plugin: commandboard
  tool: task.create
permissions:
  required: [ontology:action:execute]
approval:
  mode: policy
sideEffects: [creates-task, emits-event]
```

- **R123 [P1]** Action definitions MUST declare typed inputs, typed outputs, preconditions, executor reference, required scopes, approval policy, side effects, and emitted events.
- **R124 [P1]** Ontology packages MUST reference approved LogicSRC plugin/tool capabilities rather than embedding executable code.
- **R125 [P1]** Action execution MUST record the ontology revision, input claims, actor, policy decision, tool call, output, and resulting claims/events.
- **R126 [P1]** Actions that affect payments, escrow, DNS, credentials, public content, merges, or external systems MUST require explicit policy and approval.
- **R127 [P1]** Failed actions MUST be inspectable and retryable without duplicating non-idempotent side effects.
- **R128 [P2]** Multi-step processes MAY compose actions and LogicSRC tasks into a DAG with checkpoints and approvals.

### Interoperability

- **R129 [P0]** Canonical LogicSRC contracts MUST use JSON Schema Draft 2020-12.
- **R130 [P0]** OpenOntology MUST define a JSON-LD 1.1 context for core entities, predicates, claims, provenance, and package metadata.
- **R131 [P0]** JSON-LD export MUST preserve stable IDs, types, properties, relationship claims, typed values, language tags, and provenance links.
- **R132 [P1]** Implementations SHOULD import and export RDF/Turtle for the losslessly mappable core subset.
- **R133 [P1]** Implementations SHOULD map validation constraints to SHACL where equivalent.
- **R134 [P1]** Implementations SHOULD map provenance to PROV-O where equivalent.
- **R135 [P1]** External mappings MUST report lossy fields and unsupported semantics rather than silently dropping them.
- **R136 [P1]** OpenOntology entity IDs SHOULD support links to Wikidata, ORCID, GitHub, package registries, DIDs, domain-specific identifiers, and other namespaced external IDs.
- **R137 [P1]** The REST reference API MUST be described by OpenAPI and MUST use the same schemas as packages and SDKs.
- **R138 [P1]** The project SHOULD publish a compatibility matrix for JSON-LD, RDF, SHACL, SPARQL, Cypher, Datalog, and selected external ontology tools.

### CLI

Required commands:

```text
logicsrc ontology init
logicsrc ontology validate
logicsrc ontology lint
logicsrc ontology build
logicsrc ontology inspect
logicsrc ontology entity get|list|find|merge
logicsrc ontology claim get|list|propose|assert|dispute|retract|supersede
logicsrc ontology query run|explain|list
logicsrc ontology changeset create|diff|validate|review|approve|apply|reject
logicsrc ontology import
logicsrc ontology export
logicsrc ontology migrate
logicsrc ontology serve
logicsrc ontology audit
logicsrc ontology tui
```

- **R139 [P0]** `logicsrc ontology init` MUST create a valid starter package, example types, fixtures, tests, and README.
- **R140 [P0]** `validate` MUST perform schema, graph, provenance, and package-integrity validation without modifying files.
- **R141 [P0]** `build` MUST produce canonical JSON and a deterministic digest.
- **R142 [P0]** Read commands MUST support `--format table|json|yaml|markdown|ndjson` where the format is meaningful.
- **R143 [P0]** Write commands MUST default to dry-run or proposed change-set behavior unless an explicit approved apply operation is used.
- **R144 [P0]** CLI errors MUST use stable exit codes suitable for CI.
- **R145 [P0]** CLI commands MUST run under supported Node.js and Bun environments without maintaining separate behavior.
- **R146 [P0]** The CLI MUST support local packages without network access.
- **R147 [P1]** `serve` SHOULD expose the reference REST API and MCP server over the selected local package or database.
- **R148 [P1]** Import/export SHOULD support `json`, `yaml`, `ndjson`, `jsonld`, `rdf`, `turtle`, `csv`, and package archive formats according to adapter capability.

Example flow:

```bash
logicsrc ontology init ethereum-ecosystem
logicsrc ontology validate ./ethereum-ecosystem --strict
logicsrc ontology import github \
  --repo ethereum/research \
  --ontology ./ethereum-ecosystem \
  --propose
logicsrc ontology changeset diff changeset:01J3EXAMPLE
logicsrc ontology changeset approve changeset:01J3EXAMPLE
logicsrc ontology changeset apply changeset:01J3EXAMPLE
logicsrc ontology query run people-working-on-zk \
  --param status=active \
  --format table
logicsrc ontology query explain people-working-on-zk \
  --result 0 \
  --format markdown
```

### TypeScript SDK

The TypeScript SDK should expose conceptual APIs that other languages can mirror:

```ts
createOntologyEngine(options)
loadOntologyPackage(input)
validateOntologyPackage(input)
buildOntologyPackage(input)
getOntologyManifest(id)
getOntologySchema(id)
getEntity(id)
findEntities(query)
getClaim(id)
queryOntology(query)
explainOntologyResult(resultId)
createOntologyChangeSet(input)
validateOntologyChangeSet(id)
reviewOntologyChangeSet(id, review)
approveOntologyChangeSet(id, approval)
applyOntologyChangeSet(id)
importOntology(input)
exportOntology(input)
subscribeOntologyEvents(filter)
```

- **R149 [P0]** The SDK MUST use the same object semantics and validation behavior as the CLI.
- **R150 [P0]** The SDK MUST expose storage, source-adapter, query-engine, identity, policy, event, and signature interfaces.
- **R151 [P0]** The SDK MUST support dependency injection so applications can use in-memory, SQLite, Turso, PostgreSQL, RDF, or graph-backed adapters.
- **R152 [P0]** SDK write methods MUST accept an actor and policy context.
- **R153 [P0]** SDK errors MUST include stable codes and structured details.
- **R154 [P1]** Rust and Python SDKs SHOULD mirror the same conceptual resources after the TypeScript reference stabilizes.
- **R155 [P1]** A curl-compatible API guide SHOULD show equivalent operations without requiring an SDK.

### MCP

Recommended resources:

```text
logicsrc://openontology/spec
logicsrc://openontology/schemas/{schema-name}
ontology://{ontology-id}/manifest
ontology://{ontology-id}/schema
ontology://{ontology-id}/entity/{entity-id}
ontology://{ontology-id}/claim/{claim-id}
ontology://{ontology-id}/changeset/{changeset-id}
ontology://{ontology-id}/queries
```

Recommended tools:

```text
ontology_validate
ontology_get_entity
ontology_find_entities
ontology_query
ontology_explain
ontology_propose_claim
ontology_create_changeset
ontology_validate_changeset
ontology_review_changeset
ontology_apply_changeset
ontology_import
ontology_export
```

Recommended prompts:

```text
design_ontology
map_sources_to_claims
resolve_entities
review_ontology_changeset
explain_ontology_answer
```

- **R156 [P0]** The LogicSRC MCP server MUST expose the OpenOntology specification and schemas as read-only resources.
- **R157 [P0]** MCP query results MUST use the same portable query and result schemas as CLI, SDK, and REST.
- **R158 [P0]** MCP mutation tools MUST be capability-scoped and MUST default to proposal behavior.
- **R159 [P0]** MCP apply operations MUST require explicit write scope and approval context.
- **R160 [P0]** MCP responses MUST include ontology version, relevant claim IDs, and provenance links when returning factual answers.
- **R161 [P1]** The server SHOULD support pagination, streaming large results, and resource subscriptions where supported by the current MCP transport.
- **R162 [P1]** MCP prompts SHOULD produce valid OpenOntology objects that are revalidated before use.

### REST API and events

Minimum REST surface:

```text
GET    /api/ontologies
POST   /api/ontologies
GET    /api/ontologies/{ontologyId}
GET    /api/ontologies/{ontologyId}/manifest
GET    /api/ontologies/{ontologyId}/schema
POST   /api/ontologies/{ontologyId}/validate
GET    /api/ontologies/{ontologyId}/entities
GET    /api/ontologies/{ontologyId}/entities/{entityId}
GET    /api/ontologies/{ontologyId}/claims
GET    /api/ontologies/{ontologyId}/claims/{claimId}
POST   /api/ontologies/{ontologyId}/query
POST   /api/ontologies/{ontologyId}/explain
POST   /api/ontologies/{ontologyId}/changesets
GET    /api/ontologies/{ontologyId}/changesets/{changesetId}
POST   /api/ontologies/{ontologyId}/changesets/{changesetId}/review
POST   /api/ontologies/{ontologyId}/changesets/{changesetId}/approve
POST   /api/ontologies/{ontologyId}/changesets/{changesetId}/apply
GET    /api/ontologies/{ontologyId}/events
```

- **R163 [P0]** API resources MUST use stable IDs, ETags or revision identifiers, pagination, and structured errors.
- **R164 [P0]** Mutating API requests MUST support idempotency keys.
- **R165 [P0]** Concurrent writes MUST use optimistic concurrency or equivalent revision checks.
- **R166 [P0]** Every applied change MUST emit a LogicSRC-compatible event.
- **R167 [P0]** Event types MUST include package validated, entity proposed, claim proposed, claim asserted, claim disputed, claim retracted, entity merged, change set reviewed, change set approved, change set applied, import completed, export completed, constraint violated, and action executed.
- **R168 [P1]** The reference service SHOULD offer SSE for live events and MAY offer WebSocket transport without changing event schemas.
- **R169 [P1]** Webhooks SHOULD support signing, retry, delivery logs, and replay protection.

### TUI and PWA

- **R170 [P1]** The TUI MUST be keyboard-first, SSH/tmux-friendly, and usable without a mouse.
- **R171 [P1]** The TUI SHOULD provide schema, entities, claims, sources, queries, change sets, violations, and audit panels.
- **R172 [P1]** The TUI SHOULD use familiar LogicSRC keys such as `q` to quit, `/` to search, `t` for types, `e` for entities, `c` for claims/change sets, `s` for sources, `v` for validation, and `a` for approvals.
- **R173 [P1]** The PWA MUST provide a graph view and an accessible list/table fallback for every graph result.
- **R174 [P1]** The PWA MUST provide entity inspection, claim history, source/evidence inspection, query execution, semantic diff, review, approval, and audit views.
- **R175 [P1]** Graph visualization MUST progressively load or cluster large graphs rather than rendering every node at once.
- **R176 [P1]** The UI MUST visually distinguish asserted, proposed, disputed, retracted, superseded, and derived claims.
- **R177 [P1]** The UI MUST show valid time, recorded time, confidence, source count, and actor for each claim.
- **R178 [P1]** The UI MUST never hide a lossy import/export warning behind a generic success state.
- **R179 [P1]** PWA and TUI write flows MUST use the same change-set review and approval contract as CLI, SDK, MCP, and REST.

### Reference engine and deployment

The reference implementation should prioritize a simple stack that developers can run locally:

```text
TypeScript
Node.js + Bun compatibility
SQLite locally
Turso/libSQL for hosted state
FTS5 for label/description/source search
optional vector index adapter for discovery only
REST + SSE
LogicSRC MCP server
Railway deployment
```

Suggested tables or storage concepts:

```text
ontologies
ontology_versions
namespaces
entity_types
property_definitions
relationship_types
constraints
saved_queries
action_definitions
entities
claims
claim_sources
evidence
changesets
changeset_operations
reviews
approvals
ontology_events
snapshots
external_ids
aliases
optional_embeddings
```

- **R180 [P0]** The reference engine MUST use a storage adapter interface and MUST NOT make Neo4j, a vector database, or a hosted graph service mandatory.
- **R181 [P0]** The initial local adapter MUST use SQLite.
- **R182 [P0]** The initial hosted adapter MUST support Turso/libSQL.
- **R183 [P0]** The hosted reference service MUST be deployable on Railway from the existing LogicSRC monorepo.
- **R184 [P0]** Claims and audit events MUST be append-only at the logical contract layer even if an implementation compacts physical storage.
- **R185 [P0]** The engine MUST index entity IDs, entity types, aliases, external IDs, subject, predicate, entity-valued object, claim status, valid time, recorded time, and source IDs.
- **R186 [P0]** FTS5 or an equivalent full-text adapter MUST support label, alias, description, and permitted source-text search.
- **R187 [P0]** Embeddings MUST be optional, rebuildable, provider-neutral derived data and MUST NOT be the sole representation of a fact.
- **R188 [P0]** Migrations MUST be versioned, reversible through compensating migrations where possible, and tested against fixtures.
- **R189 [P1]** The engine SHOULD support snapshots for efficient `asOf` queries without losing the underlying claim history.
- **R190 [P1]** Backups and exports SHOULD include manifests, data, revisions, audit records, and digests without including secrets.

### Example ontology: Ethereum ecosystem

The repository SHOULD include `examples/openontology/ethereum-ecosystem/` as a neutral demonstration.

Initial entity types:

```text
Person
Organization
Project
Codebase
ResearchTopic
Protocol
Network
Layer2
Application
FundingProgram
Publication
Event
```

Initial relationship types:

```text
worksAt
memberOf
worksOn
contributesTo
maintains
builds
funds
investigates
implements
uses
runsOn
deployedOn
dependsOn
authored
collaboratesWith
forkedFrom
```

Initial saved questions:

```text
Which people and organizations work on a given research topic?
Which codebases implement a protocol?
Which organizations maintain the codebases used by a network?
Which projects depend on a specified protocol?
Which funding programs support a project or research direction?
What changed in this ecosystem between two dates?
Why does the ontology say a person works on a project?
```

- **R191 [P0]** The example MUST contain enough fixture data to demonstrate entities, scalar properties, entity relationships, temporal claims, multiple sources, disputed claims, supersession, and query explanations.
- **R192 [P0]** The example MUST use fictional or clearly licensed fixture data in automated tests so tests do not depend on live public profiles.
- **R193 [P1]** A separate optional seed/import script MAY ingest current public Ethereum data into proposed change sets.
- **R194 [P1]** Live-data imports MUST retain source license and retrieval metadata and MUST not imply endorsement by the people or organizations represented.
- **R195 [P1]** The example MUST remain removable without affecting any core OpenOntology test or package.

### Website and documentation

- **R196 [P0]** The LogicSRC homepage MUST add OpenOntology to the standards surface.
- **R197 [P0]** `/openontology` MUST explain the distinction among ontology schema, populated knowledge graph, storage engine, vector search, and agent runtime.
- **R198 [P0]** The page MUST include a small people → organizations → projects → codebases → topics diagram and a source-backed claim example.
- **R199 [P0]** The page MUST link to schemas, CLI examples, MCP resources, SDK usage, API reference, example ontology, governance, and GitHub source.
- **R200 [P0]** Documentation MUST include a five-minute local quick start that does not require an account or API key.
- **R201 [P0]** Documentation MUST include authoring, querying, provenance, temporal data, change-set review, permissions, interoperability, and deployment guides.
- **R202 [P0]** Documentation MUST avoid claiming that OpenOntology invented ontologies or is the only open ontology engine.
- **R203 [P1]** The website SHOULD include an interactive read-only explorer backed by fixture data.
- **R204 [P1]** The blog SHOULD publish the motivation, design tradeoffs, Ethereum example, and compatibility roadmap.

Suggested positioning copy:

> **LogicSRC OpenOntology is an open contract for durable, source-backed domain knowledge shared by humans and AI agents. Define the things in a domain, connect them with typed claims, preserve where each fact came from, and let agents query or propose changes through governed interfaces.**

### Monorepo changes

The implementation MUST remain in `github.com/profullstack/logicsrc`; no new repository is required.

```text
prd/
  0001-add-logicsrc-openontology-spec.md

docs/
  openontology.md
  openontology-governance.md
  openontology-interoperability.md

packages/
  openontology/
  schemas/schemas/logicsrc-openontology-*.schema.json
  schemas/fixtures/openontology/
  validators/src/openontology/
  sdk/src/openontology/
  cli/src/commands/ontology/
  logicsrc-mcp/src/openontology/
  tui/src/openontology/

apps/
  <existing-logicsrc-web-app>/openontology/
  <reference-api>/api/ontologies/

examples/
  openontology/ethereum-ecosystem/
```

- **R205 [P0]** OpenOntology code and docs MUST be added to the existing LogicSRC monorepo.
- **R206 [P0]** The root README MUST list OpenOntology and show one validation/query example.
- **R207 [P0]** CI MUST validate schemas, fixtures, example packages, generated types, CLI snapshots, and conformance tests.
- **R208 [P0]** Packages MUST use the repository’s existing workspace and release conventions while preserving Node.js and Bun runtime compatibility.
- **R209 [P0]** No production credential, private source, or generated local database file may be committed.
- **R210 [P1]** The installer SHOULD make `logicsrc ontology` available through the existing `curl | sh` LogicSRC installation flow.

### Suggested implementation sequence

**Phase 0 — Specification and schemas**

- land this OpenPRD;
- add `docs/openontology.md`;
- define core JSON Schemas and fixtures;
- add canonicalization, digest, and validation rules;
- add the fictional Ethereum ecosystem example;
- add homepage and `/openontology` documentation surface.

**Phase 1 — Local engine and CLI**

- implement `@logicsrc/openontology`;
- implement in-memory and SQLite adapters;
- implement package load/build/validate;
- implement entity, claim, query, explanation, and change-set APIs;
- add `logicsrc ontology` commands;
- add deterministic conformance tests.

**Phase 2 — MCP, REST, Turso, TUI, and PWA**

- add MCP resources/tools/prompts;
- add REST/OpenAPI and SSE;
- add Turso/libSQL adapter and Railway deployment;
- add review/approval policy integration;
- add TUI and PWA explorer/reviewer.

**Phase 3 — Interoperability and ingestion**

- add JSON-LD context and round-trip tests;
- add RDF/Turtle and SHACL/PROV-O mappings;
- add GitHub/Markdown/JSON/CSV source adapters;
- add AgentSwarm-assisted proposal workflows;
- add package registry/publishing and signature verification.

**Phase 4 — Governed actions and processes**

- add typed action definitions;
- connect LogicSRC plugin tools;
- add policy-aware action execution and audit;
- add multi-step process definitions after the core knowledge model is stable.

## UX Notes

### Core mental model

The product must teach five nouns before exposing advanced graph terminology:

1. **Type** — what kind of thing something is, such as `Person`, `Project`, or `Codebase`.
2. **Entity** — a specific thing with a stable identity.
3. **Claim** — a typed statement about an entity or a relationship between entities.
4. **Source** — where the claim came from.
5. **Change set** — a reviewable proposal to add, correct, merge, dispute, or retract knowledge.

The UI should use “claim” rather than “fact” when provenance or certainty matters. “Current accepted view” is safer than implying that every accepted statement is objectively true.

### First-run CLI experience

```bash
$ logicsrc ontology init my-ecosystem
Created my-ecosystem/openontology.yaml
Created 3 entity types, 3 relationship types, fixtures, and tests.

$ logicsrc ontology validate my-ecosystem
✓ manifest
✓ 3 entity types
✓ 3 relationship types
✓ 8 entities
✓ 14 claims
✓ source and evidence coverage
✓ package digest
OpenOntology package is valid.

$ logicsrc ontology query run my-ecosystem/queries/contributors.yaml
PERSON   PROJECT       SOURCE COUNT   CONFIDENCE
Alice    ZK Prover     2              0.94
```

The quick start must work with no login, hosted database, model key, or network connection.

### Claim inspection

A claim details view should show:

```text
Alice —works on→ ZK Prover
Status: asserted
Valid since: 2026-04-01
Recorded: 2026-07-25
Confidence: 0.94
Sources: 2
Asserted by: agent:research-mapper
Run: run_01J3EXAMPLE

Why this is present
1. Git commit authored by Alice in the project repository.
2. Project team page lists Alice as a contributor.

History
2026-07-25  Proposed by research-mapper
2026-07-25  Approved by curator@example.com
2026-07-25  Applied in revision data-000042
```

### Change-set review

A reviewer must see semantic impact rather than only raw JSON:

```text
Change set: Add Alice to ZK Prover

+ 1 entity
+ 2 claims
+ 2 sources
~ 1 possible duplicate identity
! 1 warning: GitHub profile name differs from project-team name

Affected saved queries
+ people-working-on-zk: result count 18 → 19

Approval policy
1 curator required
```

The default action is **Review**, not **Apply**. Bulk operations require filters, summary counts, sampled rows, and explicit confirmation.

### TUI layout

```text
┌ OpenOntology: ethereum-ecosystem@0.1.0 ─────────────────────────────┐
│ / search   t types   e entities   c claims   s sources   v validate │
├ Types ───────────────┬ Entity / Claim ──────────────────────────────┤
│ Person           214 │ Alice                                        │
│ Organization      81 │ type: Person                                 │
│ Project          143 │ worksOn → ZK Prover                          │
│ Codebase         196 │ sources: 2  confidence: 0.94                 │
│ ResearchTopic     37 │ valid: 2026-04-01 → present                  │
├ Change sets ─────────┴───────────────────────────────────────────────┤
│ 3 proposed   1 needs review   0 conflicts   2 constraint violations │
└──────────────────────────────────────────────────────────────────────┘
```

The TUI must remain useful over SSH and narrow terminals. Graph diagrams are optional; list, tree, and path representations are required.

### PWA routes

```text
/openontology
/openontology/new
/openontology/{ontologyId}
/openontology/{ontologyId}/schema
/openontology/{ontologyId}/entities
/openontology/{ontologyId}/entities/{entityId}
/openontology/{ontologyId}/claims/{claimId}
/openontology/{ontologyId}/sources/{sourceId}
/openontology/{ontologyId}/queries
/openontology/{ontologyId}/changesets
/openontology/{ontologyId}/changesets/{changeSetId}
/openontology/{ontologyId}/violations
/openontology/{ontologyId}/audit
/openontology/{ontologyId}/settings
```

### Query builder

The visual query builder should expose:

```text
Find [Person]
that [worksOn] [Project]
where Project [investigates] [Zero Knowledge]
as of [now]
using claim statuses [asserted]
show [Person name, Project name, sources, confidence]
```

It must display the generated portable query AST. Users can switch between form, YAML/JSON, table results, path results, and explanation.

### Empty, warning, and failure states

- An empty ontology should offer “Create a type,” “Import a starter package,” and “Open the Ethereum example.”
- A query with no matches should show the evaluated ontology version, time, claim-status policy, and filters.
- A stale source should show the last successful retrieval, current error, and affected claim count.
- A lossy export should list unsupported fields before writing the file.
- A conflict should show both proposed operations, their bases, affected claims, and resolution choices.
- A permission failure should name the missing scope without leaking private object existence.
- A validation error should link directly to the file/path and documentation for the failing rule.

### Accessibility and visual quality

- Graph colors cannot be the only way statuses are distinguished; labels and icons are required.
- Every graph must have a keyboard-accessible table/list alternative.
- Dense graph views must use progressive disclosure, filters, grouping, and focused paths.
- The PWA must preserve URL-addressable filters and selected entities.
- Source excerpts and diffs must be readable without horizontal scrolling on common desktop sizes.
- The site should look like a deliberate LogicSRC standards product, not a generic generated admin dashboard.

### Public-vs-private behavior

A package can be entirely public, entirely private, or mixed. Public export previews must clearly show what will be omitted or redacted. Private source excerpts must never be sent to an external model unless the user has selected an allowed model/provider policy for that source.

### Recommended default policies

```text
Local reads: allowed
Public remote reads: allowed only for public ontologies
Agent query: allowed with ontology:query
Agent proposal: allowed with ontology:claim:propose
Agent direct apply: denied by default
Human apply: requires ontology:claim:write
Entity merge: requires one curator approval
Bulk retraction: requires two approvals
Schema breaking change: requires maintainer approval and major version
Public package publish: requires maintainer approval and successful conformance suite
Action execution: policy-specific; denied when undeclared
```

## Success Metrics

### Specification completeness

1. All P0 normative objects have JSON Schema Draft 2020-12 contracts, valid fixtures, invalid fixtures, generated types, and documentation.
2. The manifest, entity type, relationship type, entity, claim, source, evidence, query, change set, review, approval, and event schemas pass CI.
3. A third party can implement package validation using only the published schemas and conformance fixtures.
4. The specification clearly separates normative requirements from reference implementation details.

### Functional acceptance

1. `logicsrc ontology init` creates a package that immediately passes strict validation.
2. The fictional Ethereum ecosystem fixture demonstrates at least 10 entity types, 12 relationship types, 50 entities, 150 claims, 25 sources, one dispute, one retraction, one supersession, one merge proposal, and five saved queries.
3. A user can load the package, query a multi-hop relationship, inspect the matched claims, and trace each answer to evidence.
4. A user can propose, review, approve, apply, reject, and compensate a change set through the SDK and CLI.
5. MCP and REST return results that validate against the same schemas as the CLI and SDK.
6. JSON → canonical JSON → YAML → canonical JSON round trips preserve the core model.
7. JSON-LD export/import round trips preserve all fields declared lossless by the compatibility profile.
8. Applying a change set emits deterministic events and produces the same resulting revision under Node.js and Bun.

### Safety acceptance

1. An agent with only `ontology:query` cannot propose or apply a claim.
2. An agent with `ontology:claim:propose` can create a proposed change set but cannot apply it.
3. `--yolo` cannot bypass merge, retraction, schema migration, public publish, or governed action approvals.
4. Prompt-injection text inside an imported source cannot alter configured scopes, tool policy, or system instructions.
5. Public export removes configured private source fields, excerpts, and sensitive properties.
6. Every applied mutation is attributable to an actor, request/run ID, policy decision, approval, and resulting event.
7. No test fixture, log snapshot, package artifact, or error message contains a real credential or private source excerpt.

### Performance targets for the reference engine

Measured on a typical developer laptop using warm local SQLite unless otherwise stated:

1. Validate a package with 1,000 entities and 10,000 claims in under 2 seconds.
2. Exact entity lookup by ID or external ID in under 50 ms at p95.
3. Common one-to-three-hop indexed queries over 10,000 claims in under 500 ms at p95.
4. Produce a semantic diff for a 100-operation change set in under 1 second.
5. Stream imports and exports without loading the entire dataset into memory.
6. Support at least 100,000 claims in the Turso reference deployment before specialized graph infrastructure is required.

These are reference-engine targets, not universal conformance requirements for every implementation.

### Developer experience

1. A new developer can install LogicSRC, initialize an ontology, validate it, run a query, and inspect an explanation in under ten minutes using the documentation alone.
2. All examples work on Ubuntu with supported Node.js and Bun runtimes.
3. CI exposes actionable schema paths and stable error codes rather than generic validation failures.
4. Package authors can test offline without creating a LogicSRC, CoinPay, model-provider, or cloud account.

### Adoption signals

1. At least three ontology packages beyond the Ethereum example are created using the standard.
2. At least one external tool consumes the schemas or conformance bundle without importing the reference engine.
3. At least one LogicSRC agent workflow uses OpenOntology for durable context and source-backed change proposals.
4. At least one non-TypeScript proof of compatibility can validate and query the core package format.

### Release gates

**OpenOntology 0.1 Draft** ships when Phase 0 is merged.

**OpenOntology 0.1 Reference** ships when:

- all P0 schemas and docs are complete;
- local SQLite engine and CLI pass conformance tests;
- the Ethereum fixture and explanation flow work;
- proposal/review/approval/application are auditable;
- Node.js and Bun compatibility tests pass.

**OpenOntology 1.0** is not declared until:

- at least two independent implementations or adapters pass the conformance suite;
- package versioning and migration rules have been exercised in production-like use;
- security review covers imports, source handling, permissions, change sets, and MCP/API writes;
- naming and compatibility documentation are stable;
- no unresolved P0 semantic question remains.

## Risks & Open Questions

### Risks

**Naming collision and confusion.** Multiple projects already use “Open Ontology” or similar names. LogicSRC should consistently use **LogicSRC OpenOntology**, namespace packages under `@logicsrc`, and avoid implying affiliation. A naming/trademark review should occur before a 1.0 announcement.

**Specification scope creep.** Ontology engineering can expand into complete semantic-web reasoning, workflow engines, data catalogs, vector search, and enterprise integration. The v0.1 boundary must remain entities, typed claims, provenance, time, queries, change sets, validation, and safe interfaces. Advanced reasoning and process orchestration remain later layers.

**False authority.** A clean graph can make uncertain claims look definitive. Status, confidence, evidence, source count, temporal validity, and dispute history must remain visible in queries and UI.

**Entity-resolution errors.** Merging two people or organizations incorrectly is more damaging than retaining duplicates. Merge defaults must be conservative, reviewable, and reversible through compensating history.

**Ontology drift.** Community schemas can accumulate overlapping types and predicates. Package imports, namespace rules, deprecation, compatibility checks, and maintainer governance are necessary.

**Data poisoning and prompt injection.** Public documents, issues, repositories, and APIs are untrusted inputs. Extraction agents must treat source text as data and produce schema-validated proposals under fixed permissions.

**Source licensing and privacy.** A public ontology may reference material that cannot be republished. Source metadata, excerpts, evidence selectors, exports, and model usage require license and privacy policy.

**Temporal complexity.** Valid time, observed time, and recorded time can confuse users and implementers. The docs and SDK must use consistent terms, examples, and defaults.

**Query portability.** A lowest-common-denominator query language may be too limited, while a feature-rich one may be difficult to implement. The v0.1 triple-pattern AST should stay small, with explicit adapter capability reporting.

**Database scalability.** SQLite/Turso is appropriate for the reference implementation but not every enormous graph. Storage abstraction and portable packages prevent the standard from becoming tied to the first engine.

**Graph UI overload.** Large node-link diagrams quickly become unusable. List/table views, paths, filters, clusters, saved queries, and focused exploration must be first-class.

**Governance bottlenecks.** Requiring review for every claim can stall large imports. Policy must support sampling, trusted adapters, batch approval, and risk tiers without eliminating auditability.

**Semantic mismatch during interoperability.** JSON-LD/RDF/SHACL/OWL systems may express semantics the core model does not. Imports and exports must report unsupported or lossy behavior.

**Agent overreach.** An operational ontology can become a path for agents to affect external systems. Typed actions, explicit scopes, side-effect declarations, idempotency, approval, and audit are mandatory before enabling actions.

### Decisions made by this PRD

1. **Canonical contracts are JSON Schema + canonical JSON.** YAML is an authoring convenience; JSON-LD is an interoperability profile.
2. **Claims are the canonical fact/edge format.** Engines may materialize relational or graph projections.
3. **History is append-only at the logical layer.** Retraction and correction do not erase prior records.
4. **The portable query language is a JSON/YAML triple-pattern AST.** Database-specific languages are adapters.
5. **Agent writes default to proposals.** Approval policy is separate from model confidence.
6. **The reference engine uses SQLite locally and Turso/libSQL when hosted.** The standard remains storage-agnostic.
7. **OpenOntology remains in the existing LogicSRC monorepo.** No new repository is created.
8. **The Ethereum ecosystem is an example package, not part of the core vocabulary.**
9. **Actions reference LogicSRC plugin tools.** Ontology packages do not embed arbitrary executable code.
10. **Node.js and Bun compatibility are required for the TypeScript reference implementation.**

### Open questions before Accepted status

1. Should the compact globally unique ID profile prefer HTTP IRIs, `urn:logicsrc:` identifiers, package-qualified IDs, or permit all three with one canonicalization rule?
2. Should package signatures use a minimal JWS profile first, a DID-based proof profile, Sigstore, or a pluggable signature envelope from day one?
3. Should query aggregation and path-finding enter P0, or remain P1 after the core triple-pattern evaluator is stable?
4. What excerpt-length and redistribution defaults should public source evidence use?
5. Should the public package registry be hosted at `logicsrc.com`, GitHub, npm, or expressed as a federated index format with multiple registries?
6. Which existing LogicSRC web app should own the `/openontology` route and reference explorer in the current monorepo?
7. Should the initial hosted reference API reuse the current production data service during migration, or launch directly on the Turso/libSQL adapter?
8. Is **LogicSRC OpenOntology** the final public name for 1.0, or should `OntologySpec`/`OpenKnowledge` be retained as fallback names because of existing projects?

### References and prior art

- dcbuilder’s ontology thread and Ethereum ecosystem motivation: <https://x.com/dcbuilder/status/2081095538678567213>
- Thread mirror describing people, organizations, codebases, research directions, products, ecosystem teams, L2s, and DeFi: <https://threadreaderapp.com/thread/2069163427885666365.html>
- Current LogicSRC site and standards positioning: <https://logicsrc.com/>
- LogicSRC repository: <https://github.com/profullstack/logicsrc>
- LogicSRC OpenPRD specification: <https://github.com/profullstack/logicsrc/blob/master/docs/openprd.md>
- JSON Schema Draft 2020-12: <https://json-schema.org/draft/2020-12>
- JSON-LD 1.1: <https://www.w3.org/TR/json-ld11/>
- W3C PROV-O: <https://www.w3.org/TR/prov-o/>
- SHACL: <https://www.w3.org/TR/shacl/>
- Decentralized Identifiers: <https://www.w3.org/TR/did-core/>
- External operational-ontology prior art, not a dependency: <https://open-ontology.com/>
