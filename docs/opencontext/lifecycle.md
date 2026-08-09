# Lifecycle, versioning, and health

Context rot is quiet. Nothing fails; agents just start answering from last year's pricing. Everything here exists to make that visible.

## Lifecycle state is computed, never stored

```txt
future      valid_from is still ahead
current     inside its freshness window
stale       past its ttl, still resolved and reported
expired     past expires
superseded  replaced by a declared successor
```

State is always evaluated against a timestamp. That is what makes `--at` work: asking for context as it stood last quarter re-evaluates every window rather than reading a cached flag.

```bash
opencontext resolve --role support --at 2026-03-01
opencontext list --at 2026-03-01
```

## The fields

```yaml
created:    2026-07-01T00:00:00Z
updated:    2026-08-09T00:00:00Z   # freshness is measured from here
valid_from: 2026-08-01T00:00:00Z   # future before this
expires:    null                   # explicit null = never expires
ttl:        180d                   # overrides freshness.default_ttl
durability: long-lived
```

`expires: null` is a **statement** that the object never expires, and is distinguishable from omitting the field (where the repository default applies).

Durations use fixed unit lengths — `y` = 365d, `w` = 7d, `d` = 24h — so "stale after 30d" is the same number of milliseconds in every timezone. Calendar arithmetic would make resolution non-deterministic, which the specification forbids.

## Stale context still resolves

```yaml
freshness:
  default_ttl: 30d
  stale_is_error: false
  exclude_expired: true
```

A stale object is returned **and** warned about:

```json
{ "code": "stale", "id": "procedures.refund", "severity": "warning",
  "message": "procedures.refund has not been updated inside its freshness window." }
```

Dropping it silently would hide exactly the thing the operator needs to see. Expired and not-yet-valid context *is* excluded, because a policy with an end date has one for a reason.

Set `stale_is_error: true` to make `--strict` fail on staleness.

## Durability

| Value | Meaning |
| --- | --- |
| `ephemeral` | A single exchange |
| `session` | One conversation or task |
| `operational` | Current working state |
| `long-lived` | Standing policy, products, architecture |
| `permanent` | Organizational record — mission, decisions |

Permanent context should be **superseded rather than destroyed**.

## Review cadence

```yaml
review:
  interval: 180d
  required_approvers: 2
  next_review: 2027-02-09
  last_review: 2026-08-09
```

`doctor` reports overdue reviews. An explicit `next_review` wins; otherwise the interval is measured from `last_review`, else `updated`.

## Approval

```yaml
status: approved
approval:
  required: true
  roles: [legal, executive]
  minimum: 1
  approved_by:
    - role: legal
      at: 2026-08-08T10:00:00Z
```

States: `draft`, `pending`, `approved`, `rejected`, `retired`. Drafts and pending objects are excluded from default resolution.

An object requiring two approvals and carrying one is **not** approved. The specification defines the metadata and states; it does not require a hosted approval workflow.

## Versions and supersession

```yaml
# context/pricing/enterprise.v2.md
id: pricing.enterprise
version: 2
supersedes: [pricing.enterprise@1]
```

The previous version stays on disk. That is the point — it preserves the ability to answer "what did we believe in March", which deletion destroys.

Supersession is **declared**, never inferred from version numbers. See [authority](./authority.md#why-version-numbers-are-not-enough) for why.

```bash
opencontext supersede pricing.enterprise --content "Enterprise plans start at \$2,500/month."
opencontext history pricing.enterprise
opencontext diff pricing.enterprise@1 pricing.enterprise@2
opencontext resolve --role sales --include-historical
```

## Health score

```txt
deduction = Σ (weight[code] × occurrences) / max(objects, 1)
score     = clamp(100 − deduction × 100, 0, 100)
```

A weight is "how much of the repository's health one instance of this problem costs". Normalising by object count is deliberate: one broken canonical conflict in a ten-object repository matters far more than one in a thousand-object repository.

Default weights, highest first — anything that makes the resolver produce a **wrong** answer costs more than anything that makes it produce an **incomplete** one:

| Weight | Codes |
| --- | --- |
| 1.0 | `schema-invalid`, `manifest-invalid`, `duplicate-id`, `duplicate-canonical`, `conflict-ambiguous`, `secret-detected`, `path-traversal` |
| 0.8 | `broken-supersession`, `supersession-cycle`, `untrusted-canonical`, `role-cycle` |
| 0.6 | `unknown-scheme`, `source-unavailable` |
| 0.5 | `broken-reference`, `unknown-role`, `unknown-authority` |
| 0.4 | `multiple-active-versions`, `expired` |
| 0.3 | `conflict-declared`, `missing-provenance`, `invalid-permission` |
| 0.2 | `missing-digest`, `missing-owner` |
| 0.15 | `stale`, `review-overdue` |
| 0.1 | `orphaned`, `unapproved`, `empty-scope`, `unknown-extension` |
| 0.05 | `not-yet-valid` |

Override per repository:

```yaml
health:
  minimum_score: 90
  fail_on: error
  require_owner: true
  weights:
    stale: 0.3          # we care more about freshness than the default
    orphaned: 0.0       # we do not care about orphans yet
```

A score is comparable only within a repository's own configuration. That is why the formula is published rather than opaque.

## In CI

```bash
opencontext doctor --strict                    # fail on errors and the minimum score
opencontext doctor --strict --min-score 95     # override the floor
opencontext stale --strict                     # fail on anything stale or expired
```

```txt
OpenContext Health
────────────────────────────────
Mission                 ✓ canonical
Pricing                 ✓ current
Engineering SOPs        ⚠ stale

Orphaned context        7
Conflicting context     2
Expired context         4
Stale context           3
Missing owners          3
Broken sources          1

Context health: 91%
```

## Reconstructing the past

Three mechanisms, and they compose:

1. **`--at`** re-evaluates every window against a past instant.
2. **`--include-historical`** returns superseded versions alongside current ones.
3. **`git://<rev>/<path>`** reads context out of a past commit, offline, with no server.

```bash
opencontext resolve --role support --at 2026-03-01 --include-historical
```

That is how a decision made in March stays auditable in December.
