# Permissions and scopes

**Authorization precedes relevance.** An object a consumer may not read is removed before freshness, ranking, or compilation ever sees it — so it cannot reach a ranker, a prompt, a bundle, or even an explanation.

**Deny overrides allow**, everywhere and unconditionally.

## Scope is opt-in

A role with no `include` list sees nothing. There is no "everything except" mode, because a scope defined by subtraction silently grows every time someone adds context.

```yaml
roles:
  support:
    include:
      - mission
      - policies.*
      - procedures.*
```

## Patterns

Wildcards always match **whole dotted segments**, never substrings.

| Pattern | Matches | Does not match |
| --- | --- | --- |
| `*` | everything | — |
| `mission` | `mission` | `mission.statement` |
| `products.*` | `products`, `products.enterprise`, `products.enterprise.pricing` | `products-internal` |
| `customers.*.churn-risk` | `customers.acme.churn-risk` | `customers.acme.eu.churn-risk` |

The asymmetry between the last two is deliberate. A **trailing** wildcard is how people express "this subtree". An **interior** wildcard is how they express "this field, whichever record it belongs to". Collapsing them into one rule would make the second silently grant the first.

`products-internal` never matching `products.*` is the property that matters most: substring matching here would be an access-control bug.

## Evaluation order

For each object, in order — the first failure is what gets reported:

1. **Explicit deny.** `permissions.deny` names the consumer or one of its roles → denied.
2. **Scope exclusion.** A role `exclude` pattern matches → denied.
3. **Object read grant.** `permissions.read` exists and does not name the consumer → denied.
4. **Scope inclusion.** No `include` pattern matches → not in scope.
5. **Classification ceiling.** Object classification exceeds the role's → denied.

```yaml
# denied to support, even though policies.* includes it
id: policies.internal.margins
classification: confidential

roles:
  support:
    include: [policies.*]
    exclude: [policies.internal.*]
```

## Classification

```txt
public < internal < confidential < restricted
```

`max_classification` bounds a role. An object above the ceiling is denied even when an include pattern matches it. The default is `internal`, so confidential and restricted context requires an explicit grant.

```yaml
roles:
  support:
    include: [docs.*]
    max_classification: internal      # denied docs.litigation
  legal:
    include: [docs.*]
    max_classification: restricted    # allowed
```

### Ceilings and inheritance

Two rules, because the two situations mean different things.

**Within an inheritance chain, the most specific declaration wins.** A role that says `max_classification: confidential` means it, even when it inherits a base role capped at `internal`.

```yaml
roles:
  everyone:
    include: [mission]
    max_classification: internal
  finance:
    inherits: [everyone]
    include: [policies.*]
    max_classification: confidential   # finance really does get confidential
```

The alternative — taking the minimum across the chain — makes a single ceiling on a shared `everyone` role silently cap every role in the repository, so a `finance` role explicitly granted `confidential` quietly receives nothing above `internal`. That is a denial nobody can see in the manifest.

**Across independently requested roles, the lowest wins.** Holding two roles at once must never grant more than either does alone.

```bash
opencontext resolve --role support --role finance    # capped at the lower of the two
```

Both are safe under review, because a ceiling is written by whoever edits the manifest — never by the context being read.

## Inheritance

```yaml
roles:
  everyone:
    include: [mission, glossary]
  support:
    inherits: [everyone]
    include: [policies.*]
    exclude: [policies.internal.*]
  intern:
    inherits: [support]
    exclude: [customers.*]
```

Includes, excludes, permissions, and redactions all **union**. An inherited exclusion follows the child, so `intern` cannot see `policies.internal.*` either. Cycles are a validation error.

## Object-level permissions

```yaml
id: policies.payroll
classification: confidential
permissions:
  read: [finance]
  write: [finance-admin]
  deny: [contractor]
```

`read` narrows a role that would otherwise include the object — useful for one sensitive item inside an otherwise open collection. `deny` overrides every grant, including `read: ["*"]`.

Principals are matched against the consumer id **and** its roles, so a grant can name a specific agent or a whole role. `*` and a trailing `.*` are supported.

A name here that is neither a defined role nor a defined agent is reported:

```txt
⚠ invalid-permission: policies.payroll grants access to "finanace", which is neither
  a defined role nor a defined agent.
    → Define roles.finanace, or correct the name — a typo here silently denies access.
```

## Reads never imply writes

```yaml
permissions:
  read: [support]     # support can read
  write: [support]    # and only this line lets support write
```

An agent that can read context does not thereby gain the ability to change it. See [writes](#writes) below.

## Redaction

Redaction runs **after** authorization: the consumer is entitled to the object and still does not receive every field.

```yaml
roles:
  support:
    include: [customers.*]
    max_classification: confidential
    redact:
      - path: ssn
        mode: remove
        reason: PII, never needed to resolve a ticket
      - path: payment.card
        mode: mask
        replacement: "[REDACTED]"
      - path: contacts[*].email
        mode: hash
```

| Mode | Effect |
| --- | --- |
| `remove` | Deletes the key. Default. |
| `mask` | Replaces the value with `replacement`. |
| `hash` | Replaces it with a sha256 digest, so equality stays testable without disclosure — two records with the same email still match, and neither email is readable. |

### Path syntax

Paths address the object's `content`.

```txt
ssn                  a top-level field
payment.card         nested
contacts[*].email    every element of an array
contacts[0].email    one element
contacts.email       a wildcard-free path applied to an array means every element
customer.ssn         a leading segment naming the object's type or id is optional
```

That last rule is what makes a repository-wide rule like `customer.ssn` behave the way an author expects on a `customer` object whose content has `ssn`.

Rules from the manifest, the role, and the object all apply — they union, and the union is applied.

The bundle reports **that** redaction happened, never what was redacted:

```json
{
  "id": "customers.acme",
  "content": { "name": "ACME Inc.", "payment": { "card": "[REDACTED]" } },
  "redacted": ["ssn", "payment.card", "contacts[*].email"]
}
```

Redaction paths address structured content. Prose content has no structure to address, so a structured rule against a Markdown body matches nothing — do not rely on it for PII in free text.

## Permissions as capabilities

```yaml
roles:
  support:
    permissions: [customer.read, ticket.read, ticket.write]
```

These are transported and scoped by OpenContext, and carried through into the bundle for your runtime to enforce. OpenContext does not itself perform your application's actions.

## Writes

Core resolution is read-only. Mutation is a deliberately narrow exception:

```bash
opencontext add policies.returns --type policy --content "Within 14 days."
opencontext supersede policies.refunds --content "Within 60 days."
```

Three rules:

1. **Writes are never implicit.** `permissions.write` must name the consumer.
2. **Validate before persisting.** Authorization and schema are checked first, so a malformed or unauthorized write never reaches disk.
3. **Promotion is explicit.** Assigning `canonical` or `approved` authority requires `--promote` (CLI) or `allowPromotion: true` (SDK). An agent cannot launder its own observation into policy.

```txt
✗ Refusing to write policies.new with authority "canonical". Promotion to canonical or
  approved is an explicit governance act — pass --promote if that is what you mean.
```

Adding an object that already exists is refused: durable context is superseded, never silently overwritten.

## Denied reads look like missing objects

```bash
opencontext get policies.payroll --role support
```

```txt
No context object "policies.payroll" is available to this consumer.
```

A denied read and a nonexistent object are reported identically, so probing for ids reveals nothing about what exists. `list` and `search` apply the same filter before returning any metadata — a search that leaked titles of restricted documents would defeat the scoping model entirely.

## Secrets

Secrets must not live in context. A context repository is usually far more widely readable than the systems it describes.

`validate` fails on committed credentials:

```txt
✗ secret-detected: policies.deploy appears to contain a AWS access key id.
    → Remove it and reference a secret manager instead.
```

Reference an external provider instead, and let your runtime resolve it at use time.
