# Keyring

`logicsrc keyring` keeps SSH keys and other public/private key pairs (GPG, age,
any generic pair) **end-to-end encrypted**. It works entirely on one machine with
no account. Turn on sync and the account at app.logicsrc.com holds a copy, but
only as ciphertext. You can then restore a key onto a new machine with one
command.

The keyring exists because private keys kept in plaintext, in a repo or a backup,
are one leak away from a compromise. The keyring makes the safe path the easy one.
Keys are sealed on your machine and synced as ciphertext. Restoring puts them back
under their default file names with the right permissions.

## Quick start

```sh
curl -fsSL https://logicsrc.com/install.sh | sh     # or: logicsrc update

# Import your key (and its .pub). You pick a keyring passphrase the first time
# and get a one-time recovery key: store it offline.
logicsrc keyring add ~/.ssh/id_ed25519

# Optional: sync the ciphertext to your account.
logicsrc login
logicsrc keyring sync

# On a new machine:
logicsrc login
logicsrc keyring sync
logicsrc keyring restore id_ed25519      # ~/.ssh/id_ed25519 (600) + id_ed25519.pub (644)
ssh-keygen -lf ~/.ssh/id_ed25519         # compare with: logicsrc keyring show id_ed25519
```

## Commands

| Command | What it does |
| --- | --- |
| `keyring init [--cloud]` | Create the keyring. Asks for a passphrase and prints a one-time recovery key. `add` and `gen` call this for you. |
| `keyring add <file> [--name n] [--pub f] [--type t] [--sync]` | Import a private key file and its `.pub`. If there is no `.pub`, the public half is derived with `ssh-keygen -y`, or read from an age identity's comment. |
| `keyring gen <name> [--type ed25519\|rsa\|ecdsa]` | Generate a pair straight into the keyring. Nothing is written to `~/.ssh` until you `restore`. |
| `keyring list` | Name, type, fingerprint, comment. Needs no passphrase. |
| `keyring show <name>` | Public key and fingerprint. `--print-private` also prints the private key (it asks for the passphrase). |
| `keyring restore <name> [--to dir] [--force]` | Decrypt and write the key under its **default file name**. |
| `keyring export --pub [names…]` | `authorized_keys` lines (public keys only). |
| `keyring rm <name> [--sync]` | Remove a key. The removal reaches your other machines on their next sync. |
| `keyring sync [--use-remote\|--use-local\|--off]` | Turn on cloud sync and exchange ciphertext with your account. |
| `keyring status` | Where the keyring lives, how many keys it holds, and whether sync is on. |

For non-interactive use, set `LOGICSRC_KEYRING_PASSPHRASE` or pipe the passphrase
on stdin. `--recovery-key <key>` unlocks with the recovery key instead.
(`logicsrc keys` is a different command: it manages API keys.)

### Restore rules

- The private key is written `0600` and the public key `0644`. A directory created by `restore` is `0700`.
- If an identical file is already there, nothing is written.
- If a **different** key is already at that path, restore refuses and writes nothing. With `--force`, it copies the existing file to `<file>.bak-<time>` first and then replaces it.
- Keys go back under the file name they were imported from (`id_ed25519`). Restore never invents a new name.
- The private key is never printed unless you pass `--print-private`.

## How it is encrypted

The keyring uses no new cryptography. It is an [OpenCreds](https://logicsrc.com/opencreds)
`user`-profile vault, the same scheme as `logicsrc vault`:

- A random 256-bit **user key** is wrapped under your passphrase. The passphrase is
  stretched with PBKDF2-HMAC-SHA256 (600,000 iterations), then HKDF splits out a
  wrap key. The keyring also stores a copy of the user key wrapped under a
  **recovery key**, which is shown once when the keyring is created.
- Each private key is an OpenCreds `key` item encrypted with **AES-256-GCM** under
  the user key. The item id is bound in as additional authenticated data, so an
  envelope cannot be moved onto another entry.
- These stay readable on purpose, because they are not secret: the name, type,
  file name, **public key**, fingerprint and comment. That is why `list`, `show`
  and `export --pub` need no passphrase, and why the web page can show them.

Locally the keyring lives in `~/.config/logicsrc/keyring/`, or in
`LOGICSRC_KEYRING_HOME` if that is set. Every file is `0600` and the directory is
`0700`.

## Cloud sync (optional)

Once you run `keyring sync`, every `add`, `gen` and `rm` on that machine pushes
the change. A `list` pulls first. Merging is last-writer-wins per key, and a
removal travels as a tombstone. If the machine and the account hold two different
keyrings (two separate `init`s), sync refuses to merge them. Pick one:
`--use-remote` moves the local keyring to a `.bak` directory, and `--use-local`
replaces the account's copy.

The server stores only the wrapped meta, plus for each key its public half and
its envelope. It refuses any upload that contains private key material in any
field, including a "ciphertext" that is just a base64-encoded PEM key. Machine
API keys cannot reach the keyring. It belongs to the person.

### API

All endpoints take `Authorization: Bearer lsk_…` (a person's key). A signed-in
browser session can read.

| Method | Path | |
| --- | --- | --- |
| GET | `/api/keyring` | `{ meta, entries }`: public halves. Add `?include=envelopes` to get the ciphertext and tombstones too. |
| GET | `/api/keyring/entries/:idOrName` | One entry (public half). |
| PUT | `/api/keyring/meta` | `{ meta }`. Creates the account keyring. A different keyring gets `409`. |
| PUT | `/api/keyring/entries/:id` | `{ entry }`: a sealed entry. Last writer wins (`409` returns the newer one). Plaintext is refused with `422`. |
| DELETE | `/api/keyring/entries/:idOrName` | Leaves a tombstone. |
| DELETE | `/api/keyring` | Drops the account keyring (`sync --use-local`). |

### Web

[app.logicsrc.com/keyring](https://app.logicsrc.com/keyring) lists your keys:
name, type, fingerprint and public key, with a copy button. **Decrypt &
download** asks for the keyring passphrase and decrypts the key in the browser
tab with WebCrypto, using the same derivation as the CLI. Neither the passphrase
nor the private key is sent anywhere.

### MCP

`logicsrc mcp` (with `LOGICSRC_API_KEY`) adds these tools:

- `list_keyring_keys`
- `show_keyring_key`
- `export_authorized_keys`
- `add_keyring_key_ciphertext` (takes an already-sealed entry and refuses plaintext)
- `remove_keyring_key`
- `keyring_restore_instructions`

None of them return a private key. Restoring needs the passphrase, which an agent
never holds, so the restore tool returns the commands for the person to run.
