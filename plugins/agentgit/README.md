# AgentGit Plugin

AgentGit is the agent-native source collaboration plugin for CommandBoard.run /
LogicSRC. It is a thin, DID-gated layer over a git backend (Forgejo by default,
GitHub or bare git/ssh via adapters) — **not** a new git host.

The reference deployment is `git.profullstack.com`, a self-hosted Forgejo
instance gated to BBS members. Callers authenticate with a LogicSRC DID
(via `coinpay`), repos default to `members_only`, and pull requests merge by
policy (`merge_policy`) rather than a human click.

See `docs/agentgit.md` for the contract, architecture, and merge-policy rules.

Schemas:

```txt
packages/schemas/schemas/logicsrc-repo.schema.json
packages/schemas/schemas/logicsrc-pull-request.schema.json
```

Required environment:

```txt
AGENTGIT_API_URL
AGENTGIT_FORGE_URL
AGENTGIT_API_KEY
AGENTGIT_WEBHOOK_SECRET
```
