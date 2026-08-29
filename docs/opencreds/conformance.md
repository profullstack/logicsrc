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

## Running the suite

```bash
opencreds conformance            # a table, one row per requirement
opencreds conformance --json     # the report, for CI
```

Every requirement above with a C-number in the Items, Crypto, Database and
Importers tables is executed. The CLI requirements (C30–C34) are asserted by the
reference implementation's own end-to-end tests, which drive the real binary
through a child process — a masked value that is only masked in the library is
not masked — rather than by this command, which cannot meaningfully check its
own exit codes.

## Fixtures

Fixtures are **generated**, not hand-written:

```bash
opencreds conformance --emit-fixtures ./fixtures
```

A vector produced by an implementation and then verified by it is worth more
than a JSON file someone typed: the typed file drifts silently when the format
moves, and the generated one cannot. Emit them from the reference
implementation and test your own code against exactly what it accepts.

| Path | Holds |
| --- | --- |
| `README.txt` | The fixture passphrase and what each directory is for. |
| `items/one-of-each.json` | One valid item per type — C1, C2. |
| `items/history-cap.json` | 25 changes in, 20 entries out, newest kept — C5. |
| `items/unknown-fields.json` | A v1 item carrying a field from a later version — C3. |
| `vault/meta.json` | Vault metadata; opens with the fixture passphrase. |
| `vault/envelopes.json` | One encrypted envelope per item type. |
| `vault/user-key.txt` | The base64 key those envelopes are under. |
| `database/encrypted.opencreds` | A six-item encrypted database — C20–C22. |
| `database/plaintext.json` | The same vault, unprotected — C25. |
| `invalid/wrong-group.json` | A `card` group on a `login` item — C6. |
| `invalid/weak-kdf.json` | `kdfIterations: 1` — C13. |
| `invalid/unknown-namespace.json` | An unregistered namespace — C17. |
| `invalid/short-payload.json` | A plaintext database missing three items — C22. |
| `invalid/tampered-manifest.opencreds` | An edited `itemCount` — C21. |

Everything under `invalid/` MUST be rejected. The fixture passphrase is
`opencreds-fixture`; the fixture vaults derive at 100,000 iterations so a test
run is not dominated by PBKDF2.

## Reporting

`opencreds conformance --json` emits:

```json
{
  "type": "opencreds.conformance_report",
  "opencreds": "0.1",
  "implementation": { "name": "@logicsrc/opencreds", "version": "0.1.0" },
  "results": [
    { "id": "C11", "level": "MUST", "title": "Binds the item id as AAD, so a swapped ciphertext fails", "status": "pass" }
  ],
  "summary": { "pass": 29, "fail": 0, "skip": 1 },
  "conformant": true
}
```

`conformant` is true only when every MUST passes. A skipped MAY does not affect
it; a skipped or failed MUST does. The command exits 2 when the report is not
conformant, so it can gate CI directly.

The reference implementation reports 29 passed, 0 failed, 1 skipped: the skip is
C19, because key management for the `team` profile lives in
`@logicsrc/plugin-credential-sharing` rather than in this package.
