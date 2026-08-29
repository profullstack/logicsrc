# OpenCreds security model

## What the format protects

An attacker holding **the storage** — the database, its backups, an operator's
console, a restored snapshot — learns:

- how many items a vault holds, and how many of each type;
- when each item was created and last changed;
- the vault's KDF parameters, salt, and wrapped keys;
- folder ids, and folder names in implementations that store them in the clear.

They do not learn any field of any item. The user key is never present in
storage in a form the storage can open.

An attacker holding **the storage and write access** additionally cannot move a
ciphertext between rows: the item id is bound as additional authenticated data,
so a swapped ciphertext fails to decrypt rather than showing the wrong
credential under a trusted name.

An attacker holding **the auth hash** — every one ever sent, in full — cannot
derive the wrapping key. The two come out of the same master key under distinct
HKDF labels.

## What it does not protect

**Metadata.** Item counts by type are visible by design, because the type code
is stored in plaintext so a server can filter and paginate without decrypting.
That means a server learns you hold forty logins and two cards. Hiding it costs
padding and blind indexes and buys less than it appears to; the specification
states the leak rather than obscuring it.

**A weak master password.** PBKDF2 at 600,000 iterations raises the cost of a
guess; it does not make a common password safe. Nothing in the format can.

**A compromised client.** Every value is decrypted somewhere. An attacker who
runs code in the process that holds the user key has the vault, and no format
choice changes that.

**A plaintext export.** It is exactly what it says. See below.

**Deletion.** `deleted_at` is a trash bin, not an erasure. A purge removes the
row; whether it removes the bytes is a property of the storage engine and its
backups, not of this specification.

## Deliberate decisions

### The type code is plaintext

So the server can paginate. The alternative — decrypting every row to answer
"show me page 2 of the logins" — either moves the whole vault to the client on
every read or gives the server a key. Both are worse.

### Key material is base64 text

Where this travels as JSON over an HTTP API, binary round-trips as an escaped
hex string and invites encoding mistakes on exactly the values that must not be
corrupted. Text that is wrong is visibly wrong.

### One item is one blob

Password history, custom fields and attachment keys all live inside the item's
single ciphertext. That makes history encrypted by construction rather than by a
second protected table someone can forget to protect. It costs a full rewrite of
the item on every save, which is why history is capped — an uncapped array grows
the ciphertext without bound.

### One row per item

Not one blob per vault. Two devices editing two *different* passwords at the
same moment must not cost anyone a credential, and with a single blob the later
write silently discards the earlier. Per-item rows with a revision make that a
detectable conflict instead of a silent loss.

### The KDF floor is enforced client-side

Parameters arrive from a server. If the server is compromised, they are
attacker-controlled, and `iterations: 1` turns captured auth hashes into a free
offline attack. The client refuses below its own floor before deriving anything,
and a database-backed implementation SHOULD repeat the constraint in the schema.

## The plaintext export

This is the most dangerous operation in the specification, and it is specified
because the alternative is people writing worse versions of it themselves.

Requirements, restated:

- Never the default.
- An explicit flag, plus a confirmation.
- `"protected": false` in the header so tooling can identify the file.
- Owner-only file mode where the platform has one.
- A warning that says what it means: this file cannot be un-leaked, and every
  password in it should be considered exposed if it is.

An implementation SHOULD offer to delete the file after a successful import
elsewhere, and MUST NOT do so automatically — the person may still need it.

## Threats specific to the `team` profile

Every member holding the vault key reads every item in the vault. This is a
property of a shared symmetric key, not a gap in the implementation.

Consequences worth stating in a product's own docs:

- **Revocation requires rotation.** Removing a member's wrapped key stops them
  fetching new ciphertext. It does not un-know the key they held. A member who
  leaves means a new vault key and a re-encryption of every item.
- **Partial sharing is a second vault.** There is no way to share three items out
  of forty under one key. Split the vault.
- **Granting is a client-side act.** An existing member unwraps and re-seals to
  the new member's public key. The server can add a member to a list; it cannot
  give them access, because it does not have the key. This is a feature, and it
  means a grant requires an authorized member to be online.

## Reporting

Security issues in the specification or the reference implementation:
`security@profullstack.com`, or the security policy published at
`logicsrc.com/.well-known/security.txt`.
