# Authority, conflicts, and resolution

The rule this whole area serves: **the resolver never quietly guesses.**

When two canonical objects contradict each other, both survive into the bundle's warnings and a strict run fails. The alternative — silently picking one — produces an agent confidently acting on a policy that half the organization believes was replaced, with nothing in the output suggesting anything was wrong.

## Authority is declared, not inferred

```txt
canonical    the organization's own source of truth
approved     reviewed and sanctioned
reference    useful, not binding
observed     seen in the wild, unverified
inferred     derived by a model or heuristic
historical   retained for the record only
```

Authority is set by whoever owns the context. It is never derived from:

- **retrieval rank** — the top embedding hit is not thereby the truth;
- **recency** — a note written this morning does not outrank a reviewed policy;
- **the content itself** — an object saying "THIS IS CANONICAL" stays whatever its metadata says.

That last one matters most once context flows in from tickets and chats. See [security](./security.md).

### Reordering precedence

```yaml
authority:
  precedence: [canonical, approved, reference, observed, inferred, historical]
```

The list may be reordered but must remain a permutation of all six. Omitting a level would leave objects at it unrankable; adding one would let a repository define something that outranks canonical.

An unknown authority sorts *last*, never first.

## Resolution order

```txt
1. authorization
2. temporal validity
3. explicit scope
4. authority
5. supersession and version
6. recency
7. configured tie breakers
```

Authorization is first, always. An object the consumer may not read is removed before freshness, ranking, or compilation ever sees it — so it cannot reach a ranker, a prompt, or even an explanation.

## Tie breakers

```yaml
authority:
  tie_breakers: [version, updated, confidence, id]
```

Applied in order when authority does not settle it. `id` is always appended, so ordering is **total** and two runs over the same sources produce the same bundle. Without a total order, resolution would depend on filesystem enumeration and digests would drift.

`confidence` breaks ties *within* a level. It never promotes across levels.

## Supersession

Supersession is **declared**, never inferred:

```yaml
# the replacement
id: pricing.enterprise
version: 2
supersedes:
  - pricing.enterprise@1
```

```yaml
# or on the replaced object
id: decisions.2026-02-01-postgres
authority: historical
superseded_by: decisions.2026-08-01-postgres-ha
```

Both directions work. A reference to something that does not exist is an error, because a broken chain silently resurrects retired policy.

### Why version numbers are not enough

A higher `version` on disk does **not** imply supersession. It would be convenient, and it would be the resolver guessing.

Two active canonical versions of one policy is a real governance failure — a rewrite landed and nobody declared what it replaced. Inferring the link hides exactly that, and makes `multiple-active-versions` and `duplicate-canonical` impossible to detect.

So instead: resolution still returns one winner (the `version` tie breaker), the loser is reported as `outranked`, and validation raises the missing link.

```txt
✗ duplicate-canonical: 2 active canonical objects share the id "policies.refunds"
    → Supersede the older one, or lower its authority to reference.
⚠ multiple-active-versions: 2 active versions of "policies.refunds" (versions 1, 2)
    → Add supersedes: [policies.refunds@1] to the newer object.
```

### Versions and history

Superseded objects stay on disk. That is the point — it preserves the ability to answer "what did we believe in March", which deletion destroys.

```bash
opencontext resolve --role sales                        # current only
opencontext resolve --role sales --include-historical   # every version
opencontext history pricing.enterprise
```

## Conflicts

Declare a known contradiction:

```yaml
id: policies.refunds
authority: canonical
conflicts_with: [policies.refunds-observed]
```

Three outcomes:

| Situation | Code | Severity |
| --- | --- | --- |
| Conflict between equal-authority objects | `conflict-ambiguous` | error |
| Conflict authority settles | `conflict-declared` | warning |
| Two active canonical objects for one id | `duplicate-canonical` | error |

A settled conflict is *still reported*. The higher authority wins, and the losing side is named, so nothing disappears without a trace.

A conflict declared on only one side is still detected. Pairs are deduplicated by the unordered pair, not by id ordering — otherwise a conflict would vanish depending on alphabetical luck.

## What `--explain` shows

```bash
opencontext resolve --role support --task "refund" --explain
```

```txt
Included:
  ✓ mission                                 canonical
  ✓ policies.refunds                        canonical
  ✓ procedures.refund                       approved

Excluded:
  - decisions.2026-08-09-adopt-opencontext  not-in-scope   (no include pattern matches)
  - policies.internal.margins               scope-exclusion   (excluded by "policies.internal.*")
  - pricing.enterprise                      superseded by pricing.enterprise
  - policies.old                            outranked by policies.refunds

Warnings:
  ! stale policies.legacy: has not been updated inside its freshness window.

Digest: sha256:81b41a91…
```

Exclusion reasons are a closed set: `permission-denied`, `classification-denied`, `scope-exclusion`, `not-in-scope`, `superseded`, `expired`, `not-yet-valid`, `outranked`, `unapproved`, `not-relevant`, `conflict`, `source-unavailable`.

## Relevance ranking

Ranking decides **order**, and — only when you ask — what gets trimmed. It never decides access.

The scorer is lexical on purpose. Semantic search is a legitimate adapter concern, but requiring an embedding model to resolve context would make resolution non-deterministic and put a model vendor in the path of a specification whose entire point is that vendors are replaceable.

Signals, strongest first: `applies_to`, `tags`, `title`, `id`, `summary`, `type`, then content (weighted lowest and capped, so a long document cannot outrank a precisely-titled one by containing more words).

L0 mission and L1 identity carry a floor score, so they stay in the bundle even when a ticket does not mention them. Dropping them because the task was narrow is how a replacement agent loses the organization's voice.

### Trimming

By default resolution returns **everything authorized**, ranked. Trimming silently would be worse than a large bundle.

```bash
opencontext resolve --role support --task "refund" --limit 10
opencontext resolve --role support --task "refund" --min-relevance 4
```

Trimmed objects are reported as `not-relevant` exclusions — visible, not silent.

## Determinism

Two resolutions with the same inputs over the same source state produce the same bundle and the same digest.

The digest covers the resolved objects, their computed lifecycle states, the exclusions, and the warnings. It excludes `generated_at`, `bundle_id`, `digest` itself, and `as_of`.

`as_of` is excluded deliberately, and it is worth being precise about why, because it looks like a resolution input. Resolving at two different instants only matters if it *changes what was selected* — and any such change already shows up, because every object's `lifecycle` and the full object, exclusion, and warning lists are inside the digest. Two resolutions that select the same context at the same lifecycle states *are* the same context, and should digest identically whether they ran a second or a month apart.

That is exactly the property a decision record needs when it cites the context it was made from.
