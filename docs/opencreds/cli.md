# The OpenCreds CLI

The CLI is part of the conformance surface: flags, output shapes and exit codes
are specified, not incidental. The same commands ship twice — as
`logicsrc vault …` and as the standalone `opencreds` binary — from one
implementation, so the two can never drift.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success. |
| 1 | Usage error — unknown flag, missing argument, unreadable file. |
| 2 | Validation failure — a document did not conform. |
| 3 | Crypto failure — wrong password, failed tag, manifest mismatch. |
| 4 | Refused — the operation needs a confirmation that was not given. |

## Vault

```bash
opencreds init [--namespace opencreds] [--iterations 600000] [--password-stdin]
```

Creates a vault. Prompts for a master password twice, prints a recovery key
once, and never prints it again. Refuses if a vault already exists at the target
unless `--force`. `--password-stdin` reads one line instead and skips the
confirmation — for scripted provisioning, where there is nobody to mistype.

```bash
opencreds unlock                    # prints a session token to export
opencreds unlock --persist [--timeout 15]
opencreds lock                      # drops a persisted session
opencreds status                    # vault present? locked? counts by type
```

Unlocking has two shapes, and the difference is a flag rather than a default
because it is a real trade:

- **Token (default).** `unlock` prints `export OPENCREDS_SESSION="…"`. Nothing
  touches disk and the session dies with the shell.
- **Persisted (`--persist`).** The same token in a 0600 file with an expiry, so
  a script can unlock once and run many commands. A readable user key on disk is
  the vault; the command says so when you use it, and `lock` removes it.

`status` is the one command that works locked. It reports counts and never
values, because counts are already observable to whoever holds the storage.

```bash
opencreds recover         # unlock with the recovery key, set a new password
```

A password change re-wraps the user key. Not one item is re-encrypted, which is
why it is instant on a vault of any size.

## Items

```bash
opencreds add <type> --name <name> [type flags…]
opencreds list [--type <type>] [--folder <name>] [--search <text>] [--json]
opencreds get <id|name> [--field <path>] [--reveal]
opencreds edit <id|name> [flags…]
opencreds rm <id|name> [--purge]
opencreds restore <id>
```

`list` and `get` MUST NOT print secret values by default. `get` prints the item
with every secret field masked; `--reveal` prints one field named by `--field`,
so revealing is always a deliberate act naming a single value. `--json` output is
masked identically — a pipeline is not an authorization.

Type flags follow the field group names, kebab-cased:
`--username`, `--password`, `--totp`, `--url`,
`--cardholder-name`, `--number`, `--exp-month`, `--exp-year`, `--code`,
`--first-name`, `--last-name`, `--email`, `--phone`, `--address1`, …,
`--key-type`, `--algorithm`, `--public-key`, `--private-key`, `--file`, `--path`, `--mode`,
`--provider`, `--account-id`, `--handle`, `--access-token`, `--refresh-token`, `--scope`.

`--password -` and every other secret flag read from stdin when given `-`, so a
secret need not appear in the shell history or the process list.

## Database

```bash
opencreds export [--out vault.opencreds] [--passphrase-stdin]
opencreds export --plaintext --out vault.json --yes
opencreds export --format bitwarden-csv --out vault.csv --yes

opencreds import <file> [--dry-run] [--merge skip|replace|duplicate]
opencreds import <file> --source bitwarden|onepassword|chrome|lastpass|keepass
```

`export` writes the encrypted form. `--plaintext` prints what it is about to do
and exits 4 without `--yes`.

`import` with `--dry-run` reports counts by type, folders to be created,
duplicates detected and rows that could not be mapped, and writes nothing. A
manifest mismatch exits 3 and writes nothing regardless of flags.

Output of a dry run:

```
opencreds import vault.opencreds --dry-run

  Source      vault.opencreds (opencreds 0.1, encrypted, namespace opencreds)
  Exported    2026-08-29T18:00:00.000Z by @logicsrc/opencreds 0.1.0
  Manifest    verified — 42 items, 3 folders

  login       38    2 already present (skip)
  card         2
  key          1
  account      1

  Folders     Work, Personal (new), Archive
  Skipped     0

  Nothing written. Re-run without --dry-run to import.
```

## Validation

```bash
opencreds validate <file>          # a database, or a plaintext item document
opencreds validate --stdin
```

Exits 0 when the document conforms, 2 when it does not, and prints one diagnostic
per failure with a JSON pointer into the document:

```
/items/17/login/uris/0/match   "fuzzy" is not a valid match rule
/manifest/itemCount            says 42, payload has 41
```

## Conformance

```bash
opencreds conformance [--fixtures <dir>] [--json]
```

Runs the published fixture suite against this implementation and reports each
requirement as pass or fail. An implementation claiming conformance SHOULD run
this in CI.

## What the CLI never does

- It never prints a secret value except through `get --reveal --field`.
- It never writes a plaintext file without an explicit flag and a confirmation.
- It never sends anything anywhere. There is no telemetry, no account, and no
  network call in any command listed on this page.
