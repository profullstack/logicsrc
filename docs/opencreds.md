# OpenCreds

Status: 0.1 draft · reference implementation available (`@logicsrc/opencreds`)

Slug: `opencreds`

OpenCreds is a LogicSRC OpenSpec for **credential records and portable vaults**.
It defines what a credential item is, how a vault is encrypted, and what a vault
looks like as a file — so that moving a vault between two products is a
supported operation rather than a plaintext CSV export.

It exists because leaving a password manager currently means writing every
secret you own to disk in the clear, and losing whatever the spreadsheet had no
column for.

- Full specification: [`docs/opencreds/spec.md`](./opencreds/spec.md)
- Item model: [`docs/opencreds/item-model.md`](./opencreds/item-model.md)
- Cryptography: [`docs/opencreds/crypto.md`](./opencreds/crypto.md)
- Portable database: [`docs/opencreds/database.md`](./opencreds/database.md)
- Importing from other products: [`docs/opencreds/interop.md`](./opencreds/interop.md)
- CLI: [`docs/opencreds/cli.md`](./opencreds/cli.md)
- Conformance: [`docs/opencreds/conformance.md`](./opencreds/conformance.md)
- Security model: [`docs/opencreds/security.md`](./opencreds/security.md)
- FAQ: [`docs/opencreds/faq.md`](./opencreds/faq.md)

## What it defines

**One record, six types.** Logins, cards, identities, notes, keys and accounts
are not six features — they are one record with a `type` and a named field
group. Everything the user typed lives inside a single encrypted blob, which is
what makes password history free: it is an array in that blob, encrypted by
construction rather than needing its own protected table.

```json
{
  "v": 1,
  "id": "6f1e7b3a-1f4e-4f0f-9a1d-6a2f0b6f8d21",
  "type": "login",
  "name": "GitHub",
  "folderId": null,
  "notes": "",
  "login": {
    "username": "anthony",
    "password": "…",
    "totp": "otpauth://totp/GitHub:anthony?secret=…",
    "uris": [{ "uri": "https://github.com", "match": "domain" }]
  },
  "history": [],
  "createdAt": "2026-08-29T00:00:00.000Z",
  "updatedAt": "2026-08-29T00:00:00.000Z"
}
```

**One envelope.** AES-256-GCM over that JSON, with the item id bound in as
additional authenticated data. A ciphertext moved from one row to another fails
to decrypt rather than quietly showing the wrong credential — without that,
anyone with database write access could swap a low-value login's ciphertext into
a high-value one and watch what the user does next.

**One key hierarchy.** The master password is stretched once by PBKDF2-SHA256
into a master key, and everything else is derived from it by HKDF with a
distinct label. The only password-derived value that ever reaches a server comes
out of a different label than the wrapping key, so holding it does not help
decrypt anything.

**One file.** A vault exports as a single `.opencreds` JSON document, encrypted
by default, carrying a manifest — item count, type histogram, digest over the
item ids — that is authenticated by the same tag as the data. A truncated
import fails instead of looking like a complete one.

## What it does not define

Sync. Storage. Autofill. A conforming vault is a file and a key; how two devices
reconcile, where the ciphertext lives, and how a browser fills a form are all
left to the implementation.

## Implementations

| Implementation | Profile | Namespace | Notes |
| --- | --- | --- | --- |
| `@logicsrc/opencreds` | `user`, `team` | `opencreds` | Reference implementation; local store and CLI |
| `logicsrc credentials` | `team` | `opencreds` | `.env` secrets and SSH keys as `key` items |
| `@marksyncr/vault` | `user` | `marksyncr` | Pre-dates the spec; conformant via its declared namespace |

MarkSyncr's vault shipped before OpenCreds and has domain-separation labels
baked into every ciphertext already written. Labels cannot be edited — changing
one makes every existing vault undecryptable — so the spec carries the label
prefix as a declared per-vault `namespace` rather than mandating a single
string. See [crypto.md](./opencreds/crypto.md#namespaces).

## Quick start

```bash
# Create a vault (asks for a master password; prints a recovery key once)
logicsrc vault init

# Add items
logicsrc vault add login --name GitHub --username anthony --url https://github.com
logicsrc vault add card --name "Visa ending 4242"
logicsrc vault add key --name "deploy key" --key-type ssh --file ~/.ssh/id_ed25519

# List (never prints secret values)
logicsrc vault list --type login

# Move the vault somewhere else, encrypted
logicsrc vault export --out vault.opencreds
logicsrc vault import vault.opencreds --dry-run

# Import from another product
logicsrc vault import bitwarden-export.csv --source bitwarden --dry-run
```

The same commands ship as the standalone `opencreds` binary, so
`logicsrc vault validate` and `opencreds validate` are the same contract.

## Relationship to the other LogicSRC specs

- **Credential Sharing** ([credential-sharing.md](./credential-sharing.md))
  moves secrets *between providers* — `.env`, Doppler, Railway, GitHub, SSH. It
  models a key/value pair and a sync plan. OpenCreds models the **record** and
  the **vault file**. A `key` item is what a synced `.env` entry becomes when it
  is stored rather than moved.
- **OpenContext** ([opencontext.md](./opencontext.md)) governs what an agent may
  *read*. An agent that resolves a context bundle may be entitled to one
  OpenCreds item and not the vault; the permission decision is OpenContext's,
  the record shape is OpenCreds'.
- **OpenOntology** ([openontology.md](./openontology.md)) names the entities a
  credential belongs to. An `account` item's `provider` is an ontology entity,
  not a free string, where an ontology is in use.
