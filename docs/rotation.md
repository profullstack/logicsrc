# Rotating secrets

This is the runbook for rotating every key, password and token kept in LogicSRC
team vaults. It covers the whole loop: plan, rotate, propagate to every vault,
redeploy the consumers, verify, and only then revoke the old value. Most of it
is automated. What is not automated is listed here with the exact steps, and
the reason it is left to a person.

No command in this runbook prints a secret value. Plans and reports name keys,
vaults, sites and files, never values.

## The loop

```
plan  ->  mint new  ->  write every vault  ->  rewrite consumers  ->  restart  ->  health check  ->  revoke old
                                     \___________________ any failure: put the old value back everywhere ____/
```

1. **Plan.** `logicsrc teams rotation <team> --format json` lists every distinct
   secret value once, with how it rotates (`method`), who has to do it
   (`owner`), which vaults hold it, and the steps. A value stored in fourteen
   vaults under three different names is one row: rotation is matched by value
   fingerprint, not by key name.
2. **Dry run.** `logicsrc teams rotate-keys <team> [project] [env] [--key K]`
   shows what would happen. Nothing is written without `--approve`.
3. **Rotate.** `--approve` mints the new value. For a provider key the new
   credential is created at the provider first, while the old one still works.
4. **Propagate to vaults.** The new value is written to every vault holding the
   old fingerprint, whatever the key is called there. Companion values move with
   it: a VAPID public key beside its private key, a `DATABASE_URL` that embeds a
   rotated password.
5. **Redeploy consumers.** With `--propagate [root]` (default `~/www`) the CLI
   finds every site whose env files hold the old value, by value, so a renamed
   copy is found too. It backs each file up to `<file>.bak-rotate-<date>`
   (mode 600), rewrites it in place with the same mode, and restarts the site
   with its own `deploy.env` (`docker compose --env-file deploy.env up -d
   --no-build --force-recreate`, or `deploy-app.sh <deployed sha>` when a
   build-time `NEXT_PUBLIC_*` value changed, or the site's own
   `rotate-restart.sh`). Restarts run three at a time through `deploy-gate`.
6. **Verify.** Each site must answer below 500 on its local port and on its
   public URL within three minutes. A site that was already unhealthy before the
   rotation makes the CLI skip that value, so a rotation is never blamed for an
   outage it did not cause.
7. **Revoke.** Only after every consumer is healthy does the CLI revoke the old
   credential at the provider. If anything failed before that point, it writes
   the old value back to every vault, restores every env file from its backup,
   restarts those sites, and deletes the new credential at the provider. The
   result is `rolled-back`, and the old value keeps working.

Rotations that are not automatic come back as `todo` with steps. When you have
rotated one by hand, store it everywhere at once:

```sh
new-value-command | logicsrc teams rotate-keys <team> <project> <env> --key NAME --set-from-stdin --approve
```

## Methods

| method | who makes the new value | automatic |
| --- | --- | --- |
| `random` | the CLI, matching the old value's alphabet and length (min 32) | yes |
| `provider` | a built-in rotator calls the provider's API (below) | yes |
| `ssh-keygen` | the CLI makes an ed25519 pair; you install the public half | value yes, install no |
| `command` | your command prints the new value on stdout | yes, with `--approve` |
| `manual` | a person or agent follows the steps | no |
| `not-secret` | nothing: public config, dropped from the plan | n/a |

Each value can carry its own instructions in an encrypted companion entry,
`__ROTATE__<KEY>`, set with `logicsrc teams rotation-set`. Entries override the
built-in catalog, with one exception: an entry can never make a wallet,
signing or banned-provider key automatic.

Specs can also say `disruptive` (what users notice, such as everyone being
signed out), `never` (never automated), `owner` (`agent` or the account
owner), and `family` (the grouping used below).

## The weekly job

A weekly cron runs:

```sh
logicsrc teams rotate-keys <team> --scheduled --propagate --approve --report <file>
```

`--scheduled` rotates only what is safe to do unattended:

- `random` secrets that are not `disruptive` (cron tokens, internal API keys,
  admin tokens, webhook signing secrets we invented), and
- `provider` rotators whose old and new credentials overlap (Resend,
  Cloudflare tokens, CoinPay API keys),

and only when at least one consumer was found on the box, no more than five
sites read it (`--max-sites`), none of them is excluded (`--exclude-site`;
client sites are never part of a fleet sweep), every consumer was healthy
before, and the value does not also appear in the crontab or a script (those
copies are not rewritten, so they would break).

The job only sees consumers on its own box. A value also used by an app on
another host would break there, which is why the job starts as a dry run and
goes live only when the owner sets `LOGICSRC_ROTATE_LIVE=1`. Read a dry-run
report first: every value it would rotate is listed with the sites it found. Everything else is
listed in the emailed report: what rotated, what was skipped and why, and the
manual list with steps, grouped by who has to do it.

Session signers (`SESSION_SECRET`, `AUTH_SECRET`, `NEXTAUTH_SECRET`,
`*_JWT_SECRET`, `SECRET_KEY_BASE`) are `random` but `disruptive`: rotating one
signs every user out, so they rotate on purpose, not weekly.

## Built-in provider rotators

Every rotator is two-phase: create the new credential, switch everything over,
health-check, then revoke the old one.

### Resend (`resend`)

- Keys: `RESEND_API_KEY`, `RESEND_*_API_KEY`, `RESEND_*_ADMIN_KEY`.
- Mint: `POST https://api.resend.com/api-keys` with the same permission level
  (full access if the old key has it, otherwise sending only). Needs a
  full-access key: the old key itself, or `RESEND_ADMIN_API_KEY`.
- Revoke: `DELETE /api-keys/<id>`. Resend never says which id a token is, so
  the rotator saves the new key's id in `__ROTATE__<KEY>` and revokes by that id
  next time. The first rotation asks you to delete the previous key in the
  dashboard (resend.com/api-keys) and names the one to keep.
- Breaks: nothing, both keys work until the old one is deleted.

### Cloudflare API tokens (`cloudflare-token`)

- Keys: `CLOUDFLARE_API_TOKEN`, `CF_API_TOKEN`, `CLOUDFLARE_*_TOKEN`.
- Mint: `GET /user/tokens/verify` names the old token's id, `GET
  /user/tokens/<id>` reads its policies, `POST /user/tokens` creates a copy
  named `<name> (rotated <date>)` with the same policies, condition and expiry.
  Reading and creating tokens needs "API Tokens Write": set
  `CLOUDFLARE_ADMIN_API_TOKEN`, or give the token that permission.
- Revoke: `DELETE /user/tokens/<old id>`.
- Not covered: account-owned tokens and the Global API Key. Rotate those in the
  dashboard (dash.cloudflare.com/profile/api-tokens).

### CoinPay business API keys (`coinpay-api-key`)

- Keys: `COINPAY_API_KEY`, `COINPAYPORTAL_API_KEY`, `COINPAY_*_API_KEY`,
  `COINPAY_X402_KEY`.
- Needs a merchant session for the business owner: `COINPAY_ROTATE_TOKEN`, or
  `COINPAY_ROTATE_EMAIL` + `COINPAY_ROTATE_PASSWORD`.
- Mint: the old key finds its business (`GET /api/businesses`), then `POST
  /api/businesses/<id>/api-keys` creates a scoped key with the old key's scopes
  (`*` for the legacy key). Old and new both work.
- Revoke: a scoped key is deleted (`DELETE /api/businesses/<id>/api-keys/<key
  id>`); the legacy key is killed by regenerating the legacy slot, and that new
  value is thrown away unread.

### CoinPay webhook secrets (`coinpay-webhook-secret`)

- Keys: `COINPAY_WEBHOOK_SECRET`, `COINPAYPORTAL_WEBHOOK_SECRET`,
  `COINPAY_*_WEBHOOK_SECRET`.
- Mint: `POST /api/businesses/<id>/webhook-secret` (the business is found by
  the secret, using the CoinPay API key in the same vault).
- Breaks: a business has one webhook secret, so there is no overlap. Deliveries
  fail signature checks until the consumer restarts; CoinPay retries them. Not in
  the weekly job.

### Web Push VAPID keys (`vapid`)

- Keys: `VAPID_PRIVATE_KEY`, `VAPID_PRIVATE`. The new public half is written to
  every `*VAPID*PUB*` key beside it.
- Mint: a new P-256 pair, made locally.
- Breaks: every existing push subscription. Browsers must subscribe again, so
  the app has to re-prompt. Not in the weekly job.

### Postgres role passwords (`postgres-role`)

- Keys: `POSTGRES_PASSWORD`, `DB_PASS`, `*_DB_PASSWORD`, when the vault also
  holds a `postgres://` URL with that password (it names the host and role).
- Mint: `ALTER ROLE CURRENT_USER PASSWORD '<SCRAM verifier>'` through `psql`
  over stdin. Only a SCRAM-SHA-256 verifier reaches the server, so the plaintext
  never lands in a server log, and no secret is ever on a command line.
- Every connection string holding the old password is rewritten in the vaults
  and in the env files.
- Breaks: Postgres has one password per role, so consumers fail until they
  restart. Rollback sets the old password back. Not in the weekly job.
- Refused: self-hosted Supabase. Its `POSTGRES_PASSWORD` is shared by six
  service roles (`postgres`, `authenticator`, `pgbouncer`,
  `supabase_auth_admin`, `supabase_functions_admin`, `supabase_storage_admin`)
  and by the stack's own `.env`. See the Supabase section.

## Manual rotations, by family

Every family below is in the catalog, so every key gets steps in the plan. The
`owner` column says who has to do it: `agent` means an agent with dashboard or
CLI access can do it; `owner` means the account owner (money, a signing
ceremony, a personal login behind 2FA).

| family | owner | how |
| --- | --- | --- |
| supabase (JWT secret, anon, service role) | agent | see below |
| turso | agent | `turso db tokens create <db>`; store; redeploy; then `turso db tokens invalidate <db>` (kills every token for that db, so only after all consumers moved) |
| github tokens, OAuth apps | agent | github.com/settings/tokens: new fine-grained token with the same repos and permissions. OAuth app secrets: Generate a new client secret (two can be live), switch, delete the old |
| google | agent | console.cloud.google.com/apis/credentials: new key with the same API restrictions, or Add secret on the OAuth client, then disable the old |
| ai providers | agent | each provider's API keys page (Anthropic console, OpenAI project keys, and so on): create, store, redeploy, delete the old |
| twilio | agent | Console > API keys & tokens: create a secondary auth token, switch, promote it |
| telnyx, porkbun, storage, social, browser stores | agent | the provider's key page named in the plan |
| coinpay OAuth client secrets | agent | our own CoinPay: Developer > OAuth apps > regenerate secret |
| fleet apps (listing keys, agent keys, admin keys) | agent | the issuing app's admin page or API: mint for the same account, store, redeploy, revoke |
| scraped sessions (cookies) | agent | sign in again in the scraping profile, copy the fresh cookie |
| email (SMTP/IMAP) | agent | mailbox host: generate a new alias password |
| data at rest (encryption keys, hashing salts) | agent | dual-read: add the new key next to the old one, re-encrypt or re-hash every row, remove the old key only when every row reads with the new one |
| ssh | agent | the plan mints the pair; install the new public key everywhere the old one was authorized, remove the old one, restore the private key with `logicsrc keyring restore` |
| wallets, treasury, Lightning | owner | never automated: see the wallet section |
| exchanges, ramps, bank links | owner | can move money: new key with the least permissions, 2FA by the owner |
| stripe | owner | not used for new work, never rotated by automation: dashboard Roll key / Roll secret |
| package registries (npm, PyPI) | owner | a person creates a granular automation token |
| github app private keys | owner | App settings > Generate a private key; delete the old one there |
| signing identities (DID, TUF, PLC, CA, GPG) | owner | key ceremony: publish the new public half where verifiers look before switching signers |
| account logins | owner | change the password on the site (2FA), save it in the personal vault |
| personal vault master password, recovery key | owner | `logicsrc vault passwd` at a terminal |

### Supabase

The JWT secret signs every key and every session. Rotating it signs every user
out and re-issues the anon and service_role keys, so it is never weekly.

Self-hosted:

1. Generate a new `JWT_SECRET` (40 or more characters) and mint new anon and
   service_role JWTs from it (Supabase's self-hosting guide has the generator).
2. Write all three to the stack's `.env`, restart the stack with its own env
   file.
3. Store each new value with `--set-from-stdin`: every vault sharing the old
   fingerprint is updated, including copies under other names.
4. Redeploy every app (`--propagate` does the env files for you when you store
   with the CLI).
5. Verify the old anon key now gets 401.

For the database password of a self-hosted stack, change all six service roles
in one transaction (`ALTER ROLE <role> PASSWORD ...` for each), update the
stack's `.env` and every app `DATABASE_URL`, then restart the stack and the
apps. Hosted Supabase: Project settings > Database > Reset password, and
Project settings > API for new keys.

## Wallets and signing keys: why they never auto-rotate, and where they live

A wallet key cannot be rotated the way an API key can. There is no provider to
issue a new one and revoke the old one: "rotating" a wallet means making a new
wallet and moving every balance to it, which is a payment. The catalog marks
every seed, mnemonic, wallet private key, treasury key and Lightning node secret
`never`, and no `__ROTATE__` entry can override that. The plan lists them for
the owner with these steps:

1. Generate a new wallet on a trusted machine, never on a server.
2. Move every balance, tokens and native gas, from the old address to the new
   one. A person signs this.
3. Store the new seed in the place it belongs (below) and update anything that
   pays to or watches the old address.
4. Never reuse the old seed. Assume it is public.

Signing keys (DID keys, TUF roots, certificate authorities, package publisher
keys) are the same: verifiers pin the public half, so a new key has to be
published where they look before the signer switches. That is a key ceremony,
done by a person.

### What went wrong

We learned this the hard way. Plaintext private keys and seed phrases were kept
in a dotfiles repository, and the servers that used encrypted keys also held
the encryption key next to the data. So anyone who got root on one box could
read every key on it. Encryption at rest did not help, because the key to undo
it sat beside the ciphertext.

### What exists now

- **The LogicSRC keyring** (`logicsrc keyring`, see [Keyring](/docs/keyring))
  keeps SSH keys and key pairs end-to-end encrypted. Sync is optional and sends
  only ciphertext: the server refuses anything that looks like private key
  material.
- **The personal vault** (`logicsrc vault`, built on OpenCreds) holds seeds,
  recovery phrases and logins, encrypted on the owner's device and synced as
  ciphertext. Plaintext files with secrets were imported into it and destroyed.
- **The CoinPay operator vault** seals the platform's system keys and deposit
  keys under a passphrase that is derived in the owner's browser. The unlocked
  keys live only in the running process's memory. Root on the box no longer
  opens deposit keys: the files on disk hold ciphertext and placeholders.
- **Team vaults withhold signing keys from scripts.** A pull without a terminal
  does not get mnemonics or wallet keys, and a push refuses a file that holds
  them unless you say so. Sweeping a wallet therefore needs a person at a
  terminal, by design.
- **Wallet keys are never auto-rotated.** Rotation is a new wallet plus a sweep
  by a person, as above.

### What we are building next

This part is a roadmap, not shipped.

- **One intuitive place for wallet and signing keys,** with a plain unlock
  flow, instead of keys spread across the keyring, the personal vault and app
  vaults.
- **A small in-memory keyholder service,** so redeploys stop re-locking vaults.
  Today a restart of a service that holds an unlocked vault (CoinPay, for
  example) locks it again and the owner has to unlock it by hand. A keyholder
  that survives app restarts, and never writes keys to disk, removes that step.
- **Reminders before a vault locks.** A watcher already emails, texts and calls
  the owner before an unlock expires and when a restart has locked it; the
  keyholder will make the "a restart locked it" case go away.

## Never automated

- Wallet keys, seeds, treasury keys, Lightning secrets, exchange and bank-link
  keys: they move money.
- Stripe: not used for new work, rotated only by the account owner.
- npm and other package registry tokens: a person creates them.
- GitHub App private keys and secrets: made in the App settings UI.
- The personal vault's master password and recovery key.
- Signing identities: a key ceremony.

## Safety rules the CLI follows

- Dry run unless `--approve`. `--max <n>` stops after n live rotations.
- Values are never printed, logged or written to a plaintext file. Reports
  (`--report`) are JSON with key names, vaults, sites and outcomes, mode 600.
- Every env file is backed up before it is rewritten.
- A restart never runs `docker compose up` without the site's `deploy.env`.
- At most three restarts at a time.
- A failure after the switch rolls everything back, and the old credential is
  revoked only after every consumer is healthy.

## First run

Start small:

```sh
logicsrc teams rotation <team> --format json > plan.json             # what there is
logicsrc teams rotate-keys <team> <project> prod --key CRON_SECRET --propagate          # dry run
logicsrc teams rotate-keys <team> <project> prod --key CRON_SECRET --propagate --approve
```

Check the site, then widen to `--scheduled` once a couple of single rotations
have gone through cleanly.
