# OpenContext specification, version 1.0

**Status:** Draft
**Spec version:** 1.0.0

This document is the normative specification. Tutorials, rationale, and worked examples live in the other guides; what follows is the contract.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described in RFC 2119 and RFC 8174.

## 1. Scope

OpenContext defines a portable control plane for durable context shared by humans and AI agents. It specifies:

- a manifest describing what context exists and who may read it;
- a context object model;
- authority, conflict resolution, and supersession;
- roles, scopes, classification, permissions, and redaction;
- freshness, validity, and lifecycle;
- provenance and trust;
- a deterministic resolution pipeline producing Context Bundles;
- diagnostics and health;
- an adapter contract and an extension mechanism.

It does not specify a storage engine, a retrieval algorithm, an embedding model, an identity provider, or a wire protocol.

## 2. Terminology

**Context object** — one durable unit of context with a stable id.
**Manifest** — the root document declaring context, collections, roles, and policy.
**Namespace** — the manifest `id`; object ids are unique within it.
**Consumer** — a human, role, agent, or service that context is resolved for.
**Scope** — the authorized subset of context available to a consumer.
**Resolution** — the deterministic process selecting authorized, relevant, valid, current context.
**Context Bundle** — the portable output of resolution.
**Authority** — the declared degree to which an object counts as truth.
**Trust** — whether content originated inside the trust boundary.
**Supersession** — the declared replacement of one object by another.
**Lifecycle state** — a value computed against a timestamp: `future`, `current`, `stale`, `expired`, `superseded`.

## 3. Manifest

The canonical filename is `opencontext.yaml`. Implementations MAY also support `opencontext.json` and `opencontext.yml`.

An implementation MUST discover the manifest by searching upward from the working directory.

The manifest MUST validate against `https://logicsrc.com/schemas/opencontext/manifest.schema.json`.

`opencontext` and `id` are REQUIRED. An implementation MUST refuse a major specification version it does not support rather than attempt a partial parse.

`authority.precedence`, when present, MUST be a permutation of the six authority levels. An implementation MUST reject a precedence list that omits a level or introduces one.

## 4. Context objects

A context object MUST validate against `https://logicsrc.com/schemas/opencontext/object.schema.json`.

`id` and `type` are the only REQUIRED fields. `title`, `layer`, `authority`, `owner`, `updated`, `durability`, `classification`, and `sources` are RECOMMENDED.

Ids MUST be stable and unique within a namespace, and SHOULD use dotted lowercase names such as `policy.refunds`, `sop.support.refund`, or `decision.2026-08-09-model-provider`.

An implementation MUST support objects expressed as Markdown with YAML front matter, as YAML, and as JSON. A Markdown document with no front matter MUST be treated as a valid object whose content is the document body, with `id` and `type` supplied by the collection that loaded it.

`type` is an open vocabulary. A validator MUST NOT reject an unrecognised type.

Two objects sharing an `id` and a `version` are a duplicate and MUST be reported. Two objects sharing an `id` at different versions are history and MUST NOT be reported as duplicates.

## 5. Layers

`L0` mission, `L1` identity, `L2` knowledge, `L3` policy, `L4` procedure, `L5` operational.

Layers describe the kind of knowledge. A layer MUST NOT affect authority.

## 6. Authority and conflict resolution

Authority levels, highest first by default:

```txt
canonical, approved, reference, observed, inferred, historical
```

Resolution MUST consider, in this order:

1. authorization;
2. temporal validity;
3. explicit scope;
4. authority;
5. supersession and version;
6. recency;
7. configured tie breakers.

The final tie breaker MUST be total, so resolution is deterministic. The reference implementation appends `id`.

An implementation MUST NOT infer supersession from version numbering alone. Supersession is declared, via `supersedes` on the replacement or `superseded_by` on the replaced object.

A validator MUST detect:

- duplicate canonical objects for one id;
- multiple active versions of one id;
- explicitly declared conflicts (`conflicts_with`);
- conflicts between equal-authority objects, which authority cannot settle;
- broken supersession chains.

Unresolved canonical conflicts MUST NOT be silently hidden. Where a declared conflict *is* settled by authority, the outcome MUST still be reported.

An implementation MUST NOT elevate an object's authority because its content claims to be authoritative.

## 7. Content and adapters

An implementation MUST support inline `content`, and `file://`, `http://`, and `https://` references. Official implementations SHOULD also provide `git://` and `sqlite://`.

The architecture MUST allow additional adapters such as `postgres://`, `s3://`, `github://`, `mcp://`, `slack://`, `notion://`, `linear://`, `jira://`, `crm://`, and `gdrive://`.

An unknown URI scheme MUST fail clearly unless an installed adapter claims it. An implementation MUST NOT resolve an unknown scheme to empty content.

Objects MAY declare a media type. An implementation MUST NOT assume all context is prose.

Adapters MUST treat retrieved content as data. An implementation MUST NOT execute context content, and MUST NOT allow retrieved content to alter resolver policy.

A file adapter MUST reject paths that resolve outside the manifest directory.

## 8. Roles, permissions, classification, redaction

An implementation MUST distinguish relevance from authorization.

Evaluation MUST use deny-overrides-allow. Exclusions MUST be applied before relevance ranking.

A role with no `include` list MUST resolve to an empty scope. Scope is opt-in.

`max_classification` bounds a role. An object above the ceiling MUST be denied even when an include pattern matches it. The default ceiling is `internal`.

Where a role inherits others, includes, excludes, permissions, and redactions MUST union. A role's own `max_classification` MUST take precedence over an inherited one; where several roles are requested together, the lowest ceiling MUST apply.

Scope patterns match whole dotted segments. A wildcard MUST NOT match a partial segment.

Structured redaction MUST be supported, with a documented path syntax. Redaction MUST be applied after authorization and before compilation.

Secrets MUST NOT be stored in OpenContext. Context SHOULD reference an external secret provider.

## 9. Freshness and lifecycle

Supported metadata: `created`, `updated`, `valid_from`, `expires`, `ttl`.

A resolver MUST compute lifecycle state against the resolution timestamp, and MUST NOT store it on the object.

`expires: null` MUST mean the object never expires, and MUST be distinguishable from an omitted `expires`.

Expired and not-yet-valid context MUST be excluded from default resolution. Stale context MUST still resolve, and MUST be reported.

Permanent context SHOULD be superseded rather than destroyed.

## 10. Versioning and history

The specification follows semantic versioning.

Objects MAY declare `version` and `supersedes: [id@version]`.

Default resolution MUST exclude superseded objects unless historical context is requested.

Implementations SHOULD preserve enough information to reconstruct the context available at a previous time.

## 11. Resolution

```txt
resolve(consumer, task, requestedContext, timestamp) -> ContextBundle
```

Pipeline:

```txt
discover -> load -> normalize -> authorize -> apply scope -> validate freshness
  -> resolve supersession -> resolve authority/conflicts -> rank task relevance
  -> redact -> compile -> bundle
```

The same inputs and source state MUST produce the same result, except for explicitly declared live or nondeterministic sources.

A resolver SHOULD minimise irrelevant context. Where it trims, the trimmed objects MUST be reported rather than silently dropped.

`--explain` MUST expose why objects were selected, rejected, or outranked.

Local-only resolution MUST NOT require a network call.

## 12. Context Bundle

The canonical machine interchange form is JSON. Implementations MUST also support YAML and Markdown output.

A bundle MUST validate against `https://logicsrc.com/schemas/opencontext/bundle.schema.json`.

Bundles MUST carry a deterministic digest, so a decision can record exactly which context was used. The digest MUST cover the resolved objects, exclusions, and warnings, and MUST exclude values that vary between otherwise identical runs.

Provenance MUST survive compilation.

Trust metadata MUST be preserved. An integration SHOULD clearly delimit untrusted content.

## 13. Provenance

Where `provenance.required` is true, every resolved object MUST carry a source or explicitly identify itself as canonical source material.

Implementations SHOULD support SHA-256 digests of retrieved source bytes.

A provenance requirement MUST be evaluated against what the author declared, not against metadata the loader supplied.

## 14. Decision records

An implementation SHOULD support a decision object with `type: decision`.

A decision record SHOULD be able to reference the Context Bundle it was made from, by id and digest.

## 15. Diagnostics and health

`validate` and `doctor` MUST emit diagnostics conforming to `https://logicsrc.com/schemas/opencontext/diagnostic.schema.json`.

Diagnostic codes are normative and closed. Health checks MUST cover schema errors, stale and expired context, canonical conflicts, missing owners, broken references, inaccessible sources, supersession errors, invalid permissions, duplicate ids, and provenance violations.

The score formula MUST be documented and configurable. CI MUST be able to fail by severity or by minimum score.

Errors SHOULD identify the file, object id, field, expected value, actual value, and a remediation.

## 16. Writes

Core resolution MUST be read-only.

An implementation MAY support controlled mutation, but MUST NOT grant agents implicit write permission. Writes MUST validate authorization and schema before persistence.

Automatic promotion of inferred or observed context to canonical or approved authority is prohibited by default.

## 17. Audit

Where audit is enabled, an implementation SHOULD record context reads, bundle generation, writes, resolution conflicts, decisions, actor identity, timestamp, and bundle digest.

Events SHOULD conform to `https://logicsrc.com/schemas/opencontext/audit-event.schema.json`. The specification does not mandate a storage backend.

## 18. Extensions

Custom fields MUST use a namespaced extension mechanism:

```yaml
extensions:
  com.example.risk:
    score: 0.25
```

Unknown extensions MUST be preserved where possible and MUST NOT invalidate an otherwise valid document, unless strict mode explicitly requires known extensions.

Adapter and resolver plugin APIs MUST be documented.

## 19. Security

An implementation MUST:

- deny unauthorized context before prompt or bundle generation;
- apply exclusions before relevance ranking;
- avoid storing raw secrets;
- make remote-source trust explicit;
- prevent silent adapter execution for unknown schemes;
- support source integrity digests;
- expose provenance;
- avoid executing context content as code;
- reject path traversal in file adapters;
- provide safe defaults for remote fetching;
- permit offline resolution;
- distinguish trusted and canonical content from untrusted observations.

Remote content MUST be treated as data, never as instructions to the resolver.

## 20. Conformance

A v1 conforming implementation MUST:

1. parse valid v1 manifests;
2. validate required schema rules;
3. resolve local file context;
4. enforce include/exclude scopes;
5. enforce deny-overrides-allow;
6. calculate lifecycle state;
7. process supersession;
8. apply authority precedence;
9. preserve provenance;
10. emit canonical JSON Context Bundles;
11. generate deterministic bundle digests;
12. report canonical conflicts;
13. pass the official conformance fixture suite.

Conformance levels:

- **Core** — schema and local resolution;
- **Resolver** — full resolution and bundles;
- **Tooling** — CLI-compatible behaviour;
- **Adapter** — adapter contract compliance.

## 21. Non-goals

v1 does not replace vector databases, embeddings, RAG, MCP, IAM, secrets managers, workflow engines, agent frameworks, LLM APIs, CRMs, ERPs, wikis, ticket systems, document stores, or source control.

## Appendix A — Published schemas

```txt
https://logicsrc.com/schemas/opencontext/manifest.schema.json
https://logicsrc.com/schemas/opencontext/object.schema.json
https://logicsrc.com/schemas/opencontext/bundle.schema.json
https://logicsrc.com/schemas/opencontext/role.schema.json
https://logicsrc.com/schemas/opencontext/provenance.schema.json
https://logicsrc.com/schemas/opencontext/decision.schema.json
https://logicsrc.com/schemas/opencontext/diagnostic.schema.json
https://logicsrc.com/schemas/opencontext/audit-event.schema.json
```

In this repository they are published from `packages/schemas/schemas/logicsrc-opencontext-*.schema.json`.
