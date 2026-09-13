# @logicsrc/sdk

LogicSRC contract types and constructors for tasks, AgentSwarm sessions and
OpenFleet descriptors. These helpers construct documents; they do not start
agents, resolve remote identities or initiate payments.

```sh
npm install @logicsrc/sdk @logicsrc/validators
```

```ts
import { createOpenFleet } from "@logicsrc/sdk";
import { validate } from "@logicsrc/validators";

const fleet = createOpenFleet({
  id: "https://example.com/fleets/research",
  name: "Research",
  owner_did: "operator.coinpay",
  members: [{
    kind: "openagent",
    id: "analyst.coinpay",
    url: "https://example.com/agents/analyst.json"
  }]
});

const result = validate("openfleet", fleet);
if (!result.ok) throw new Error(JSON.stringify(result.errors));
```

Use `@logicsrc/validators` 0.1.1 or newer for OpenFleet validation. See the
[OpenFleet specification](https://logicsrc.com/docs/openfleet) for member
bindings, exact decimal rental rates and CoinPay settlement metadata.

MIT © Profullstack, Inc.
