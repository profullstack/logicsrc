# Manifest reference

`opencontext.yaml` is the control plane. It declares what context exists, where it is loaded from, who may read it, how authority is ranked, how freshness is judged, and what is audited.

It is not the database. It points at systems that remain the sources of truth.

Schema: `https://logicsrc.com/schemas/opencontext/manifest.schema.json`

Discovery searches upward from the working directory, the way git finds `.git`, so commands work from anywhere inside a project. `opencontext.json` and `opencontext.yml` are also accepted.

## Minimal

```yaml
opencontext: "1.0"
id: example
```

`opencontext` and `id` are the only required fields.

## Identity

| Field | Type | Notes |
| --- | --- | --- |
| `opencontext` | string | Spec version, e.g. `"1.0"`. A major version the runtime does not support is refused, never partially parsed. |
| `id` | slug | Namespace. Object ids are unique within it. |
| `name` | string | Human-readable organization or project name. |
| `description` | string | One paragraph on what this repository covers. |

## `context` — single documents

Each key becomes a resolvable object id; each value is a path or URI.

```yaml
context:
  mission: ./context/mission.md
  glossary: ./context/glossary.md
  handbook: https://intranet.example.com/handbook.md
```

A document may declare its own `id` in front matter, which wins over the key.

## `collections` — globs

The key namespaces the ids of everything the collection loads, so `./context/policies/refunds.md` under `policies` resolves as `policies.refunds`.

```yaml
collections:
  policies: ./context/policies/**
  procedures:
    source: ./context/sops/**
    type: procedure
    layer: L4
    owner: support
    ttl: 180d
```

A bare string is the glob. The object form adds defaults applied to members that omit them.

**Glob syntax.** `**` crosses directories; `*` and `?` never do. Files are picked up only with a context extension (`.md`, `.markdown`, `.yaml`, `.yml`, `.json`) unless the pattern names one explicitly. `node_modules`, `.git`, `dist`, `build`, and dot-directories are skipped.

**Derived ids.** A member that declares no `id` gets one derived from its path relative to the collection base: `support/refund.md` in `policies` becomes `policies.support.refund`. `index.md` and `readme.md` resolve to the directory itself.

> A document that declares an id outside its collection's namespace keeps that id. `policies` loading a file that declares `id: pricing.enterprise` produces `pricing.enterprise`, which `policies.*` will not match. Declare ids that match the collection, or rely on derivation.

## `roles` — scopes

```yaml
roles:
  everyone:
    include: [mission, glossary]

  support:
    description: Front-line customer support.
    inherits: [everyone]
    include:
      - policies.*
      - customers.*
    exclude:
      - policies.internal.*
      - customers.*.churn-risk
    permissions: [customer.read, ticket.write]
    max_classification: internal
    redact:
      - path: ssn
        mode: remove
        reason: PII
```

See [permissions and scopes](./permissions.md) for the full model. In short: scope is opt-in, deny always overrides allow, and inheritance can only narrow.

## `agents` — consumers

```yaml
agents:
  support-agent:
    roles: [support]
  dev-agent:
    roles: [engineering]
    description: Ships product code.
```

An agent holds no rights of its own beyond the roles listed. A role named here that the manifest does not define is a validation error — a typo silently denying access is exactly the failure this catches.

## `authority`

```yaml
authority:
  precedence:
    - canonical
    - approved
    - reference
    - observed
    - inferred
    - historical
  tie_breakers: [version, updated, confidence, id]
```

`precedence` may be reordered but must remain a permutation of all six levels. Omitting one would leave objects at that level unrankable; adding one would let a repository define something that outranks canonical.

`tie_breakers` apply when authority does not settle it. `id` is always appended so ordering is total and resolution deterministic.

## `freshness`

```yaml
freshness:
  default_ttl: 30d
  stale_is_error: false
  exclude_expired: true
```

Durations use fixed unit lengths — `y` = 365d, `w` = 7d, `d` = 24h — so "stale after 30d" means the same number of milliseconds in every timezone. Calendar-aware arithmetic would make resolution non-deterministic.

Stale context still resolves and is reported. `stale_is_error` makes `--strict` fail on it.

## `provenance`

```yaml
provenance:
  required: true
  digest: sha256
  require_digest: false
```

When `required`, every resolved object must declare a source or `canonical_source: true`. The check runs against what the *author* wrote, not against the `file://` source the loader attaches — otherwise it would always pass.

## `audit`

```yaml
audit:
  context_reads: true
  context_writes: true
  decisions: true
  conflicts: false
  sink: file://./context/.audit/events.ndjson
```

The specification defines the event shape and leaves storage open. The reference implementation writes `file://` sinks; anything else is returned for the caller to ship.

## `redact` — repository-wide

```yaml
redact:
  - path: payment.card
    mode: mask
    replacement: "[REDACTED]"
    reason: PAN is never needed to answer a question about an account
```

Applied above every role, including roles that could otherwise read the field. Stating it once here beats repeating it per role.

## `review`

```yaml
review:
  interval: 180d
  required_approvers: 2
  next_review: 2027-02-09
```

Default cadence for objects that declare none. Overdue reviews are reported by `doctor`.

## `adapters`

```yaml
adapters:
  https:
    enabled: true
    trust: untrusted
    timeout_ms: 5000
  http:
    allow_insecure: false
  git:
    repos:
      github.com/acme/context: ../acme-context
```

Configuration per URI scheme. A configured `trust` is a deliberate operator statement and overrides the adapter's own assertion — but only here, never by the content itself. See [adapters](./adapters.md).

## `defaults`

```yaml
defaults:
  classification: internal
  trust: trusted
  owner: platform
  ttl: 365d
```

Applied to objects that omit a field. Defaults describe house style; they never launder authority. An object with no declared authority is `reference` — useful but not binding — because defaulting unlabelled context to `canonical` would let an unreviewed note outrank a reviewed policy simply by existing.

## `health`

```yaml
health:
  minimum_score: 90
  fail_on: error
  require_owner: true
  weights:
    stale: 0.2
```

Configures `doctor`. See [lifecycle](./lifecycle.md#health-score) for the formula.

## `related`

```yaml
related:
  prd: ./openprd.yaml
  topology: ./opentopology.yaml
  ontology: ./openontology.yaml
```

Optional links to sibling LogicSRC specifications. OpenContext is independently usable without them.

## `extensions`

```yaml
extensions:
  com.acme.region:
    primary: eu-west-1
```

Keys must be reverse-DNS namespaced so independent tools never collide. Unknown extensions are preserved and do not invalidate the document unless `--strict` requires known ones.

## Full example

```yaml
opencontext: "1.0"
id: acme
name: ACME Corporation

context:
  mission: ./context/mission.md
  organization: ./context/organization.md
  glossary: ./context/glossary.md

collections:
  products: ./context/products/**
  policies: ./context/policies/**
  procedures: ./context/sops/**
  decisions: ./context/decisions/**

roles:
  support:
    include: [mission, products.*, policies.support.*, procedures.support.*]
    exclude: [finance.payroll.*, legal.privileged.*]
    permissions: [customer.read, ticket.read, ticket.write]

authority:
  precedence: [canonical, approved, reference, observed, inferred, historical]

freshness:
  default_ttl: 30d

provenance:
  required: true

audit:
  context_reads: true
  context_writes: true
  decisions: true
```
