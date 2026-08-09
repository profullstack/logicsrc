# OpenContext

**LogicSRC OpenContext** is an open specification for durable, portable, permissioned, provenance-aware context shared between humans and AI agents. It defines how organizational knowledge is described, authorized, versioned, resolved, audited, and handed between replaceable workers without losing institutional state.

> **An agent should be replaceable without losing organizational knowledge.**

It is a **standard**, not a product. The normative contracts are JSON Schemas published under `https://logicsrc.com/schemas/opencontext/`. `@logicsrc/opencontext` is *a* reference implementation of those schemas — useful, but not the definition. Any language, storage engine, or model provider that satisfies the schemas and passes the [conformance suite](./opencontext/conformance.md) conforms.

- Vendor-neutral — no LLM, framework, or database is required to validate, resolve, or explain anything.
- Local-first — a folder and a Git repository are enough. No account, no server, no telemetry.
- Not a memory database — memory is one possible context *source*. OpenContext is the control plane above your sources of truth.

Status: **1.0 Draft** ([OpenPRD 0003](../prd/0003-add-logicsrc-opencontext-spec.md)).

## The problem

Organizational context is scattered across prompts, employee memory, agent histories, vector stores, wikis, chats, issue trackers, CRMs, spreadsheets, and SOPs. When an agent is replaced — a new model, a new vendor, a new framework — whatever it had learned goes with it. When an employee leaves, the same thing happens more slowly.

The result is familiar: agents that confidently quote last year's pricing, two teams operating from two different refund policies, and nobody able to say which one is authoritative or where either came from.

OpenContext makes the shared context plane explicit. It tells a runtime **what context exists, where truth comes from, which information is authoritative, who may access it, how current it is, and which subset applies to a particular agent or task.**

## Five nouns

Everything in OpenContext is one of five things.

| Noun | What it is | Example |
| --- | --- | --- |
| **Manifest** | The control plane: what exists, who may read it | `opencontext.yaml` |
| **Context object** | One durable unit of context with a stable id | `policies.refunds` |
| **Role** | The authorized subset available to a consumer | `support` |
| **Bundle** | Resolved, authorized context for one consumer and one task | `ocb_37c04d80…` |
| **Decision** | What was decided, why, and on what context | `decisions.2026-08-09-model-provider` |

## Quick start

Five minutes, no account, no network, no model key.

```bash
npx opencontext init my-context
cd my-context

opencontext validate --strict
opencontext doctor
opencontext resolve --role support --task "customer asked for a refund" --explain
```

`init` writes a project that passes strict validation and scores 100% with no edits:

```txt
Created opencontext.yaml
Created context/mission.md
Created context/organization.md
Created context/glossary.md
Created context/policies/refunds.md
Created context/sops/refund.md
Created context/decisions/2026-08-09-adopt-opencontext.md
```

```txt
OpenContext Health
────────────────────────────────
Why ACME Corporation e… ✓ canonical
How ACME Corporation i… ✓ canonical
Terminology             ✓ canonical

Orphaned context        0
Conflicting context     0
Expired context         0
Stale context           0
Missing owners          0
Broken sources          0

Context health: 100%
```

And `resolve --explain` shows the reasoning, not just the result:

```txt
Included:
  ✓ mission                                 canonical
  ✓ glossary                                canonical
  ✓ organization                            canonical
  ✓ policies.refunds                        canonical
  ✓ procedures.refund                       approved

Excluded:
  - decisions.2026-08-09-adopt-opencontext  not-in-scope   (no include pattern matches)

Warnings:
  none

Digest: sha256:81b41a915ee68f744e91ef0d7760440de51b603088de1a6f21ea6f337bb374a8
```

Run the same command as `--role engineering` and you get a different bundle from the same repository. That is the whole idea.

## The six layers

Layers describe the *kind* of knowledge, never its authority.

| Layer | Name | Purpose |
| --- | --- | --- |
| L0 | Mission | Why the organization or project exists |
| L1 | Identity | Brand, values, organization, terminology |
| L2 | Knowledge | Products, customers, architecture, facts |
| L3 | Policy | Rules, permissions, compliance, constraints |
| L4 | Procedure | SOPs, workflows, playbooks |
| L5 | Operational | Tasks, incidents, conversations, temporary state |

## Authority

Authority is **declared by the owner of the context**, never inferred from retrieval rank, recency, or what the content says about itself.

```txt
canonical    the organization's own source of truth
approved     reviewed and sanctioned
reference    useful, not binding
observed     seen in the wild, unverified
inferred     derived by a model or heuristic
historical   retained for the record only
```

Canonical outranks historical by default, and the order [may be reordered](./opencontext/authority.md) — but a repository cannot invent a level that outranks canonical, and observed or inferred context never becomes canonical automatically.

## Repository layout

```txt
opencontext.yaml
context/
├── mission.md
├── organization.md
├── glossary.md
├── brand.md
├── customers/
├── products/
├── policies/
├── sops/
├── decisions/
├── knowledge/
├── operations/
└── roles/
```

Alternative layouts work. Nothing depends on these directory names — the manifest maps names to paths, so pointing OpenContext at an existing `docs/` folder is a supported starting point.

## The manifest

```yaml
opencontext: "1.0"
id: acme
name: ACME Corporation

context:
  mission: ./context/mission.md
  glossary: ./context/glossary.md

collections:
  policies: ./context/policies/**
  procedures: ./context/sops/**
  decisions: ./context/decisions/**

roles:
  support:
    include:
      - mission
      - policies.*
      - procedures.*
    exclude:
      - policies.internal.*
    permissions:
      - customer.read
      - ticket.write
    max_classification: internal

agents:
  support-agent:
    roles: [support]

freshness:
  default_ttl: 30d

provenance:
  required: true
```

Full reference: [manifest](./opencontext/manifest.md).

## A context object

Only `id` and `type` are required. Everything else exists so context can be *governed* rather than merely stored.

```yaml
---
id: policies.refunds
type: policy
layer: L3
title: Refund policy
authority: canonical
owner: support
status: approved
version: 1
durability: long-lived
classification: internal
canonical_source: true
updated: 2026-08-09T00:00:00Z
tags: [refunds]
---

Refund requests are accepted within 30 days of purchase.
```

Full reference: [context object](./opencontext/context-object.md).

## Resolution

```txt
resolve(consumer, task, requestedContext, timestamp) -> ContextBundle
```

The pipeline runs in a fixed order:

```txt
discover -> load -> normalize -> authorize -> apply scope
  -> validate freshness -> resolve supersession -> resolve authority/conflicts
  -> rank task relevance -> redact -> compile -> bundle
```

Two properties matter most.

**Authorization precedes relevance.** An object the consumer may not read is removed before freshness, ranking, or compilation ever sees it — so unauthorized context cannot reach a ranker, a prompt, or even an explanation.

**Resolution is deterministic.** The same inputs and source state produce the same bundle and the same digest, because every ordering is total and the only wall-clock value in the output is excluded from the digest. That is what lets a decision record cite exactly the context that produced it.

Details: [resolution and authority](./opencontext/authority.md).

## Context bundles

The portable output of resolution. JSON is canonical; YAML and Markdown are for humans and prompt assembly.

```json
{
  "opencontext": "1.0",
  "bundle_id": "ocb_37c04d801d013b07",
  "generated_at": "2026-08-09T15:00:00Z",
  "consumer": { "type": "agent", "id": "support-agent", "roles": ["support"] },
  "task": "Handle refund request for ACME",
  "objects": [],
  "warnings": [],
  "provenance": [],
  "digest": "sha256:…"
}
```

## Context health

`opencontext doctor` is a core feature, because context rot is quiet: nothing fails, agents just start answering from last year's pricing.

```bash
opencontext doctor --strict
```

It reports schema errors, stale and expired context, canonical conflicts, missing owners, broken references, inaccessible sources, supersession errors, invalid permissions, duplicate ids, and provenance violations — and computes a documented, configurable health score CI can fail on.

## CLI

```bash
opencontext init        # create a project that validates immediately
opencontext validate    # schemas, references, supersession, permissions
opencontext doctor      # context health and score
opencontext get <id>    # one object, subject to authorization
opencontext list        # what exists
opencontext search "…"  # lexical search, still authorized
opencontext resolve     # authorized context for a consumer and task
opencontext bundle      # the portable bundle document
opencontext history <id>
opencontext diff <from> <to>
opencontext conflicts
opencontext stale
opencontext graph
opencontext schema
opencontext version
```

Also available as `logicsrc context <command>` — the same implementation, so the two cannot drift. Full reference: [CLI](./opencontext/cli.md).

## TypeScript SDK

```ts
import { OpenContext } from "@logicsrc/opencontext";

const oc = await OpenContext.load("./opencontext.yaml");

const result = await oc.resolve({
  agent: "support-agent",
  task: "Handle ACME refund"
});

console.log(result.bundle);
```

The resolver core is importable without the CLI. Full reference: [SDK](./opencontext/sdk.md).

## Security and the trust boundary

Context frequently originates in systems that carry attacker-controlled text — tickets, chats, scraped pages. OpenContext treats that as a first-class concern.

```yaml
trust: trusted     # authored inside the trust boundary
trust: verified    # external, integrity-checked
trust: untrusted   # arrived from a system that can carry hostile text
```

Trust is preserved through resolution, remote content defaults to `untrusted`, Markdown bundles fence and label it, and **an object's authority is never elevated because its content claims to be authoritative**. Full guide: [security and trust](./opencontext/security.md).

## Conformance

A v1 conforming implementation parses valid manifests, enforces scopes with deny-overrides-allow, calculates lifecycle state, processes supersession, applies authority precedence, preserves provenance, emits canonical JSON bundles with deterministic digests, reports canonical conflicts, and passes the published fixture suite.

The fixtures live in `@logicsrc/schemas` under `fixtures/opencontext/` and need no LogicSRC code to run: every `valid/` fixture must validate, every `invalid/` fixture must fail, and the `resolution/` scenarios pin resolver behaviour that schemas cannot express. Full guide: [conformance](./opencontext/conformance.md).

## Examples

Five working examples, all held to `--strict` and a 100% health score in CI:

| Example | Shows |
| --- | --- |
| [minimal](../examples/opencontext/minimal) | The floor: mission, one policy, one role |
| [startup](../examples/opencontext/startup) | Every layer, L0 through L5, with decisions |
| [support-agent](../examples/opencontext/support-agent) | Redaction, classification, and a worked prompt-injection case |
| [engineering-team](../examples/opencontext/engineering-team) | Architecture knowledge, runbooks, ADRs, supersession |
| [multi-agent-company](../examples/opencontext/multi-agent-company) | One repository, five agents, five different bundles |

## CI

```yaml
name: OpenContext

on: [pull_request, push]

jobs:
  context:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx opencontext validate --strict
      - run: npx opencontext doctor --strict
```

Exit codes are stable: `0` ok, `1` invalid, `2` usage, `3` not found.

## Guides

| Guide | Question it answers |
| --- | --- |
| [Specification](./opencontext/spec.md) | The normative contract |
| [Manifest](./opencontext/manifest.md) | Every field of `opencontext.yaml` |
| [Context object](./opencontext/context-object.md) | Every field of an object |
| [Authority and conflicts](./opencontext/authority.md) | Which context wins, and what happens when nothing does |
| [Permissions and scopes](./opencontext/permissions.md) | Who may read what |
| [Provenance](./opencontext/provenance.md) | Where a fact came from |
| [Lifecycle and versioning](./opencontext/lifecycle.md) | Freshness, expiry, supersession, history |
| [CLI](./opencontext/cli.md) | Every command and flag |
| [SDK](./opencontext/sdk.md) | The TypeScript API |
| [Adapters](./opencontext/adapters.md) | Writing an adapter for your own system |
| [Security and trust](./opencontext/security.md) | The trust boundary and prompt-injection safety |
| [Conformance](./opencontext/conformance.md) | Implementing or verifying OpenContext |
| [Versioning policy](./opencontext/versioning.md) | How the specification changes |
| [Integration patterns](./opencontext/integration.md) | System prompts, RAG, MCP, CI/CD, GitOps, API servers |
| [OpenPRD and OpenTopology](./opencontext/related-specs.md) | How the LogicSRC specifications fit together |
| [FAQ](./opencontext/faq.md) | The questions people actually ask |

## The specification family

| Specification | Primary question |
| --- | --- |
| [OpenPRD](./openprd.md) | What are we building and why? |
| OpenTopology | How is the system organized? |
| **OpenContext** | What does everyone need to know? |

```txt
OpenPRD       -> intent / requirements
OpenTopology  -> architecture / relationships
OpenContext   -> knowledge / policy / operational context
LogicSRC      -> execution by humans and agents
```

OpenContext is independently usable. The integrations are optional.

## Foundational rules

1. **Context outlives workers.** Humans and agents come and go.
2. **Authority is explicit.** Retrieval rank does not equal truth.
3. **Authorization precedes relevance.** An agent cannot retrieve what it may not access.
4. **Provenance survives resolution.** Compiling context must not erase its origin.
5. **Canonical conflicts are visible.** The resolver does not quietly guess.
6. **History is valuable.** Supersession beats silent mutation.
7. **Agents are replaceable.** Context is not coupled to a model vendor.
8. **Local-first is valid.** A folder and a Git repository are enough.
9. **Hosted services are optional.** The specification stands alone.
10. **OpenContext is a control plane, not the database.** Existing systems remain sources of truth.
11. **Least context is better than all context.** Return what is sufficient and authorized.
12. **Observed context does not become truth automatically.** Promotion is explicit.
13. **Context is data, not executable instruction.** Untrusted content never changes resolver policy by saying so.
14. **Interoperability beats feature lock-in.** A compliant bundle should work across runtimes.

---

We used to manage people. Increasingly, we manage agents — and managing agents is largely managing context. Agents, models, and employees come and go. The organization's mission, policies, knowledge, procedures, decisions, and history should not disappear with them. OpenContext makes that shared brain portable.
