# @logicsrc/agentstack

AgentStack is the LogicSRC module for **portable agent, task, payment, and reputation
coordination** across Profullstack microsaas apps (sh1pt, uGig, qaaas.dev, crawlproof,
commandboard.run, coinpayportal, logicsrc, intr0s).

It is the reference implementation of the `agentstack` capability in the Profullstack
Shared AppKit OpenSpec (`profullstack-web/openspec/specs/agentstack`).

## What it provides

- **DID helpers** for CoinPay-linked identities: `userDid`, `agentDid`, `makeDid`, `parseDid`
  (`did:coinpay:user:123`, `did:coinpay:agent:abc`).
- **`DidTask`** — a portable task model with a defined status lifecycle
  (`pending → queued → running → blocked → complete | failed | cancelled`) that can bind to
  payment, escrow, and reputation events.
- **`AgentStack`** — an in-memory coordinator that registers agents, tracks tasks, records
  delegation grants, and emits coordination events. Storage backends can wrap the same API.
- **`agentStackPlugin`** — a LogicSRC `PluginDefinition` (validated against the plugin
  manifest schema) exposing AgentStack as a coordination plugin with routes, events,
  permissions, and a TUI panel.

## Usage

```ts
import { AgentStack, userDid, agentDid } from "@logicsrc/agentstack";

const stack = new AgentStack();
const owner = userDid("123");

stack.registerAgent({
  did: agentDid("abc"),
  name: "Build Agent",
  sourceApp: "commandboard.run",
  supportedProtocols: ["logicsrc/1"]
});

const task = stack.createTask({ ownerDid: owner, sourceApp: "sh1pt.com", title: "Ship build" });
stack.assignTask(task.id, agentDid("abc"));
stack.updateTaskStatus(task.id, "running");
stack.updateTaskStatus(task.id, "complete", { reputationEventId: "rep_1" });
```

## Cross-app identity

Each app keeps a local `users.id` and links it to a CoinPay DID, giving cross-app identity
without shared cookies or one global account database:

```txt
sh1pt.users.id -> did:coinpay:user:123
ugig.users.id  -> did:coinpay:user:123
```

## Runtime

Runtime-neutral by design — pure TypeScript with no Bun- or Node-only APIs (time is injected
via the `AgentStack` constructor). Runs on **Bun, Node.js, Cloudflare Workers, and the
browser**, matching the Profullstack dual-runtime standard.

## Environment

```txt
AGENTSTACK_API_URL
AGENTSTACK_API_KEY
COINPAY_API_BASE_URL
```

## Scripts

```bash
npm run build   # tsc -> dist
npm test        # vitest
```
