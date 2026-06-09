# Communication Accounts

Status: draft implementation scaffold

Slug: `communication-accounts`

Communication Accounts is the LogicSRC standard for connecting external social and email identities, delegating scoped access to humans, agents, workflows, and plugins, and auditing every read/write action without exposing raw credentials.

## First-Party Plugins

```txt
social-accounts
email-accounts
```

- `@logicsrc/plugin-social-accounts` manages social/network accounts such as Mastodon, Bluesky, GitHub, X/Twitter, Reddit, LinkedIn, YouTube, Discord, Telegram, and future ActivityPub/RSS-style adapters.
- `@logicsrc/plugin-email-accounts` manages email inboxes and outbound sending identities through IMAP/SMTP, Gmail, Microsoft Graph, ForwardEmail.net, local bridges, and custom providers.

Both plugins share contracts from `@logicsrc/account-core`.

## Core Objects

```txt
connected_account
account_provider
account_permission_grant
account_policy
account_audit_event
credential_broker_call
email_message_cache
social_post_cache
```

The shared account model records account kind, provider, account display metadata, granted scopes, declared capabilities, status, credential reference, ownership scope, and sync timestamps.

## Provider Boundary

Provider adapters implement the shared account provider contract:

```txt
provider.id
provider.kind
provider.authMethods
provider.capabilities
provider.getAuthUrl()
provider.completeAuth()
provider.refreshCredential()
provider.testConnection()
provider.revoke()
```

Social providers extend this with profile, draft, publish, media, mentions, comments, and analytics operations.

Email providers extend this with search, read, draft, send, reply, forward, archive, label, and delete operations.

## Permissions

Shared permissions:

```txt
accounts:connect
accounts:list
accounts:read_metadata
accounts:test
accounts:revoke
accounts:sync
accounts:audit:read
```

Social and email permissions use colon-style grant scopes such as `social:post:publish`, `social:mentions:read`, `email:headers:read`, `email:send`, and `email:attachments:read`.

Plugin manifest capabilities use the existing LogicSRC dotted capability convention such as `social.post.publish` and `email.headers.read`.

## Policy Gates

These actions require policy evaluation by default:

```txt
social:post:publish
social:post:delete
social:dm:read
social:dm:send
email:attachments:read
email:send
email:delete
```

Default write behavior is dry-run first, approval required for public publishing and outbound email, and deny for critical risk unless an admin override exists.

## Credential Rules

- Raw secrets must never be printed or exposed to agents by default.
- OAuth refresh tokens and app passwords must be stored through a credential broker.
- Provider calls should execute through a trusted runtime boundary.
- Credential access must create audit events.
- CLI, API, MCP, TUI, and PWA previews must redact secret-like fields.

## CLI Namespaces

```bash
logicsrc accounts providers
logicsrc accounts list
logicsrc accounts audit <account-id>
logicsrc social providers
logicsrc social accounts
logicsrc social post <account-id> --text "Launching today" --dry-run
logicsrc email providers
logicsrc email accounts
logicsrc email send <draft-id> --dry-run
```

The initial scaffold exposes provider listings and dry-run placeholders. Live connect, sync, send, and publish flows require durable credential broker, approval queue, and audit persistence.

## Storage

Deployable database migrations live under `supabase/migrations/`.

The communication account scaffold adds:

```txt
connected_accounts
account_permission_grants
account_audit_events
email_message_cache
social_post_cache
```

## MVP Order

1. Stabilize `packages/account-core`.
2. Validate account schemas through `packages/validators`.
3. Apply Supabase account migrations.
4. Wire provider and account list commands.
5. Add API read/list/dry-run endpoints and contract tests.
6. Add MCP read-only resources.
7. Add TUI/PWA account status panels.
8. Implement IMAP/SMTP provider behind approval and audit gates.
9. Implement Mastodon, Bluesky, or GitHub social provider behind approval and audit gates.
10. Add Gmail OAuth after credential broker storage and restricted-scope handling are complete.
