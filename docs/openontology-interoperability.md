# OpenOntology interoperability

How OpenOntology relates to JSON Schema, JSON-LD, RDF, SHACL, PROV-O, and external identifier systems — and, just as importantly, where the mappings stop. Companion to [OpenOntology](./openontology.md).

The guiding rule: **report what a format cannot carry; never drop it silently.**

## Where each format sits

| Format | Role |
| --- | --- |
| **JSON Schema 2020-12** | Canonical, normative contract. The schemas *are* the standard. |
| **Canonical JSON** | Deterministic bytes for hashing, signing, diffing, publishing. |
| **YAML** | Human authoring convenience. Compiles to canonical JSON. |
| **NDJSON** | Streaming format for large entity/claim/source files. |
| **JSON-LD 1.1** | Interoperability profile for the semantic-web world. |
| **RDF / Turtle** | Planned export of the losslessly mappable subset. |
| **SHACL** | Planned mapping for the constraint subset with equivalent semantics. |
| **PROV-O** | Vocabulary reused for provenance where the semantics genuinely match. |

OpenOntology does not require RDF, OWL, SPARQL, or a triple store. It maps to them so that consumers who need formal reasoning can get there.

## JSON-LD

```bash
logicsrc ontology export --dir ./ethereum-ecosystem --format jsonld --out graph.jsonld
```

Entities become nodes. Claims are **reified** — each claim is its own node with subject, predicate, object, status, time, confidence, and provenance — because the provenance is the point. A bare triple cannot say "asserted by this agent, from this commit, valid since April, confidence 0.94."

Provenance terms alias PROV-O rather than inventing parallel vocabulary:

| OpenOntology | JSON-LD term |
| --- | --- |
| `assertedAt` | `prov:generatedAtTime` |
| `assertedBy` | `prov:wasAttributedTo` |
| `sources` | `prov:wasDerivedFrom` |
| `runId` | `prov:wasGeneratedBy` |
| `confidence` | `oo:confidence` (`xsd:double`) |
| `validTime.from` / `.to` | `oo:validFrom` / `oo:validTo` |
| `status` | `oo:status` |

Compact ids canonicalize to IRIs against the package namespace; the `Namespace` object binds the prefix, which is what makes the reverse direction unambiguous. The round trip `JSON → JSON-LD → JSON` preserves ids, types, subjects, predicates, objects, typed values, language tags, statuses, times, confidence, sources, evidence, and supersession links.

### Lossy fields

The 0.1 JSON-LD profile does **not** carry: `tags`, `license`, `visibility`, `retention`, `changeSet`, `model`, `firstParty`, `derivedFrom`, `retractionReason`, and `extensions`. Export reports them per object:

```txt
warning: 3 object(s) have fields this format cannot carry:
  eth:claim:0042: tags, license
```

The same holds in the other direction: importing a foreign vocabulary that expresses semantics the core model lacks reports the gap instead of quietly discarding it.

## External identifiers

An entity carries namespaced external ids without treating any external service as the identity authority:

```yaml
externalIds:
  github: averyl
  wikidata: Q000000
  orcid: 0000-0000-0000-0000
  did: "did:example:abc"
```

Lookup works by exact id, canonical name, alias, or external id. `findEntities` returns **ranked candidates with the evidence for each match** — never a silent single answer.

`sameAs` is a reviewable claim, not an implicit merge. Two records only become one through an approved `merge-entity` operation, and the losing id survives as a redirect.

## RDF and Turtle

```bash
logicsrc ontology export --dir ./ethereum-ecosystem --format turtle --out graph.ttl
```

Claims are reified, exactly as in JSON-LD, and an **asserted relationship claim additionally emits the plain triple** — so a consumer that only wants the current accepted graph gets one without unpacking provenance.

Import parses the profile this exporter produces rather than pretending to be a general Turtle parser. Anything it cannot interpret is listed in `unsupported`, never dropped silently.

## SHACL

```bash
logicsrc ontology export --dir ./ethereum-ecosystem --format shacl --out shapes.ttl
```

Five constraint kinds map onto SHACL Core: `required-predicate`, `cardinality`, `allowed-values`, `domain-range`, and `temporal-bounds`. Severity carries across (`error` → `sh:Violation`, `warning` → `sh:Warning`).

Two do **not**, and are reported as unmapped in the returned value *and* as comments in the generated Turtle:

- `unique` — graph-wide uniqueness has no portable SHACL Core equivalent; it needs a `sh:SPARQLConstraint`.
- `query` — an OpenOntology saved query is a triple-pattern AST, not SPARQL.

A shape that silently means something narrower than the constraint it came from is worse than no shape, so those stay unmapped until the mapping is real.

## OWL/RDFS

Still planned. An optional mapping for consumers needing formal reasoning. OpenOntology itself infers nothing: transitivity, symmetry, and inverses apply only when the schema declares them *and* a query asks.

## Compatibility matrix

| Target | 0.1 status | Notes |
| --- | --- | --- |
| JSON Schema 2020-12 | **supported** | Canonical contract; 16 object kinds |
| Canonical JSON + digest | **supported** | Deterministic across Node.js and Bun |
| YAML authoring | **supported** | Same digest as equivalent JSON |
| NDJSON | **supported** | Streaming entity/claim/source/evidence files |
| JSON-LD 1.1 export | **supported** | Reified claims, PROV-O aliases, lossy report |
| JSON-LD 1.1 import | **supported** | Round-trips the reference profile |
| PROV-O | **partial** | Provenance terms aliased in JSON-LD and Turtle; full mapping later |
| RDF / Turtle export | **supported** | Reified claims + plain triples for asserted relationships |
| RDF / Turtle import | **supported** | Round-trips the reference profile; reports what it cannot read |
| SHACL | **partial** | 5 of 7 constraint kinds; `unique` and `query` reported as unmapped |
| OWL / RDFS | planned | Optional, for external reasoners |
| SPARQL | planned | Query AST → SPARQL adapter |
| Cypher | planned | Query AST → Cypher adapter |
| Datalog | planned | Query AST → Datalog adapter |
| SQLite / Turso | **supported** | `createLibsqlStore`, versioned migrations, FTS5 entity search |
| REST + OpenAPI | **supported** | 16 paths, described at `/api/ontologies/openapi` |
| Server-Sent Events | **supported** | Same event objects as the JSON endpoint |
| MCP | **supported** | Resources, tools, and prompts; writes propose, never apply |
| Neo4j / vector DBs | not required | Optional adapters; never mandatory |

## Query portability

The triple-pattern AST is deliberately small so a second implementation is achievable. Adapters translate it to SQL, SPARQL, Cypher, or Datalog and must **report their capabilities** — an adapter that cannot do multi-hop traversal or `asOf` says so rather than returning a subtly wrong answer.

Aggregation, grouping, faceting, and path-finding are P1: useful, but not in the 0.1 evaluator, so that the portable core stays implementable.

## Embeddings

Optional, rebuildable, provider-neutral derived data. They may improve discovery; they are never the sole representation of a fact and never authoritative. A package with its embeddings deleted loses nothing canonical.

## Importing

Imports **propose**; they never apply:

```bash
logicsrc ontology import --file graph.jsonld --dir ./my-ecosystem
```

```json
{ "entities": 63, "claims": 169, "proposedOperations": 12 }
```

The result is a set of operations for a change set. Source adapters must declare whether they can read public data, private data, incremental changes, and deletions, and what licence the source carries. An ingestion run is repeatable from its declared sources, mappings, parser version, and model configuration.

Deduplication runs on stable id, external id, exact alias, normalized URL, and reviewed similarity candidates — with the last of those always going to a human.
