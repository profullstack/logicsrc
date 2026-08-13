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
ssh
```

- `.env`: read, diff, redact, and write local environment files.
- Doppler: sync project/config scoped secrets.
- Railway: sync service variables.
- GitHub Secrets: sync repository, organization, and environment secrets.
- sh1pt: sync the distribution credential vault — App Store Connect keys, Play
  service accounts, npm and Docker tokens, Cloudflare tokens.
- ssh: read and restore a local `~/.ssh` — key pairs, `config`,
  `allowed_signers` — with permission bits preserved.

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

## SSH Keys

`logicsrc secrets ssh` pairs the `ssh` adapter with a team vault, so private
keys live encrypted in a vault instead of as plaintext-on-disk files guarded
only by a passphrase — the same trade Proton Pass makes with its SSH agent.

```bash
# Back up ~/.ssh (key pairs + config) into the vault for your username
logicsrc secrets ssh push profullstack           # → vault ssh--anthony
logicsrc secrets ssh push --dry-run              # show what would go up
logicsrc secrets ssh push --include authorized_keys

# See what a vault holds — paths, kinds and modes, never key bodies
logicsrc secrets ssh list profullstack

# Restore onto a new machine, permissions and all
logicsrc secrets ssh pull profullstack

# Or use the keys without ever writing them to that machine's disk
logicsrc secrets ssh agent profullstack --lifetime 3600
```

Key material is addressed by **person, not project**: the vault is
`ssh--<username>`, which `teams vaults` lists as project `ssh`, env
`<username>`. One teammate's keys therefore never land in another's restore,
and sharing a key stays a deliberate `teams grant`.

Implementation notes:

- Each file becomes one secret whose value is a JSON envelope carrying the
  relative path, permission bits, and body. The envelope exists because the
  engine only hands `write()` the secrets that CHANGED — a separate manifest
  secret would be missing from that set whenever a key's contents change but
  the file list doesn't, leaving nowhere to look up the destination path.
- Files are selected by sniffing contents, not by filename: anything holding a
  `PRIVATE KEY` block or an `ssh-*`/`ecdsa-*`/`sk-*` public key line, plus
  `config`, `config.d/*` and `allowed_signers`. `known_hosts` and
  `authorized_keys` are host-specific and access-granting, so they are only
  included when named with `--include`.
- Both directions hold back anything that would **overwrite a file that already
  differs**, and say what they skipped; `--force` opts into the overwrite. A
  restore onto a machine with its own keys is otherwise a way to lose them.
- Restores recreate the directory `0700` and chmod each file back to its
  recorded mode — `writeFileSync`'s mode applies only on create, so an existing
  world-readable key would otherwise stay world-readable.
- The adapter declares `delete: false`. Removing a local key you still need is
  unrecoverable from here, so deletions are reported and refused, never applied.
- `push` warns when a private key has **no passphrase**. It stays end-to-end
  encrypted in the vault, but everyone granted that vault gets a ready-to-use
  key.

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

# Link a checkout once, then use the short workflow from that directory.
# With no arguments, link interactively selects team → project → environment.
logicsrc secrets teams link
logicsrc secrets up                 # push .env to the linked default environment
logicsrc secrets down               # pull the linked default environment
logicsrc secrets down staging       # pull another env in the linked project

# Inspect / manage
logicsrc teams list
logicsrc teams members acme
logicsrc teams vaults acme
```

`secrets up` and `secrets down` require an explicit directory link and fail
before doing any network or `.env` operation when one is missing. For
automation, write the link explicitly with
`logicsrc secrets teams link acme web prod`. Links contain only the resolved
directory path and team/project/environment names; they live in the user's
LogicSRC config directory, never in the project and never contain secret values.

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
