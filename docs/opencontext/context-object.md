# Context object reference

One durable unit of context: a mission statement, a policy, an SOP, a customer fact, a decision, a piece of operational state.

Schema: `https://logicsrc.com/schemas/opencontext/object.schema.json`

Only `id` and `type` are required. Everything else exists so context can be *governed* rather than merely stored.

## Three ways to write one

**Markdown with front matter** — metadata in the fence, prose as content. The usual choice.

```yaml
---
id: policies.refunds
type: policy
layer: L3
title: Refund policy
authority: canonical
owner: support
updated: 2026-08-09T00:00:00Z
---

Refund requests are accepted within 30 days of purchase.
```

**YAML or JSON** — the whole document is the object. Use this when content is structured.

```json
{
  "id": "customers.acme",
  "type": "customer",
  "content": { "name": "ACME Inc.", "plan": "enterprise" }
}
```

**Markdown with no front matter** — still a valid object. The body is the content, and the collection supplies `id` and `type`. This is what makes OpenContext adoptable: point it at an existing `docs/` folder and it works, then add metadata where governance actually matters.

## Identity

| Field | Notes |
| --- | --- |
| `id` | **Required.** Stable, unique in the namespace. Dotted lowercase. Renaming is a breaking change — prefer supersession. |
| `type` | **Required.** Open vocabulary: `mission`, `policy`, `procedure`, `decision`, `product`, `customer`, `knowledge`, `note`… A validator must not reject an unknown type. |
| `layer` | `L0`–`L5`. Describes the *kind* of knowledge, never its authority. |
| `title` | Short heading. Used by search, ranking, and Markdown rendering. |
| `summary` | One or two sentences. A resolver may compile this instead of full content when minimising context. |

## Content

| Field | Notes |
| --- | --- |
| `content` | Inline. A string for prose; an object or array for structured data. |
| `content_type` | e.g. `text/markdown`, `application/json`. |
| `content_uri` | Where content loads from when not inline: `file://`, `http://`, `https://`, `git://`, `sqlite://`, or any scheme an installed adapter claims. |

An unknown scheme fails clearly. It is never resolved to empty content — a bundle that silently omits the pricing it was asked about is worse than an error, because nothing looks wrong.

OpenContext does not assume all context is prose.

## Authority and trust

```yaml
authority: canonical
trust: trusted
```

**`authority`** — how much this counts as truth. Declared by the owner of the context, never inferred from retrieval rank, recency, or what the content says about itself.

| Level | Meaning |
| --- | --- |
| `canonical` | The organization's own source of truth |
| `approved` | Reviewed and sanctioned |
| `reference` | Useful, not binding |
| `observed` | Seen in the wild, unverified |
| `inferred` | Derived by a model or heuristic |
| `historical` | Retained for the record only |

Default when omitted: `reference`.

**`trust`** — where the content came from, in terms of whether it can be believed.

| Level | Meaning |
| --- | --- |
| `trusted` | Authored inside the trust boundary |
| `verified` | External but integrity-checked |
| `untrusted` | Arrived from a system that can carry attacker-controlled text |

These are different axes. An object can be `authority: canonical` about a fact while the fact's *content* is `trust: untrusted` — and that combination is a validation error, because canonical means the organization vouches for it, and you cannot vouch for text a stranger typed into a form.

## Ownership and approval

| Field | Notes |
| --- | --- |
| `owner` | Accountable role, team, or identity. `doctor` reports unowned objects, because unowned context is what goes stale. |
| `status` | `draft`, `pending`, `approved`, `rejected`, `retired`. Drafts and pending objects are excluded from default resolution. |
| `approval` | Requirements and recorded approvals. An object requiring two approvals and carrying one is not approved. |
| `review` | Cadence. Overdue reviews are reported. |

```yaml
approval:
  required: true
  roles: [legal, executive]
  minimum: 1
  approved_by:
    - role: legal
      id: counsel@example.com
      at: 2026-08-08T10:00:00Z
```

## Time

| Field | Notes |
| --- | --- |
| `created` | RFC 3339. |
| `updated` | RFC 3339. Freshness is measured from here. |
| `valid_from` | Object is `future` and excluded before this instant. |
| `expires` | Object is `expired` after this instant. Explicit `null` means never expires — different from omitting the field. |
| `ttl` | Per-object staleness window, overriding `freshness.default_ttl`. |
| `durability` | `ephemeral`, `session`, `operational`, `long-lived`, `permanent`. |

Lifecycle state is always computed against a timestamp and never stored. See [lifecycle](./lifecycle.md).

## Access

```yaml
classification: internal
permissions:
  read: [sales-agent, finance-agent]
  write: [sales-admin]
  deny: [contractor]
redact:
  - path: ssn
    mode: remove
```

`classification` is one of `public`, `internal`, `confidential`, `restricted`, and bounds who may read the object regardless of scope.

`permissions.read` narrows a role that would otherwise include the object. `deny` overrides everything. An absent `read` list means the repository scope rules decide.

Read access never implies write access.

## Relationships

| Field | Notes |
| --- | --- |
| `supersedes` | Objects this replaces, as `id` or `id@version`. |
| `superseded_by` | Set on the older object when the chain is written explicitly. |
| `conflicts_with` | Objects known to contradict this one. |
| `references` | Context this cites. Drives the graph and orphan detection. |
| `depends_on` | Context that must resolve alongside this for it to make sense. |
| `applies_to` | Roles, agents, products, or scopes this is about. The strongest relevance signal, because it is the author saying explicitly what the context is for. |

Every reference must point at something that exists. A broken chain silently resurrects retired policy, so it is an error rather than a no-op.

## Provenance

```yaml
canonical_source: true
```

or

```yaml
sources:
  - uri: git://github.com/acme/context/policies/refunds.md
    type: document
    retrieved_at: 2026-08-09T15:00:00Z
    digest: sha256:9f2c…
    trust: trusted
```

`canonical_source: true` says this object *is* the origin — a mission statement written here has no upstream. Anything mirrored from another system should name it. See [provenance](./provenance.md).

## Confidence and tags

```yaml
confidence: 0.6
tags: [pricing, enterprise]
```

`confidence` breaks ties *within* an authority level. It never promotes an object across levels — a model that is 99% sure does not thereby outrank a reviewed policy.

## Extensions

```yaml
extensions:
  com.example.risk:
    score: 0.25
```

Reverse-DNS namespaced. Preserved through resolution and into the bundle.

## Full example

```yaml
id: pricing.enterprise
type: policy
layer: L3
title: Enterprise Pricing
content: |
  Enterprise plans start at $2,500/month.
authority: canonical
owner: sales
version: 3
created: 2026-07-01T00:00:00Z
updated: 2026-08-09T00:00:00Z
valid_from: 2026-08-01T00:00:00Z
expires: null
durability: long-lived
classification: internal
permissions:
  read: [sales-agent, finance-agent]
  write: [sales-admin]
sources:
  - uri: crm://pricing/enterprise
    type: canonical-record
supersedes:
  - pricing.enterprise@2
confidence: 1.0
tags: [pricing, enterprise]
```

## Decision records

A decision is an ordinary context object with `type: decision` and a few extra fields. Schema: `https://logicsrc.com/schemas/opencontext/decision.schema.json`.

```yaml
id: decisions.2026-08-09-model-provider
type: decision
layer: L5
title: Default model provider
authority: approved
owner: platform
status: accepted
decision: Use provider X as the default runtime.
rationale:
  - latency
  - cost
  - reliability
alternatives:
  - option: provider Y
    rejected_because: no EU region
consequences:
  - Re-evaluate at renewal.
approved_by:
  - role: CTO
bundle:
  bundle_id: ocb_37c04d801d013b07
  digest: sha256:37c04d80…
created: 2026-08-09T15:00:00Z
```

`status` for a decision is `proposed`, `accepted`, `rejected`, `superseded`, or `deprecated`.

The `bundle` block is what makes a decision auditable rather than merely recorded: citing the digest lets a reader prove which context was — and was not — in front of the decider. Reversing a decision supersedes it; it does not delete it.
