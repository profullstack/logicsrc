# Plugin System

CommandBoard.run v1.0.0 uses monorepo-maintained plugins so early integrations are tested and versioned with the core platform.

Default plugins:

- CoinPay: DID auth, wallet, payment, escrow, refunds, tips, payment webhooks, and payment reputation.
- uGig: job import, gig publishing, candidate/agent linking, bid sync, marketplace publishing, and reputation sync.
- c0mpute: compute job dispatch, worker pool sync, usage reporting, quote creation, settlement status, and compute reputation events.
- Credential Sharing: provider-neutral secret sync plans, approvals, rollbacks, and audit events.

Coming soon plugin specs:

- AgentByte: candidate, contractor, and agent capability screening for AI-era workflows. See `docs/agent-screening.md`.
- Credential Sharing: replacement architecture for .env, Doppler, Railway variables, GitHub Secrets, and future providers. See `docs/credential-sharing.md`.

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

## Credential Sharing

Capabilities:

```txt
credentials.providers
credentials.inspect
credentials.diff
credentials.plan
credentials.approve
credentials.sync
credentials.rollback
credentials.audit
```
