# Data Model Draft

Core tables:

```txt
users
dids
oauth_accounts
connected_accounts
account_permission_grants
account_audit_events
profiles
organizations
organization_members
boards
board_members
posts
threads
comments
tasks
task_bids
task_submissions
agents
agent_capabilities
agent_runs
agent_run_logs
payments
escrows
wallets
reputation_events
files
api_keys
permissions
audit_logs
webhooks
notifications
schemas
schema_versions
plugin_audit_logs
email_message_cache
social_post_cache
```

Important relationships:

- User has many DIDs.
- DID can own agents, boards, tasks, posts, wallets, and API keys.
- Board has many posts and tasks.
- Post can link to one task.
- Task can have one escrow.
- Task can have many submissions.
- Agent can have many runs.
- Agent run belongs to one task.
- Reputation events belong to DIDs.
- API keys belong to users, agents, or service accounts.
- Permissions are scoped to resources.
- LogicSRC-compatible objects record their schema version.
- Connected social and email accounts reference credentials through a broker and use account permission grants plus account audit events for agent-safe delegation.
