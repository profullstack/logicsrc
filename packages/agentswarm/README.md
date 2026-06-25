# @logicsrc/agentswarm

Embeddable multi-agent **swarm** runtime for LogicSRC, wrapping
[`deepagents`](https://www.npmjs.com/package/deepagents). It ships a
framework-agnostic Web handler that each host app **mounts on its own route**
(e.g. `tronbrowser.dev/swarm`) — the host owns hosting, model keys, storage, and
billing; agentswarm turns an HTTP request into an agent turn.

MIT licensed. Open-source package + self-hosted by each consumer.

## Install

```sh
npm i @logicsrc/agentswarm
# the real runner needs these optional peers in the host app:
npm i deepagents @langchain/langgraph @langchain/anthropic
```

## Mount it

The core is a `(Request) => Response` handler, so it drops into any modern stack.

```ts
import { createSwarmHandler, createDeepAgentRunner } from "@logicsrc/agentswarm";

const runner = await createDeepAgentRunner({ model: "anthropic:claude-sonnet-4-6" });

// Next.js route handler — app/swarm/route.ts
export const POST = createSwarmHandler({ runner });
```

```ts
// Hono / any Web-standard server
app.post("/swarm", (c) => createSwarmHandler({ runner })(c.req.raw));
```

Request body: `{ "messages": [{ "role": "user", "content": "…" }], "rubric"?: string, "threadId"?: string }`.

## Meter / gate each call (x402, auth)

`onRequest` runs before the agent. Throw a `SwarmError` with a status to reject —
this is where a host enforces an x402 payment or a scoped agent token.

```ts
import { SwarmError } from "@logicsrc/agentswarm";

createSwarmHandler({
  runner,
  onRequest: async (input, request) => {
    if (!(await paid(request))) throw new SwarmError("payment required", 402);
  }
});
```

## Bring your own runner

`SwarmRunner` is a one-method interface, so you can stub it in tests or back it
with something other than deepagents:

```ts
const runner = { async run(input) { /* … */ } };
```

## Demo

```sh
npm run build && npm run demo
curl -s localhost:8787/swarm -d '{"messages":[{"role":"user","content":"hi"}]}'
```

## Self-checking with a rubric

Wrap any runner so the agent grades its own answer against "done" criteria and
revises until it passes (deepagents' RubricMiddleware, reimplemented at the
runner layer since it is Python-only in the JS package today):

```ts
import { createRubricRunner, createLLMJudge, createDeepAgentRunner } from "@logicsrc/agentswarm";

const runner = createRubricRunner({
  runner: await createDeepAgentRunner({ model: "anthropic:claude-sonnet-4-6" }),
  judge: await createLLMJudge({ model: "anthropic:claude-haiku-4-5" }), // cheap grader
  maxIterations: 3,
  onEvaluation: (e) => console.log(`iteration ${e.iteration}: ${e.passed ? "pass" : "fail"} — ${e.explanation}`)
});

// then: createSwarmHandler({ runner })
```

Pass the rubric per request: `{ "messages": [...], "rubric": "- one sentence\n- mentions chlorophyll" }`.

## Status

- **M1** ✓ core handler + injectable runner + deepagents adapter + x402 gate hook.
- **M3** ✓ rubric self-check loop (`createRubricRunner` / `createLLMJudge`).
- Next: peer coordination (the swarm), Turso checkpointer, agentgit identity +
  budget/ledger adapters, x402 billing middleware, and the tronbrowser mount.
