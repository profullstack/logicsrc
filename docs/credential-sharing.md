# Credential Sharing OpenSpec

Status: reference implementation available (`@logicsrc/plugin-credential-sharing`)

Slug: `credential-sharing`

## Reference Implementation

The spec below is implemented by `plugins/credential-sharing` and surfaced through
`logicsrc credentials <command>`. All four first providers (`env`, `doppler`,
`railway`, `github-secrets`) ship as provider adapters.

```bash
# List adapters and their capabilities (which can read values vs. write-only)
logicsrc credentials providers

# Inspect an endpoint — redacted key names + value fingerprints, never raw values
logicsrc credentials inspect --provider env --path .env

# Diff a source against a target without moving anything
logicsrc credentials diff --from env --from-path .env --to railway \
  --to-project <projectId> --to-config <environmentId>

# Build a plan (stored under ~/.config/logicsrc/credentials), then dry-run, then apply
logicsrc credentials plan --from env --from-path .env --to doppler \
  --to-project <project> --to-config <config>
logicsrc credentials sync --plan <planId>            # dry-run (no writes)
logicsrc credentials sync --plan <planId> --approve  # writes to the target

# Audit and reverse a run (rollback emits a NEW plan)
logicsrc credentials audit --run <runId> --format markdown
logicsrc credentials rollback --run <runId>
```

SDK usage mirrors the spec via `createCredentialEngine()` from the plugin package.

Implementation notes:
- Value fingerprints are salted SHA-256 (truncated) so two endpoints can be diffed
  without revealing values; they are equality/integrity markers, not secret storage.
- `github-secrets` is write-only for values (GitHub never returns secret values), so
  it cannot be a sync source or a value-restoring rollback target. Secret writes are
  libsodium sealed-box encrypted against the repo/org/environment public key.
- Rollback captures the target's prior values into a 0600 vault under
  `~/.config/logicsrc/` — outside any project, so there is nothing to gitignore
  and nothing lands in a repo. The only place raw values touch disk. Plans, runs, and audit records
  contain fingerprints only.

Credential Sharing is a LogicSRC OpenSpec for portable, auditable secret synchronization across local files and infrastructure providers. It is intended to replace closed, proprietary credential-sharing workflows with a provider-neutral contract.

LogicSRC defines the open objects, CLI commands, SDK calls, TUI states, PWA states, provider adapter capabilities, and audit records. External products may consume this contract, but LogicSRC does not call out to product-specific commands.

## First Providers

```txt
env
doppler
railway
github-secrets
sh1pt
```

- `.env`: read, diff, redact, and write local environment files.
- Doppler: sync project/config scoped secrets.
- Railway: sync service variables.
- GitHub Secrets: sync repository, organization, and environment secrets.
- sh1pt: sync the distribution credential vault — App Store Connect keys, Play
  service accounts, npm and Docker tokens, Cloudflare tokens.

`sh1pt` is the one adapter driven through a **CLI** rather than an HTTP API,
because sh1pt publishes `sh1pt secret set|get|list|rm` as the interface to its
vault and documents no REST endpoint for it. That is a transport choice inside
an adapter, which is the layer where product-specific I/O belongs; it does not
move product-specific commands into the core contract. Two consequences worth
stating:

- Values are written on the child process's **stdin**, never as argv. A secret
  passed as a command-line argument is readable by any user on the host via
  `ps` for the lifetime of the call.
- `sh1pt secret get` requires interactive confirmation and so cannot be
  scripted. The adapter is therefore write-only for values (`readValues:
  false`), exactly like `github-secrets`: it can be a sync target but never a
  source, and it supports no value-restoring rollback.

## Core Objects

```txt
credential_provider
credential_source
credential_target
credential_key
credential_fingerprint
credential_policy
credential_diff
credential_sync_plan
credential_sync_run
credential_approval
credential_rollback
credential_audit_event
```

## CLI Spec

Command namespace:

```bash
logicsrc credentials <command>
```

Required commands:

```txt
providers
inspect
plan
diff
approve
sync
rotate
rollback
audit
export
```

`logicsrc secrets …` is an accepted alias for `logicsrc credentials …`.

Examples:

```bash
logicsrc credentials providers
logicsrc credentials plan --from env --to railway
logicsrc credentials plan --from doppler --to github-secrets
logicsrc credentials diff --from env --to doppler --redact
logicsrc credentials sync --plan cred_plan_123 --approve
logicsrc credentials audit --run cred_run_123 --format markdown
```

## Security Rules

- Raw secret values must never be printed by default.
- Audit logs should store key names, targets, timestamps, actor identity, and value fingerprints, not raw values.
- Every write operation should support dry-run mode.
- Provider adapters must declare read/write capabilities before a plan is generated.
- Destructive changes require explicit approval.
- Rollbacks must be represented as new sync plans rather than hidden mutation history.

## SDK Spec

All SDKs should expose the same conceptual API:

```txt
listCredentialProviders()
inspectCredentialSource(source)
createCredentialSyncPlan(input)
diffCredentialTargets(planId)
approveCredentialSync(planId, approval)
runCredentialSync(planId)
rollbackCredentialSync(runId)
exportCredentialAudit(runId)
```

## Provider Adapter Contract

Provider adapters implement the LogicSRC credential provider contract:

```txt
provider.id
provider.capabilities
provider.auth_requirements
provider.inspect()
provider.diff()
provider.write()
provider.rollback()
provider.audit()
```

The adapter boundary lets tools such as a PWA, TUI, CI workflow, or external CLI consume the same open standard without making LogicSRC depend on any specific product.

## Team Sharing (end-to-end encrypted)

The `team` provider adds a fifth endpoint type — a hosted, **end-to-end-encrypted**
team vault — so you can share credentials with teammates by email instead of
passing `.env` files over chat. It is addressed as `team:<team-slug>/<vault-name>`
(`endpoint.project` = team slug, `endpoint.config` = vault name).

### Trust model

The server (`commandboard-api`, routes under `/api/credshare`) is a **zero-knowledge
relay for secret values**. It stores only:

- member identity **public keys** (X25519),
- the vault **data-encryption key (DEK) sealed to each member's public key**
  (`crypto_box_seal`), one wrapped copy per member,
- secret **ciphertext + nonce** (`crypto_secretbox`), plus a salted fingerprint
  for redacted diffs.

Plaintext secret values and the raw DEK never leave a member's machine. Granting a
teammate access = an existing member unwraps the DEK with their private key and
re-wraps (seals) it to the new member's public key. The private key lives only in
`~/.config/logicsrc/identity.json` (mode 0600) and is never uploaded.

### CLI

```bash
# One-time: log in through your browser (registers this device's identity key).
logicsrc login

# Owner: create a team, push a local .env into an encrypted vault, invite people.
# A vault is addressed as <project> <env>, stored as the vault name
# project--env (a double dash: the server slugs vault names through
# /^[a-z0-9][a-z0-9-]{0,62}$/, so a "/" would be rejected).
logicsrc teams create acme --name "Acme Inc"
logicsrc teams push acme web prod --env .env    # encrypt + upload
logicsrc teams invite acme teammate@example.com # emails an accept link

# Teammate: accept, then get granted, then pull + decrypt locally.
logicsrc login
logicsrc teams accept <token-from-email>
# …an existing member runs:  logicsrc teams grant acme web prod teammate@example.com
logicsrc teams pull acme web prod --env .env    # download + decrypt

# Inspect / manage
logicsrc teams list
logicsrc teams members acme
logicsrc teams vaults acme
```

### Rotating a vault key

```bash
# Dry run (the default): show what a rotation would re-key and revoke.
logicsrc credentials rotate acme web prod

# Apply it.
logicsrc credentials rotate acme web prod --approve

# Every vault in the team that you can open.
logicsrc secrets rotate acme --approve
```

Rotation replaces the vault DEK, re-seals it to the members who keep access, and
re-encrypts every secret under it. **Secret values do not change** — nothing that
consumes them breaks. What changes is that every wrapped key issued before the
rotation is dead, so a copy of an old grant buys nothing.

Who keeps access:

- **`--active`** (default): only members whose team status is `active` *and* who
  hold a grant today. This is the "someone left the team" rotation — everyone
  else is revoked.
- **`--all`**: everyone holding a grant today, whatever their status. Pure
  crypto hygiene, no revocation.

A member who holds access but has never uploaded a public key cannot be re-sealed
to; they are reported under `skipped` and revoked rather than dropped silently.

Safety properties, all enforced rather than documented:

- The whole next state is applied in **one transaction**. The DEK is recoverable
  only through the grants, so a half-applied rotation — new grants over old
  ciphertext, or the reverse — would make the vault permanently unreadable.
- The server requires every submitted fingerprint to equal the stored one. It
  cannot see values, but it can prove a rotation did not swap any.
- A rotation that would leave the caller ungranted, grant nobody, or cover the
  wrong number of secrets is rejected before anything is written.

`logicsrc login` picks its flow from the machine it runs on:

- **Has its own browser** → loopback OAuth-PKCE: a `127.0.0.1` listener catches
  the callback. Force it with `--web`.
- **No browser** (SSH, droplet, container, CI) → device authorization: the CLI
  prints a short code, you approve it from a browser on any other machine.
  Force it with `--device`. A loopback redirect would be useless here — the
  browser's `127.0.0.1` is not the CLI's machine.
- **Unattended** → `--token lsk_…` from **Settings ▸ API keys**.

It talks to the hosted credentials app by default. Point it elsewhere (local dev,
self-hosted) with `LOGICSRC_API=http://localhost:8080 logicsrc login` or
`logicsrc login --api-url …`; the chosen origin is remembered in
`~/.config/logicsrc/identity.json` once login succeeds.

Because `team` is a normal provider, the generic sync surface works too — e.g.
`logicsrc credentials plan --from env --from-path .env --to team --to-project acme
--to-config prod`, then `diff`, `sync`, `audit`, and `rollback` behave exactly as
with the other providers.

### Server + web

- Server storage is behind a `CredShareStore` interface: an in-memory store for
  local dev/tests, and a Supabase-backed store (`SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY`) for production. Migration:
  `supabase/migrations/*_credshare.sql` (deny-by-default RLS).
- Email (login codes + invites) uses Resend when `RESEND_API_KEY` is set; without
  it, codes/tokens are returned in the API response for local use.
- `logicsrc.com/teams` is a management surface only: log in by email, view
  teams/members/vaults and invite/accept. The browser holds no private key, so it
  never decrypts — decryption happens only in the CLI.
