# OpenOntology

**LogicSRC OpenOntology** is an open contract for durable, source-backed domain knowledge shared by humans and AI agents. Define the things in a domain, connect them with typed claims, preserve where each fact came from, and let agents query or propose changes through governed interfaces.

It is a **standard**, not a product. The normative contracts are JSON Schemas published under `https://logicsrc.com/schemas/openontology/`. `@logicsrc/openontology` is *a* reference implementation of those schemas — useful, but not the definition. Any storage engine, language, or model provider that satisfies the schemas and passes the [conformance bundle](#conformance) conforms.

- Storage-agnostic — SQLite locally, Turso/libSQL hosted, or your own adapter. No graph database required.
- Model-provider-neutral — no LLM is needed to validate, query, or explain anything.
- Usable offline — no account, no API key, no network.

Status: **0.1 Draft** ([OpenPRD 0001](../prd/0001-add-logicsrc-openontology-spec.md)).

## Five nouns

Everything in OpenOntology is one of five things. Learn these and you can read any package.

| Noun | What it is | Example |
| --- | --- | --- |
| **Type** | What kind of thing something is | `Person`, `Project`, `Codebase` |
| **Entity** | A specific thing with a stable id | `eth:person:avery-lindqvist` |
| **Claim** | A typed statement about an entity, or between two | *Avery* —`worksOn`→ *ZK Prover* |
| **Source** | Where the claim came from | a commit, a page, an API response |
| **Change set** | A reviewable proposal to add, correct, merge, dispute, or retract | "Add Alice to ZK Prover" |

We say **claim**, not *fact*. A claim carries a status, a confidence, a time range, and its sources — so a reader can tell the current accepted view apart from something an agent proposed twenty minutes ago.

## Quick start

No login, no hosted database, no model key, no network.

```bash
logicsrc ontology init my-ecosystem
logicsrc ontology validate my-ecosystem --strict
logicsrc ontology query run contributors --dir my-ecosystem --format table
logicsrc ontology query explain contributors --dir my-ecosystem --row 0
```

`init` writes a package that passes strict validation with no edits:

```txt
Created my-ecosystem/openontology.yaml
Created 3 entity types, 4 relationship types, 8 entities, 14 claims, 2 sources.
```

```txt
  ✓ 3 entity types
  ✓ 4 relationship types
  ✓ 8 entities
  ✓ 14 claims
  ✓ 2 sources
  ✓ 1 constraints
OpenOntology package is valid.
```

## The four layers

| Layer | Contains | Where it lives |
| --- | --- | --- |
| **Schema** | Entity types, properties, relationship types, constraints, saved queries, actions | `schema/` |
| **Knowledge** | Entities, claims, sources, evidence | `data/` |
| **Governance** | Change sets, reviews, approvals, policy, signatures, events | runtime + `changesets/` |
| **Runtime** | Queries, explanations, imports, governed actions, CLI/SDK/MCP/REST | your process |

The schema can always be fetched separately from the populated graph, and a package can always be exported without private runtime state or credentials.

## Package layout

```txt
openontology/
  openontology.yaml        # identity, namespace, license, maintainers, file map
  schema/
    namespaces.yaml
    entity-types.yaml
    properties.yaml
    relationships.yaml
    constraints.yaml
    queries.yaml
  data/
    entities.ndjson
    claims.ndjson
    sources.ndjson
    evidence.ndjson
```

Small packages may inline arrays directly in the manifest. Large datasets should use newline-delimited JSON so implementations can stream validation and import.

YAML is an authoring convenience. Everything compiles to **canonical JSON** — keys sorted, `undefined` dropped, `-0` normalized — before anything is hashed, signed, diffed, or published. A YAML-authored package and a JSON-authored package with the same model produce byte-identical digests.

## Identifiers

Three forms are accepted, with one canonicalization rule between them:

```txt
compact   eth:person:alice              →  <namespace>person/alice
IRI       https://example.org/person/a  →  unchanged
URN       urn:logicsrc:person:alice     →  unchanged
```

Prefer the compact form: short, diffable, and stable when a package moves namespace. A `Namespace` object binds the prefix to the namespace IRI, which is what lets an exported IRI be read back as a compact id.

Ids never change when a display name or alias changes. A merge keeps the losing id forever as a redirect, so old references keep resolving.

## Claims

A relationship is a claim whose object is an entity. A scalar property is a claim whose object is a typed value. Never both.

```yaml
openontology: "0.1"
kind: Claim
id: "eth:claim:0042"
subject: "eth:person:avery-lindqvist"
predicate: worksOn
object:
  entity: "eth:project:zk-prover"
status: asserted
confidence: 0.94
validTime:                        # domain time: when it was true
  from: 2026-04-01T00:00:00Z
  to: null
assertedAt: 2026-07-25T19:43:12Z  # system time: when we recorded it
assertedBy: "agent:research-mapper"
runId: "run_01J3EXAMPLE"
sources: ["eth:source:commit-a41f"]
evidence: ["eth:evidence:007"]
```

Six statuses, each independently filterable in a query:

| Status | Meaning |
| --- | --- |
| `asserted` | Part of the current accepted view |
| `proposed` | Suggested, not yet accepted |
| `disputed` | Contradicted by another claim or a reviewer |
| `retracted` | Withdrawn; kept on the record |
| `superseded` | Replaced by a later claim |
| `derived` | Produced by a rule or query, with its inputs recorded |

**History is append-only.** Claims are never edited in place. A dispute, retraction, or supersession appends a status transition, and the effective status is the latest one. The record of what was believed, and when, survives every correction.

Two clocks matter and are kept apart: **valid time** (when the statement was true in the world) and **recorded time** (when the system learned it). `asOf` queries the first; `recordedAsOf` queries the second.

Every claim must either cite a source or declare `firstParty: true`. Agent-authored claims must carry a `runId`. Derived claims must say what produced them. These are validation errors, not lint.

## Querying

The portable query language is a JSON/YAML triple-pattern AST — not SPARQL, not Cypher, not a bespoke text parser. Database-specific languages are adapters over it.

```yaml
openontologyQuery: "0.1"
match:
  - subject: "?person"
    predicate: worksOn
    object: "?project"
  - subject: "?project"
    predicate: investigates
    object: "eth:topic:zero-knowledge"
where:
  - variable: "?person"
    field: status
    operator: eq
    value: active
select: ["?person", "?project"]
include:
  claimStatus: [asserted]
asOf: 2026-07-26T00:00:00Z
limit: 100
```

Terms beginning with `?` are variables; everything else is a constant. Multi-hop traversal is just more patterns. Supported operators: `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `in`, `not-in`, `exists`, `not-exists`, `contains`, `starts-with`, `matches`, `before`, `after`; plus `distinct`, `orderBy`, `limit`, `offset`.

Nothing is inferred. Transitivity, symmetry, and inverses apply only when the schema declares them *and* the query asks for them.

Implementations enforce server-side limits on depth, intermediate bindings, scanned claims, and row count. Exceeding one is an error, never a silent truncation.

### Explanation

Every answer can be traced back to the claims that produced it:

```bash
logicsrc ontology query explain orgs-behind-a-network --dir . --row 0
```

```txt
### Why this row is present

Ontology: `ethereum-ecosystem@0.1.0`
Claim statuses included: asserted

1. `eth:l2:tessera` —deployedOn→ `eth:network:mainnet-sim`
   - status: asserted, confidence: 0.9
   - asserted by mailto:curator@example.org at 2026-07-26T00:00:00Z
   - source: Layer-2 registry <https://example.org/api/l2s>
```

Answer → claims → evidence → sources, every time.

## Change sets

All writes go through a change set. It is the unit of atomicity, review, and audit.

```yaml
openontology: "0.1"
kind: ChangeSet
id: "changeset:01J3EXAMPLE"
title: Add Alice as a contributor to the ZK prover project
rationale: Public repository activity and the team page identify the contribution.
createdBy: "agent:research-mapper"
runId: "run_01J3EXAMPLE"
operations:
  - op: add-entity
    value: { id: "eth:person:alice", type: Person, canonicalName: Alice }
  - op: assert-claim
    value:
      subject: "eth:person:alice"
      predicate: worksOn
      object: { entity: "eth:project:zk-prover" }
requiredApprovals: 1
status: proposed
```

Nine operations: `add-entity`, `update-metadata`, `assert-claim`, `dispute-claim`, `retract-claim`, `supersede-claim`, `merge-entity`, `archive-entity`, `schema-migration`. There is no delete.

A change set applies whole or not at all. Every operation is checked against the store first, so a batch with one bad operation leaves nothing behind. If it was authored against an older revision than the store's current one, it fails as a conflict — last-write-wins is never the default. Rollback is a new compensating change set, never a deletion.

Reviewers see semantic impact, not raw JSON:

```txt
Change set: Merge S. Haddad into Samir Haddad

+ 1 entities merged
! merging eth:person:s-haddad into eth:person:samir-haddad is reversible only via a compensating change set

Affected saved queries
  people-working-on-topic: result count 18 → 19

Approval policy
  1 approval(s) required
```

See [OpenOntology governance](./openontology-governance.md) for the review, approval, and policy model.

## Safety model

The short version: **an agent proposes, a human applies.**

- Agent-created change sets default to `proposed`. Agents cannot apply directly — not with every scope, not at high confidence, not in unattended mode.
- Confidence is metadata, never permission.
- `--yolo` and unattended execution cannot bypass a required approval.
- Source text is data. An instruction embedded in an imported document cannot widen scopes, change policy, or move tool boundaries.
- Model chain-of-thought is never stored. Inputs, outputs, evidence, policy decisions, and a short rationale are.
- Every applied mutation records actor, client, request id, policy decision, approvals, and resulting events.

## Validation

```bash
logicsrc ontology validate . --strict --format markdown
```

Four severities, reported separately: **error**, **warning**, **info**, **policy**. Only errors fail the run.

Checks cover JSON Schema structure, manifest integrity, referenced files, unique ids, id form, declared types, predicate domain and range, object datatypes, dangling references, temporal ordering, provenance completeness, agent run attribution, derivation inputs, excerpt limits and licensing, source staleness, and every declared constraint.

Constraints are deterministic — required predicates, cardinality, uniqueness, allowed values, domain/range, temporal bounds, and saved-query checks. No LLM decides conformance.

Every finding carries a stable code (`OO-G-DOMAIN`, `OO-P-NO-SOURCE`, `OO-C-CARDINALITY`, …), the object id, the file, the path, and a remediation hint where one is known. `--strict` promotes the "unknown type / unknown predicate / unnamespaced extension" family from warning to error.

## CLI

```txt
logicsrc ontology init|validate|lint|build|inspect
logicsrc ontology entity   get|list|find|merge
logicsrc ontology claim    get|list|history|propose|assert|dispute|retract
logicsrc ontology query    run|explain|list
logicsrc ontology changeset list|create|diff|apply
logicsrc ontology import|export|audit
```

Read commands take `--format table|json|yaml|markdown|ndjson`. Write commands produce a **proposal** by default. Exit codes are stable for CI: `0` ok, `1` validation failed, `2` usage error, `3` not found, `4` denied or approval required.

`--as local|agent|reader` selects the actor role. It cannot grant an agent apply rights; the policy layer denies those outright.

## SDK

```ts
import { createOntologyEngine, loadOntologyPackage, localActor } from "@logicsrc/openontology";

const engine = createOntologyEngine({
  package: loadOntologyPackage("./ethereum-ecosystem"),
  actor: localActor("curator@example.org")
});

const result = engine.queryOntology("people-working-on-topic", { topic: "eth:topic:zero-knowledge" });
const why = engine.explainOntologyResult(result.id, 0);

const changeSet = engine.createOntologyChangeSet({
  title: "Add Alice to ZK Prover",
  operations: [{ op: "assert-claim", value: { /* … */ } }]
});
engine.approveOntologyChangeSet(changeSet.id);
engine.applyOntologyChangeSet(changeSet.id);
```

Storage, source adapters, query engine, identity, policy, events, and signatures are all injectable interfaces. The clock and id factory are injectable too, so a build, an applied change set, and a test run produce byte-identical output under both Node.js and Bun.

## Interoperability

JSON Schema Draft 2020-12 is the canonical contract. JSON-LD 1.1 is the interoperability profile, aliasing W3C PROV-O for provenance where the semantics genuinely match. Exports report every field the target format cannot carry rather than dropping it silently. See [OpenOntology interoperability](./openontology-interoperability.md).

## Conformance

`packages/schemas/fixtures/openontology/` ships a conformance bundle: `conformance.json` lists valid fixtures that must validate and invalid fixtures that must be rejected, for all sixteen normative object kinds. It depends only on the published schemas — a third-party implementation can run it without any LogicSRC code.

An implementation conforms to OpenOntology 0.1 when it:

1. validates every valid fixture and rejects every invalid one;
2. treats claims as append-only, computing current state from status and time;
3. defaults agent writes to proposals and enforces approval policy on merges, bulk retractions, breaking migrations, and publishing;
4. can trace any answer to claims, evidence, and sources;
5. produces the canonical-JSON digest the bundle specifies for a given package.

## What OpenOntology is not

- Not one universal ontology for every domain.
- Not a complete OWL reasoner, and not full RDF/SHACL/SPARQL.
- Not a replacement for your system of record — it is a semantic and provenance layer over it.
- Not a place where embeddings or model output are authoritative. Embeddings are optional, rebuildable, derived data; canonical facts are explicit claims.
- Not the only open ontology engine, and not the invention of ontologies. Prior art in the semantic-web world long predates it, and OpenOntology maps to that work rather than replacing it.

## Related

- [OpenOntology governance](./openontology-governance.md) — review, approval, policy, signatures
- [OpenOntology interoperability](./openontology-interoperability.md) — JSON-LD, RDF, SHACL, PROV-O, external ids
- [OpenPRD 0001](../prd/0001-add-logicsrc-openontology-spec.md) — the proposal, its decisions, and its open questions
- [Permissions](./permissions.md) — LogicSRC scope conventions
- [Data model](./data-model.md) — tasks, agents, runs, and events OpenOntology references
