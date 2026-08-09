---
openprd: "0.2"
id: "0003"
title: "Add the LogicSRC OpenContext specification"
status: Draft
authors:
  - anthony@profullstack.com
created: 2026-08-09
updated: 2026-08-09
repo: profullstack/logicsrc
discussion:
implementation:
tags:
  - opencontext
  - context
  - agents
  - permissions
  - provenance
  - schemas
supersedes:
superseded-by:
---

## Problem

Organizational context is fragmented across prompts, employee memory, agent
histories, vector stores, repositories, wikis, chats, issue trackers, CRMs,
spreadsheets, SOPs, databases, and proprietary memory systems.

The cost lands hardest when a worker is replaced. Swap an agent's model or
vendor and whatever it had learned goes with it; the organization re-teaches the
replacement from scratch. The same thing happens more slowly when a person
leaves.

The symptoms are specific and familiar: an agent confidently quoting last year's
pricing, two teams operating from two different refund policies with nobody able
to say which is authoritative, a support agent that can read the payroll file
because scope was never modelled, and a decision nobody can reconstruct because
the context it was made from is gone.

Underneath all of them is one missing thing: no portable, permissioned
description of **what the organization knows, which parts are authoritative, who
may read them, and how current they are**.

## Goals

- An agent can be replaced — different model, different vendor, different
  framework — without the organization losing knowledge.
- Any two consumers of the same repository provably receive the context their
  role entitles them to, and nothing else.
- A decision made by an agent can be reconstructed a year later, including which
  context was and was not in front of it.
- Context rot is visible: stale, expired, conflicting, orphaned, and unowned
  context is reported and can fail CI.
- The whole thing runs from a folder and a Git repository, with no hosted
  account, no server, and no telemetry.
- A third-party implementation can conform using published schemas and fixtures
  without reading LogicSRC source.

## Non-Goals

OpenContext does not replace vector databases, embeddings, RAG, MCP, IAM,
secrets managers, workflow engines, agent frameworks, LLM APIs, CRMs, ERPs,
wikis, ticket systems, document stores, or source control.

It is not a memory database. Memory is one possible context source; OpenContext
is the control plane above sources that remain the systems of record.

It does not authenticate callers. It enforces what a *named* consumer may read;
establishing who is asking belongs to the host application.

Semantic and vector retrieval are out of core conformance. They may be provided
by adapters or plugins, and must never be required to resolve context.

## Users

Primary: AI-agent developers, agent framework maintainers, AI-native companies,
engineering teams, platform engineers, operations teams, and developers running
more than one agent against shared knowledge.

Secondary: enterprises, consultants, security and compliance teams,
knowledge-management teams, DevOps and SRE teams, and individual agent-stack
developers.

## Requirements

- R1 [P0] Define `opencontext.yaml` and publish a JSON Schema for it.
- R2 [P0] Define a portable context object supporting inline and referenced
  content, with `id` and `type` as the only required fields.
- R3 [P0] Define the six standard context layers, L0 mission through L5
  operational.
- R4 [P0] Define six authority levels and deterministic conflict resolution,
  with a total ordering so resolution is reproducible.
- R5 [P0] Detect duplicate canonical objects, multiple active versions, declared
  conflicts, ambiguous equal-authority conflicts, and broken supersession, and
  never hide an unresolved canonical conflict.
- R6 [P0] Define roles, scopes, classifications, object-level permissions, and
  redaction, evaluated deny-overrides-allow with authorization strictly before
  relevance.
- R7 [P0] Support freshness, validity windows, expiry, review cadence, and
  durability, with lifecycle state computed against a timestamp rather than
  stored.
- R8 [P0] Support versioning, declared supersession, and history, excluding
  superseded objects from default resolution.
- R9 [P0] Resolve authorized task-specific context deterministically, and
  produce a portable Context Bundle with a deterministic digest.
- R10 [P0] Preserve provenance through bundle compilation.
- R11 [P0] Preserve trust metadata, default remote content to untrusted, delimit
  untrusted content in rendered bundles, and never elevate authority because
  content claims it.
- R12 [P0] Ship a reference CLI with `init`, `validate`, `doctor`, `get`,
  `list`, `search`, `resolve`, `history`, `diff`, `conflicts`, `stale`, `graph`,
  `bundle`, `schema`, and `version`, with stable exit codes.
- R13 [P0] Ship a TypeScript SDK whose resolver core is importable without the
  CLI.
- R14 [P0] Ship conformance fixtures and tests runnable by a third party, plus
  resolution scenarios pinning behaviour schemas cannot express.
- R15 [P0] Reject path traversal, fail clearly on unknown URI schemes, never
  execute context content, and fail validation on committed secrets.
- R16 [P0] Work offline with no mandatory network call and no hosted account.
- R17 [P1] Provide file, HTTP, Git, and SQLite adapters, and a documented
  adapter contract for others.
- R18 [P1] Provide `doctor` with a documented, configurable health score that CI
  can fail on by severity or minimum score.
- R19 [P1] Provide a decision object able to cite the Context Bundle it was made
  from.
- R20 [P1] Support controlled writes that validate authorization and schema
  before persistence, and prohibit automatic promotion of observed or inferred
  context.
- R21 [P1] Provide a namespaced extension mechanism whose unknown values are
  preserved and never invalidate an otherwise valid document.
- R22 [P1] Ship five working examples, all held to strict validation and a 100%
  health score in CI.
- R23 [P1] Define an audit event shape without mandating a storage backend.
- R24 [P2] Publish performance benchmarks with budgets that gate a release.
- R25 [P2] Expose the specification through `logicsrc context` as well as a
  standalone `opencontext` binary, sharing one implementation.

## UX Notes

`opencontext init` must produce a project that passes `validate --strict` and
scores 100% on `doctor` with no edits. A scaffold that emits warnings teaches
people in their first minute that warnings are normal, which is the habit this
specification exists to break. It generates two roles with genuinely different
scopes, so the permission model is visible immediately rather than in a doc.

Errors identify the file, line, object, field, expected value, actual value, and
a remediation. "Must match pattern" to someone who mistyped an id has
technically reported the problem and practically wasted their afternoon.

`--explain` shows why each object was included, excluded, or outranked, using a
closed set of exclusion reasons. Human output is the default; `--format json` is
the automation contract.

The standalone CLI and `logicsrc context` share one implementation, because the
specification treats CLI behaviour as a conformance surface and a subcommand
that quietly diverged would become a second contract.

## Success Metrics

- Time to first valid context under five minutes, with no account.
- 100% of shipped examples pass conformance in CI.
- Deterministic resolution: a repeated run over unchanged sources produces an
  identical digest, asserted for every conformance scenario.
- Zero mandatory cloud dependencies and zero telemetry.
- 90%+ automated coverage of resolver and security-critical code.
- Every normative v1 behaviour represented by a conformance fixture.
- At least three documented third-party integration patterns at launch.

## Risks & Open Questions

- **Adoption friction.** A repository that demands full metadata on every object
  will not get written. Mitigated by making `id` and `type` the only required
  fields and treating a bare Markdown file as valid, so an existing `docs/`
  folder is a starting point rather than a migration.
- **Score gaming.** A configurable health score can be tuned until it always
  passes. Mitigated by publishing the formula and default weights so a tuned
  configuration is visible in the manifest and reviewable.
- **Prompt injection beyond our reach.** OpenContext can label and delimit
  untrusted content, but cannot force a downstream runtime to honour the
  envelope. Documented as an integration requirement; an integration that
  flattens the envelope loses the protection.
- **Digest churn.** A resolver bug fix that changes what is selected changes
  bundle digests, which a consumer might read as tampering. Mitigated by calling
  such fixes out explicitly in the changelog.
- **Blocker: the `opencontext` npm name is taken.** This PRD proposes
  `opencontext` as the package name and `npx opencontext` as the install path.
  That name is already published by an unrelated third party
  (`federicodeponte/opencontext`, currently 2.0.0, "AI-powered company context
  analysis from your terminal") — and being adjacent in subject matter makes the
  confusion worse, not better. Documentation therefore ships pointing at
  `npx @logicsrc/opencontext`, and the `bin` is still named `opencontext` so the
  command reads as specified once installed. Resolving this needs a decision
  before any publication: request a transfer, pick a different unscoped name, or
  commit to the scoped package permanently.
- **No publication pipeline exists yet.** Neither `@logicsrc/openprd` nor
  `@logicsrc/openontology` has ever been published to npm, so OpenContext is not
  slotting into an established release path — one has to be built. Until then
  the only distribution is this repository.
- **Open question.** Should interior wildcards (`customers.*.churn-risk`) remain
  single-segment only, or should a future minor version add a bounded multi-
  segment form? Single-segment is shipped in v1 because the alternative silently
  widens access.
- **Open question.** Signed bundles, federated context, and a hosted registry
  are all plausible post-v1. None is in the v1 commitment, and each risks
  pulling a local-first specification toward a hosted default.
