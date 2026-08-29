# The OpenCreds portable database

Normative rules: [spec.md §5](./spec.md#5-the-portable-database).

A database is a vault as one file. It is what you hand to another product, what
you keep as a backup, and what an implementation reads to import.

## Encrypted by default

```json
{
  "opencreds": "0.1",
  "type": "opencreds.database",
  "protected": true,
  "namespace": "opencreds",
  "exportedAt": "2026-08-29T18:00:00.000Z",
  "generator": { "name": "@logicsrc/opencreds", "version": "0.1.0" },
  "kdf": { "kdf": "pbkdf2-sha256", "iterations": 600000, "salt": "…" },
  "manifest": {
    "itemCount": 42,
    "types": { "login": 38, "card": 2, "key": 1, "account": 1 },
    "folderCount": 3,
    "digest": "…"
  },
  "iv": "…",
  "ciphertext": "…"
}
```

Everything above `iv` is readable without the passphrase, and all of it is
authenticated by the tag on `ciphertext` — the header is the AAD. So the counts
can be shown in a preview before anyone types a passphrase, and they cannot be
lied about.

## The export key is not the vault key

An export is encrypted under a key derived from an **export passphrase**, not
under the vault's user key. A file encrypted under the user key would only open
inside the vault it came from, which is the opposite of portable.

```
export passphrase ─PBKDF2(fresh salt, iterations)─► HKDF("<ns>:database:v1") ─► export key
```

An implementation MAY accept a raw 32-byte key instead, for machine-to-machine
transfer; then `kdf` is absent from the file.

## The manifest is the integrity check

```
digest = base64( SHA-256( item ids, sorted lexicographically, joined by "\n" ) )
```

After decrypting, recompute `itemCount`, `types`, `folderCount` and `digest`.
Any disagreement fails the import.

This is the difference between an import you can trust and a CSV. A CSV that was
truncated at 3,000 rows imports 3,000 rows and reports success. A database that
was truncated does not decrypt at all; one that was edited after decryption
fails its digest. There is no state in which an implementation reports a
complete import of an incomplete file.

## The plaintext form

```json
{
  "opencreds": "0.1",
  "type": "opencreds.database",
  "protected": false,
  "namespace": "opencreds",
  "exportedAt": "…",
  "generator": { … },
  "manifest": { … },
  "folders": [ { "id": "…", "name": "Work" } ],
  "items": [ … ]
}
```

Every secret you own, in a file, in the clear.

It exists because the products people move *to* frequently read nothing else,
and an export format that cannot express "give me the CSV" is an export format
people work around with a script that is worse. So it is specified, and it is
made loud:

- `protected: false` sits in the header, so tooling can identify the file
  without parsing it.
- The CLI requires `--plaintext` and a confirmation.
- The file is written `0600` where the platform has modes.
- The manifest is still present and still verified. Unauthenticated, but it
  still catches a truncated copy or a half-finished edit.

## Merging on import

The spec does not mandate a merge strategy, but it names the three that exist
and what each does to an id:

| Strategy | Behaviour |
| --- | --- |
| `skip` | An incoming item whose id already exists is skipped. The safe default. |
| `replace` | The existing item is overwritten. |
| `duplicate` | The incoming item is given a fresh id and both are kept. |

`duplicate` is the only one that never loses data and the only one that can
double a vault. An implementation SHOULD default to `skip` and SHOULD report the
count of each outcome rather than a single "imported N".

Folder ids collide the same way. An incoming folder whose id exists and whose
name differs is a conflict; the reference implementation keeps the existing
folder and remaps incoming `folderId`s onto it.

## Round-tripping

A conforming export → import → export cycle MUST produce byte-identical item
records. Specifically:

- Unknown top-level item fields survive. An item written by a future version
  passes through an older implementation without losing what it did not
  understand.
- Empty-string fields are not dropped and not invented. `""` and absent are
  distinguishable and both are preserved as they arrived.
- Timestamps are not restamped. `createdAt` and `updatedAt` belong to the item,
  not to the transfer; an importer that touches them destroys the only evidence
  of when a password was last rotated.

The `exportedAt` and `generator` of the *file* do change, of course. They
describe the transfer, which is the one thing that is genuinely new each time.
