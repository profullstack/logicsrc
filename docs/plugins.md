# Plugin System

CommandBoard.run v1.0.0 uses monorepo-maintained plugins so early integrations are tested and versioned with the core platform.

Default plugins:

- CoinPay: DID auth, wallet, payment, escrow, refunds, tips, payment webhooks, and payment reputation.
- uGig: job import, gig publishing, candidate/agent linking, bid sync, marketplace publishing, and reputation sync.
- c0mpute: compute job dispatch, worker pool sync, usage reporting, quote creation, settlement status, and compute reputation events.
- Credential Sharing: provider-neutral secret sync plans, approvals, rollbacks, and audit events.
- Social Accounts: provider-neutral social profile, drafting, publishing, sync, policy, and audit flows.
- Email Accounts: provider-neutral inbox, sending identity, search, draft, send, sync, policy, and audit flows.

Coming soon plugin specs:

- AgentByte: candidate, contractor, and agent capability screening for AI-era workflows. See `docs/agent-screening.md`.
- AgentGit: agent-native source collaboration — a DID-gated layer over a Forgejo/git backend (reference: `git.profullstack.com`, BBS members only) with policy-gated merges. See `docs/agentgit.md`.
- Credential Sharing: replacement architecture for .env, Doppler, Railway variables, GitHub Secrets, and future providers. See `docs/credential-sharing.md`.
- Communication Accounts: shared social and email account management contracts. See `docs/communication-accounts.md`.

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
