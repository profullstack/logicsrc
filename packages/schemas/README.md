# @logicsrc/schemas

Canonical JSON Schemas (draft 2020-12) for the LogicSRC open coordination
standards, maintained by Profullstack, Inc.

Two schema families ship from this package:

- **LogicSRC core** — `logicsrc-*.schema.json`: tasks, agents, runs, events,
  plugins, connected accounts, email messages, social posts.
- **AgentAd** — `agentad-*.schema.json`: a disclosed, agent-readable advertising
  contract for CLI tools and AI agents (ads, placements, requests, responses,
  impressions, clicks, campaigns). See `docs/agentad.md` in the repo;
  [cl1s.tech](https://github.com/profullstack/cl1s.tech) is the reference network.

## Install

```bash
npm install @logicsrc/schemas
```

## Use

```js
import adSchema from "@logicsrc/schemas/agentad-ad" with { type: "json" };
import taskSchema from "@logicsrc/schemas/task" with { type: "json" };
```

Schema `$id`s resolve under `https://schemas.logicsrc.com/`. Validate with any
draft 2020-12 validator (e.g. `ajv/dist/2020.js`), or use `@logicsrc/validators`
from the monorepo.

## License

MIT © Profullstack, Inc.
