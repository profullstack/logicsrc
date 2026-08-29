# OpenCreds conformance

An implementation claims conformance by satisfying the requirements below and
passing the fixture suite. Run it with `opencreds conformance`.

## Requirement checklist

### Items

| # | Requirement | Level |
| --- | --- | --- |
| C1 | Reads and writes all six item types with their field groups. | MUST |
| C2 | Stamps `v`, `id`, `type`, `name`, `createdAt`, `updatedAt` on every item. | MUST |
| C3 | Preserves unknown top-level item fields on round trip. | MUST |
| C4 | Distinguishes an empty-string field from an absent one, both directions. | MUST |
| C5 | Caps password history at 20 entries, newest first. | MUST |
| C6 | Rejects a field group that does not match the item's `type`. | MUST |
| C7 | Round-trips attachment references without storing blobs. | SHOULD |

### Crypto

| # | Requirement | Level |
| --- | --- | --- |
| C10 | AES-256-GCM with a fresh 96-bit IV per encryption. | MUST |
| C11 | Binds `<ns>:vault:item:<v>:<id>` as AAD; a swapped ciphertext fails. | MUST |
| C12 | Verifies the decrypted `id` against the envelope `id`. | MUST |
| C13 | Refuses to derive below 100,000 PBKDF2 iterations. | MUST |
| C14 | Derives wrap, auth and recovery keys under distinct HKDF labels. | MUST |
| C15 | Generates the user key randomly; a password change re-wraps, not re-encrypts. | MUST |
| C16 | Returns partial results with a failure list when one item fails to decrypt. | MUST |
| C17 | Rejects an unregistered namespace unless explicitly opted in. | MUST |
| C18 | Refuses a vault whose `profile` it does not implement. | MUST |
| C19 | Supports the `team` profile. | MAY |

### Database

| # | Requirement | Level |
| --- | --- | --- |
| C20 | Writes the encrypted form by default. | MUST |
| C21 | Binds the header as AAD, so the manifest is authenticated. | MUST |
| C22 | Recomputes and verifies `itemCount`, `types`, `folderCount`, `digest`. | MUST |
| C23 | Writes nothing on a manifest mismatch. | MUST |
| C24 | Requires an explicit opt-in for the plaintext form. | MUST |
| C25 | Writes `protected: false` in a plaintext file's header. | MUST |
| C26 | Export → import → export produces byte-identical item records. | MUST |
| C27 | Does not restamp `createdAt` / `updatedAt` on import. | MUST |
| C28 | Reports per-strategy merge outcomes rather than one total. | SHOULD |

### CLI

| # | Requirement | Level |
| --- | --- | --- |
| C30 | Exit codes per [cli.md](./cli.md#exit-codes). | MUST |
| C31 | Never prints a secret value except `get --reveal --field`. | MUST |
| C32 | Masks secrets identically in `--json` output. | MUST |
| C33 | `--dry-run` writes nothing. | MUST |
| C34 | `status` works while locked and reports counts only. | SHOULD |

### Importers

| # | Requirement | Level |
| --- | --- | --- |
| C40 | CSV reader handles quotes, escaped quotes, embedded newlines and commas, CRLF, and a BOM. | MUST |
| C41 | Reports unmappable rows with row number and reason; never drops silently. | MUST |
| C42 | Detects sources most-specific first. | MUST |

## Fixtures

Fixtures live in `packages/opencreds/fixtures/` and are published in the package.

| Fixture | Asserts |
| --- | --- |
| `items/one-of-each.json` | C1, C2 — one valid item per type. |
| `items/unknown-fields.json` | C3 — a v1 item carrying fields from a later version. |
| `items/empty-vs-absent.json` | C4. |
| `items/history-cap.json` | C5 — 25 history entries in, 20 out, newest kept. |
| `items/wrong-group.json` | C6 — a `card` group on a `login` item; must be rejected. |
| `vault/swapped-ciphertext.json` | C11 — two envelopes with ids exchanged; both must fail. |
| `vault/weak-kdf.json` | C13 — `iterations: 1`; must be refused. |
| `vault/one-corrupt-item.json` | C16 — three items, one with a flipped tag byte. |
| `vault/unknown-namespace.json` | C17. |
| `vault/unknown-profile.json` | C18. |
| `database/encrypted.opencreds` | C20–C22 — passphrase `opencreds-fixture`. |
| `database/tampered-manifest.opencreds` | C21 — `itemCount` edited; must fail to decrypt. |
| `database/short-payload.opencreds` | C22 — one item removed from the payload. |
| `database/plaintext.json` | C25 — `protected: false`. |
| `database/roundtrip.json` | C26, C27. |
| `csv/bitwarden.csv`, `csv/onepassword.csv`, `csv/chrome.csv`, `csv/lastpass.csv`, `csv/keepass.csv` | C40–C42. |
| `csv/quoting-torture.csv` | C40 — BOM, CRLF, `""` escapes, a note containing commas and newlines. |

Each fixture is paired with a `.expected.json` describing what a conforming
implementation must produce, so a third party can verify without reading
LogicSRC source.

## Reporting

`opencreds conformance --json` emits:

```json
{
  "type": "opencreds.conformance_report",
  "opencreds": "0.1",
  "implementation": { "name": "@logicsrc/opencreds", "version": "0.1.0" },
  "results": [ { "id": "C11", "level": "MUST", "status": "pass" } ],
  "summary": { "pass": 34, "fail": 0, "skip": 1 },
  "conformant": true
}
```

`conformant` is true only when every MUST passes. A skipped MAY does not affect
it; a skipped MUST does.
