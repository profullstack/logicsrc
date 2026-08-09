# FAQ

### Is this a memory system for agents?

No. Memory is one possible context *source*. OpenContext is the control plane above your sources: it says what context exists, which is authoritative, who may read it, how current it is, and which subset applies to a task.

An agent memory store answers "what do I remember". OpenContext answers "what does this organization know, and may you see it".

### Does it replace my vector database?

No. Vectors find candidates; OpenContext decides eligibility and authority. Use both — see [integration](./integration.md#rag-pipelines).

The one rule: never rank before authorizing. Embedding similarity has no idea what a role may read.

### Why is search lexical rather than semantic?

Requiring an embedding model to resolve context would make resolution non-deterministic and put a model vendor in the critical path of a specification whose whole point is that vendors are replaceable.

Semantic search is a legitimate **adapter or plugin** concern and is explicitly outside core conformance. Bring your own retriever; authorize the results through OpenContext.

### Do I need a server or an account?

No. A folder and a Git repository are enough. There is no hosted dependency, no telemetry, and no network call for a local-only project.

### Does it work without Git?

Yes. Git makes `history` richer and enables `git://` revision reads, but nothing requires it. Declared version history works from the objects themselves.

### What if I already have a docs folder?

Point a collection at it:

```yaml
collections:
  knowledge: ./docs/**
```

A Markdown file with no front matter is a valid context object — the body is the content, and the collection supplies `id` and `type`. Add metadata where governance actually matters, not everywhere at once.

### Only `id` and `type` are required. Is that really enough?

It is enough to be *valid*. It is not enough to be *governed*: without `owner` nothing is accountable, without `authority` everything is `reference`, without `updated` nothing can go stale. Start minimal, then add the fields that answer questions you actually have.

### Why doesn't a higher version number supersede automatically?

Because that would be the resolver guessing. Two active canonical versions of a policy is a real governance failure — a rewrite landed and nobody declared what it replaced — and inferring the link hides exactly that. See [authority](./authority.md#why-version-numbers-are-not-enough).

### Why is stale context still returned?

Because silence is worse than staleness. An agent given a stale policy *and told it is stale* can escalate; an agent given nothing improvises. Set `freshness.stale_is_error: true` if you would rather fail.

### Two of my policies conflict. Why won't it just pick one?

If they are at different authorities, it does pick one — and still reports it, so the losing side is visible. If they are at the same authority, nothing in the data says which is right, and silently choosing would produce an agent confidently acting on a policy half the organization believes was replaced.

### An agent can read a policy. Can it change it?

Not unless `permissions.write` names it. Read access never implies write access, writes validate authorization and schema before touching disk, and promotion to `canonical` or `approved` requires an explicit flag. See [permissions](./permissions.md#writes).

### How do I stop a customer's ticket from instructing my agent?

Mark it `trust: untrusted` — which is the default for anything fetched remotely. Trust is preserved through resolution, Markdown bundles fence and label untrusted spans, and an object's authority is never elevated because its content claims to be authoritative.

Worked example: [`examples/opencontext/support-agent`](../../examples/opencontext/support-agent). Full guide: [security](./security.md).

### Can I store API keys in context?

No. `validate` fails on committed credentials. A context repository is usually far more widely readable than the systems it describes. Reference an external secret provider and resolve it at use time.

### Why do two identical runs produce the same digest, but `generated_at` differs?

The digest identifies **the resolved context**, not the moment it was computed. `generated_at`, `bundle_id`, `digest`, and `as_of` are excluded; objects, lifecycle states, exclusions, and warnings are all covered. That is what lets a decision record cite exactly the context that produced it. See [authority](./authority.md#determinism).

### Why is `as_of` excluded from the digest?

Resolving at two different instants only matters if it *changes what was selected* — and any such change already shows up, because every object's computed `lifecycle` is inside the digest. Two resolutions that select the same context at the same lifecycle states are the same context.

### My bundle is enormous. How do I trim it?

```bash
opencontext resolve --role support --task "…" --limit 20
opencontext resolve --role support --task "…" --min-relevance 4
```

Trimming is opt-in because silently dropping context is worse than a large bundle. Trimmed objects are reported as `not-relevant` exclusions. Narrower roles are usually the better fix — if one role needs everything, it is probably two roles.

### Can a role see more by inheriting another?

No for scope — includes and excludes union, and an exclusion always wins.

For classification, a role's **own** `max_classification` beats an inherited one, so a `finance` role explicitly granted `confidential` gets it even when it inherits a base role capped at `internal`. Requesting several roles at once takes the lowest, so combining roles never escalates. See [permissions](./permissions.md#ceilings-and-inheritance).

### `products.*` — does that match `products-internal`?

No. Wildcards match whole dotted segments, never substrings. Substring matching here would be an access-control bug.

### What is the difference between `authority` and `trust`?

`authority` is how much something counts as truth. `trust` is whether the bytes can be believed. A canonical object with untrusted content is a validation error — you cannot vouch for text you did not write.

### Can I add my own fields?

Yes, namespaced:

```yaml
extensions:
  com.example.risk:
    score: 0.25
```

Preserved through resolution and into the bundle, and they never invalidate a document in a conforming implementation.

### How do I know my own implementation conforms?

Run the published fixtures — the schema half needs no LogicSRC code. See [conformance](./conformance.md).

### Is it slow on a large repository?

No. Against 1,000 objects: load ~310 ms, validate ~50 ms, resolve ~33 ms, doctor ~21 ms. Budgets and the benchmark are in [conformance](./conformance.md#performance-targets).

### Is there telemetry?

None, and none by default ever. If it is added it must be opt-in and must never transmit context content.

### Do I have to use LogicSRC?

No. OpenContext is independently usable, and the specification does not depend on npm. `@logicsrc/opencontext` is one implementation of published schemas.

### Where do I start?

```bash
npx @logicsrc/opencontext init my-context
```

Then read [`examples/opencontext/minimal`](../../examples/opencontext/minimal), and when you have two roles that need different things, read [`multi-agent-company`](../../examples/opencontext/multi-agent-company).
