# AgentStack

Status: draft module

AgentStack (`@logicsrc/agentstack`) is the LogicSRC module for **portable agent, task,
payment, and reputation coordination** across Profullstack microsaas apps. It is the
reference implementation of the `agentstack` capability defined in the Profullstack Shared
AppKit OpenSpec (`profullstack-web/openspec/specs/agentstack`).

## Why

Profullstack apps (sh1pt, uGig, qaaas.dev, crawlproof, commandboard.run, coinpayportal,
logicsrc, intr0s) need to share agents, tasks, reputation, and payment context without
forcing a shared login or one global account database. AgentStack provides a small,
provider-neutral coordination layer on top of CoinPay DIDs.

## Identity model

```txt
User DID:   did:coinpay:user:123
Agent DID:  did:coinpay:agent:abc
Task:       task_123
```

Each app keeps a local `users.id` and links it to a CoinPay DID. The same person can appear
in many apps while every app independently owns its account:

```txt
sh1pt.users.id      -> did:coinpay:user:123
ugig.users.id       -> did:coinpay:user:123
qaaas.users.id      -> did:coinpay:user:123
crawlproof.users.id -> did:coinpay:user:123
```

## Task lifecycle

```txt
pending -> queued -> running -> blocked -> complete | failed | cancelled
```

A task may carry `paymentIntentId`, `escrowId`, and `reputationEventId` so coordination,
payment, escrow, and reputation stay linked. Terminal statuses (`complete`, `failed`,
`cancelled`) are final.

## Surface

- DID helpers: `userDid`, `agentDid`, `makeDid`, `parseDid`
- `DidTask`, `AgentProfile`, `DelegationGrant` types
- `AgentStack` coordinator: `registerAgent`, `createTask`, `assignTask`,
  `updateTaskStatus`, `delegate`, `revokeDelegation`, `listTasks`, `snapshot`, `on`
- `agentStackPlugin` — a validated LogicSRC `PluginDefinition`

## Plugin manifest

```jsonc
{
  "id": "agentstack",
  "name": "AgentStack",
  "type": ["agents", "tasks", "coordination"],
  "capabilities": [
    "agents.register", "agents.delegate",
    "tasks.create", "tasks.assign", "tasks.update", "tasks.publish",
    "reputation.sync", "payments.link", "escrow.link"
  ],
  "commands": ["agents", "tasks", "delegate"],
  "env": ["AGENTSTACK_API_URL", "AGENTSTACK_API_KEY", "COINPAY_API_BASE_URL"]
}
```

## Relationship to other modules

- **CoinPay plugin** — provides the DID/wallet/payment/escrow/reputation backend AgentStack
  references.
- **uGig plugin** — publishes tasks to the jobs/gigs marketplace via `tasks.publish`.
- **AgentSwarm orchestration** — higher-level multi-agent orchestration can consume
  AgentStack tasks and delegation grants.

See also [`openspec-comparison.md`](openspec-comparison.md) and the `agentstack` OpenSpec
capability.
