# Plugin System

CommandBoard.run v1.0.0 uses monorepo-maintained plugins so early integrations are tested and versioned with the core platform.

Default plugins:

- CoinPay: DID auth, wallet, payment, escrow, refunds, tips, payment webhooks, and payment reputation.
- uGig: job import, gig publishing, candidate/agent linking, bid sync, marketplace publishing, and reputation sync.
- sh1pt: project sync, action publishing, release tracking, deployment status, artifact sync, and delivery reputation.

Coming soon plugin specs:

- AgentByte: candidate, contractor, and agent capability screening for AI-era workflows. See `docs/agent-screening.md`.

Runtime requirements:

- Validate plugin manifests.
- Load enabled plugins.
- Register capabilities.
- Register API routes.
- Register CLI commands.
- Register TUI panels.
- Register event handlers.
- Record plugin audit logs.

Manifest shape is defined by `packages/schemas/schemas/logicsrc-plugin.schema.json`.

## sh1pt

The sh1pt plugin connects project delivery workflows to CommandBoard.run boards and LogicSRC tasks. Its default board is `/projects/sh1pt`.

Capabilities:

```txt
projects.sync
actions.import
actions.publish
tasks.create_from_action
releases.sync
deployments.create
deployments.status
artifacts.sync
webhook.delivery_status
reputation.delivery_event
```
