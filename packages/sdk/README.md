# @logicsrc/sdk

LogicSRC contract types and constructors for tasks, AgentSwarm sessions and
OpenRental descriptors. These helpers construct documents; they do not start
agents, resolve remote identities or initiate payments.

```sh
npm install @logicsrc/sdk @logicsrc/validators
```

```ts
import { createOpenRental } from "@logicsrc/sdk";
import { validate } from "@logicsrc/validators";

const listing = createOpenRental({
  id: "https://example.com/listings/research",
  name: "Research",
  owner_did: "operator.coinpay",
  members: [{
    kind: "openagent",
    id: "analyst.coinpay",
    url: "https://example.com/agents/analyst.json"
  }]
});

const result = validate("openrental", listing);
if (!result.ok) throw new Error(JSON.stringify(result.errors));
```

Use `@logicsrc/validators` 0.2.0 or newer for OpenRental validation. See the
[OpenRental specification](https://logicsrc.com/docs/openrental) for member
bindings, exact decimal rental rates and CoinPay settlement metadata.

MIT © Profullstack, Inc.

## OpenABTest draft

Version 0.3.0 adds `OpenABTestManifest`, `OpenABTestEvent`,
`createOpenABTestManifest` and `createOpenABTestEvent`. The constructors set
`openabtest: "0.1-draft"`; validate their result with `@logicsrc/validators`
using `openabtest-manifest` or `openabtest-event` before storing it. They do not
assign participants, authenticate events or initiate payments. See the
[OpenABTest specification](https://logicsrc.com/docs/openabtest) and its complete
Chovy fixture for every referred purchase.
