# Integration patterns

OpenContext never requires a specific LLM provider, framework, or database. These are the shapes people actually deploy.

## System prompts

The most direct use: resolve, render, prepend.

```ts
import { OpenContext, renderBundle } from "@logicsrc/opencontext";

const oc = await OpenContext.load("./opencontext.yaml");
const { bundle } = oc.resolve({ agent: "support-agent", task: userMessage });

const messages = [
  { role: "system", content: renderBundle(bundle, "markdown") },
  { role: "user", content: userMessage }
];
```

The Markdown renderer groups by layer, opens with a statement that everything below is context rather than instruction, and fences untrusted spans. Do not flatten it into raw text — the envelope is load-bearing. See [security](./security.md).

Record the digest alongside whatever the agent produces, and the decision stays reconstructable after the model is replaced.

## RAG pipelines

OpenContext is the **control plane above** retrieval, not a replacement for it.

```ts
// 1. Your retriever proposes candidates.
const candidates = await vectorStore.search(query, { k: 50 });

// 2. OpenContext decides what this consumer may actually see.
const scope = oc.scope({ agent: "support-agent" });
const allowed = candidates.filter((hit) => {
  const object = oc.get(hit.id);
  return object ? authorize(object, scope).allowed : false;
});
```

Two rules worth stating plainly:

- **Never rank before authorizing.** Embedding similarity has no idea what a role may read.
- **Retrieval rank is not authority.** The top hit is not thereby the truth; a `reference` note that scores well does not outrank a `canonical` policy.

A reasonable division of labour: vectors find *candidates*, OpenContext decides *eligibility* and *authority*, and the bundle is what reaches the model.

## MCP servers

MCP is complementary. A server exposes operations over the same resolution rules:

```txt
context.get       one object, subject to authorization
context.search    lexical search, authorized before results are returned
context.resolve   a bundle for a consumer and task
context.list      what exists in scope
context.explain   why an object was included or excluded
```

MCP access **must use the same permission and resolution rules as the CLI and SDK**. An MCP server that resolves with a wider scope than the agent holds is a privilege escalation wearing a protocol.

Carry the caller's identity into `resolve({ agent })` rather than resolving unrestricted and filtering afterwards.

## Agent frameworks

Bundles are framework-neutral: resolve, render, hand over.

```ts
const bundle = oc.bundle({ agent: agentId, task });

// Any framework — the bundle is just text plus metadata.
agent.setSystemPrompt(renderBundle(bundle, "markdown"));
agent.setCapabilities(bundle.permissions ?? []);
```

`bundle.permissions` carries the capability strings the role holds, for your runtime to enforce. OpenContext transports and scopes them; it does not perform your application's actions.

For multi-agent systems, give each agent a role in the manifest rather than a bespoke prompt. A hand-written prompt is context that exists only inside that agent — exactly the state this specification exists to end.

## CLI agents

```bash
opencontext resolve --role support --task "$TASK" --format markdown > /tmp/context.md
my-agent --system /tmp/context.md "$TASK"
```

Discovery searches upward, so this works from any directory in the project.

## Human onboarding

The same bundle that briefs an agent briefs a person:

```bash
opencontext resolve --role support --format markdown > onboarding.md
```

If it is not good enough for a new hire, it is not good enough for an agent — and the reverse is the useful test for whether your context is actually written down.

## CI/CD

```yaml
name: OpenContext

on: [pull_request, push]

jobs:
  context:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx @logicsrc/opencontext validate --strict
      - run: npx @logicsrc/opencontext doctor --strict
      - run: npx @logicsrc/opencontext bundle --role support --output bundle.json
      - uses: actions/upload-artifact@v4
        with:
          name: context-bundle
          path: bundle.json
```

Useful gates:

```bash
opencontext conflicts --strict              # reject duplicate canonical policies
opencontext stale --strict                  # reject expired required context
opencontext doctor --strict --min-score 95  # enforce a health floor
```

Publishing the bundle as a build artifact means every release records exactly what its agents knew.

## GitOps

Context lives in the repository and changes through pull requests, reviewed like code.

- A policy change is a diff a human approves.
- `opencontext diff` shows the governance-relevant fields, not every byte.
- `git://<rev>/<path>` reads context out of any past commit, offline.
- Branch protection on `context/` gives you approval workflow without a hosted service.

## API servers

```ts
app.post("/context/resolve", async (req, res) => {
  const identity = await authenticate(req);          // your IdP, not OpenContext

  const { bundle } = oc.resolve({
    agent: identity.agentId,                          // never from the request body
    task: req.body.task
  });

  res.json(bundle);
});
```

Take the consumer identity from your authenticated session, never from the payload. OpenContext enforces what a *named* consumer may read; it does not authenticate who is asking.

## Recording decisions

```ts
const { bundle } = oc.resolve({ agent, task });
const answer = await model.complete(renderBundle(bundle, "markdown"), task);

oc.add({
  id: `decisions.${today}-${slug}`,
  type: "decision",
  title,
  decision: answer.decision,
  rationale: answer.rationale,
  decided_by: { type: "agent", id: agent },
  bundle: { bundle_id: bundle.bundle_id, digest: bundle.digest }
}, { allowPromotion: false });
```

Note `allowPromotion: false`. An agent records a decision at ordinary authority; a human promotes it to `approved`. Observed context does not become truth automatically.

## Anti-patterns

**Copying context into a prompt template.** It drifts within a week, and nothing tells you.

**Resolving unrestricted and filtering later.** Unauthorized context has already been ranked, logged, and possibly cached.

**Treating a bundle as a cache.** It is a snapshot for one task at one instant. Re-resolve; it costs milliseconds.

**Writing back inferred context as canonical.** That is how a model's guess becomes company policy without anyone deciding.

**Stripping the untrusted envelope to save tokens.** The label is what stops a ticket from reading as an instruction.
