---
openprd: "0.2"
id: "0004"
title: "Add the LogicSRC OpenCreds specification"
status: Draft
authors:
  - anthony@profullstack.com
created: 2026-08-29
updated: 2026-08-29
repo: profullstack/logicsrc
discussion:
implementation:
tags:
  - opencreds
  - credentials
  - vault
  - encryption
  - portability
  - schemas
supersedes:
superseded-by:
---

## Problem

A password manager is the one application a person is least able to leave. The
vault holds logins, cards, identity documents, private keys and the tokens that
authorize machines to act — and every product stores them in a shape only that
product can read. Leaving means an export, and the export is a CSV.

The CSV is the whole problem in one file. It is plaintext by construction, so
the act of moving a vault is the act of writing every secret it contains to disk
unencrypted. It is lossy: password history, TOTP seeds, folder structure, custom
fields and attachments have nowhere to go. It disagrees with itself between
products, and between versions of the same product, so each importer is a pile
of column guesses that silently drops whatever it does not recognise. And it
carries no integrity: nothing in a CSV says which rows were meant to be there,
so a truncated import looks exactly like a complete one.

Underneath that, the same gap shows up inside LogicSRC. `logicsrc credentials`
already moves `.env` secrets and SSH keys through end-to-end-encrypted team
vaults, but it can only model a **key/value pair**. A credit card, a passport, a
login with a TOTP seed and three matching URIs, or an OAuth account with a
refresh token and a scope list are all things people already keep in a vault,
and none of them are a key/value pair. Two Profullstack products — LogicSRC and
MarkSyncr — grew vaults independently and ended up with two item models, two
crypto envelopes, and no way to move a vault between them.

What is missing is an open, versioned description of **what a credential record
is, how a vault is encrypted, and what a portable vault file looks like** — so
that moving a vault is a supported operation rather than a plaintext export.

## Goals

- A person can move an entire vault between two conforming implementations
  without a single secret ever being written to disk in plaintext.
- One item model covers what people actually store: logins, cards, identities,
  notes, keys and accounts — not key/value pairs plus a comment field.
- An export is lossless and self-describing: password history, TOTP seeds,
  folders, custom fields, URI match rules and provenance survive the round trip,
  and whatever an importer could not understand is reported rather than dropped.
- An import can be verified before it is trusted: item counts and a digest are
  covered by the same authentication tag as the data.
- LogicSRC and MarkSyncr vaults become functionally identical — the same item
  types, the same envelope, the same file — with each product's own storage and
  UI on top.
- A third-party implementation can conform from the published schemas and
  fixtures without reading LogicSRC source.
- Existing vaults stay readable. A deployed vault's domain-separation labels are
  baked into its ciphertext and cannot be edited, so the spec carries them as a
  declared property rather than pretending every vault in the world started
  today.

## Non-Goals

- Not a hosted service. A conforming vault is a file plus a key; nothing in the
  spec requires an account, a server, or a network call.
- Not a sync protocol. How two devices reconcile is left to the implementation;
  OpenCreds defines the record and the file, not the transport.
- Not a new cipher. The spec composes PBKDF2, HKDF and AES-GCM — all available
  in WebCrypto — rather than inventing anything.
- Not a browser autofill standard. URI match rules are carried so they survive a
  move; how a client fills a form is out of scope.
- Not an attempt to hide vault size. Item type and count are deliberately
  observable by a storage server; see the security notes.

## Users

- **A person leaving a password manager.** Wants their vault out, intact, and
  not in a spreadsheet.
- **A team sharing infrastructure credentials.** Already uses `logicsrc
  credentials`; needs to keep a card, a signing key and a service account in the
  same vault as the `.env` secrets.
- **An implementer** building a vault who wants interoperability without
  reverse-engineering someone's export.
- **An agent** acting on behalf of a person, which must be able to read one
  scoped item without being handed the vault.

## Requirements

- R1 [P0] Define six item types — `login`, `card`, `identity`, `note`, `key`,
  `account` — each as a named field group inside one record shape, with a
  versioned schema stamped into every record.
- R2 [P0] Define the item envelope: AES-256-GCM over the JSON record, with the
  item id bound as additional authenticated data so a ciphertext cannot be moved
  between rows.
- R3 [P0] Define the key hierarchy: a master password stretched by PBKDF2-SHA256
  (600,000 iterations, floor 100,000), split by HKDF into a wrapping key and an
  auth hash, wrapping a random 256-bit user key. Argon2id is reserved and carried
  in the parameters so it can be adopted without invalidating a vault.
- R4 [P0] Define the portable database: a single JSON file, `.opencreds`, in
  either an encrypted form (default) or a plaintext form that must be explicitly
  requested and is labelled as unprotected in the file itself.
- R5 [P0] The encrypted database authenticates its own manifest — item count,
  type histogram, and a digest over the item ids — so a truncated or tampered
  import fails rather than silently importing less than the file claimed.
- R6 [P0] Publish JSON Schemas for the item, the vault meta, the database, the
  manifest and the audit event under `@logicsrc/schemas`.
- R7 [P0] Ship a reference implementation, `@logicsrc/opencreds`, with a
  conformance suite that runs against published fixtures.
- R8 [P1] Define importers for the CSV exports people actually have — Bitwarden,
  1Password, Chrome, LastPass, KeePass — mapping into the OpenCreds item model,
  with unmapped rows reported.
- R9 [P1] Define the CLI surface (`logicsrc vault …` and standalone `opencreds`)
  as a conformance surface: flags, output shapes and exit codes.
- R10 [P1] Carry a per-vault `namespace` for domain-separation labels so an
  existing vault (`marksyncr`) is conformant without re-encrypting, while a new
  vault uses `opencreds`.
- R11 [P1] Define two key-management profiles over one envelope: `user` (a
  password-derived key) and `team` (a vault key sealed to each member's public
  key, as `logicsrc credentials` already does), so a team vault and a personal
  vault hold the same items.
- R12 [P2] Define attachment references so a file attached to an item has a
  defined shape, even where an implementation does not yet store blobs.
- R13 [P2] Publish the spec at `logicsrc.com/opencreds` with the schemas linked
  from the page.

## UX Notes

Export is a deliberate, two-step act. `opencreds export` writes an encrypted
file and says nothing about the passphrase being optional; producing the
plaintext form requires `--plaintext`, which prints what it is about to do and
refuses without `--yes`. The written file carries `"protected": false` in its
header, so a plaintext database is identifiable without parsing the rest of it.

Import is a preview first. `opencreds import <file> --dry-run` reports the counts
by type, the folders it will create, the duplicates it detected and the rows it
could not map — and only then does an unqualified `import` write. Nothing is
written on a manifest mismatch.

Failure is per-item, not per-file. One unreadable record must not hide the rest
of a vault, so decryption collects failures and returns them alongside whatever
it recovered.

## Success Metrics

- A vault exported from MarkSyncr imports into LogicSRC with byte-identical item
  records, and back again, with no plaintext written at any point.
- The conformance suite passes against both implementations from the same
  fixtures.
- Every CSV importer round-trips its product's own published sample export with
  zero unreported drops.
- A vault created before this spec is readable by a conforming implementation
  without re-encryption.

## Risks & Open Questions

- **Plaintext export exists at all.** It has to — some people are moving *to* a
  product that only reads CSV — and it is the single most dangerous operation in
  the spec. Mitigated by making it explicit, labelled and non-default, not by
  pretending nobody needs it.
- **PBKDF2 is a compromise.** Argon2id is the better answer and needs WASM in a
  browser, which means `wasm-unsafe-eval` in an extension CSP. Carrying the KDF
  parameters per vault is what makes the eventual switch a migration rather than
  a break.
- **Metadata leaks by design.** A storage server learns how many items of each
  type a vault holds. Hiding it costs padding and blind indexes; the spec states
  the leak rather than obscuring it.
- **Two profiles, one envelope.** The `team` profile's threat model differs from
  `user` — anyone holding the vault key reads everything in it. Open question:
  whether per-item re-wrapping is worth specifying for partial sharing, or
  whether that belongs to a separate vault.
- **Attachments are specified before they are stored.** Defining the reference
  shape now avoids an incompatible retrofit; the risk is specifying a shape the
  first real blob store does not fit.
