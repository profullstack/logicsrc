# OpenCreds cryptography

The normative rules are [spec.md §4](./spec.md#4-the-vault). This page explains
why the construction is shaped the way it is, and what an implementer will get
wrong if they skip a step.

## The shape

```
master password
      │  PBKDF2-HMAC-SHA256(salt, iterations)      ← the only expensive step
      ▼
 master key (32 bytes)         never encrypts anything itself
      │
      ├─ HKDF("<ns>:vault:wrap:v1")     → wrap key      → AES-GCM → protected user key
      ├─ HKDF("<ns>:vault:auth:v1")     → auth hash     → server (hashed again there)
      └─ HKDF("<ns>:vault:recovery:v1") → recovery wrap → recovery blob

 user key (32 random bytes)    ← what every item is actually encrypted under
      │
      └─ AES-256-GCM(iv, item JSON, AAD = "<ns>:vault:item:<v>:<id>")
```

## Why the user key is random, not derived

Because a master password change must not be a re-encryption of the vault. The
user key is generated once and wrapped; changing the password re-wraps 32 bytes.
Derive item keys from the password instead and every password change rewrites
every item — which, on a vault of any size, is a long window in which a partial
failure leaves half the vault openable by the old password and half by the new.

It also means the recovery path costs nothing extra: a second wrapping of the
same 32 bytes under a random recovery key, and a forgotten password is
survivable without the server learning anything it did not already hold.

## Why the auth hash cannot decrypt

The wrap key and the auth hash come out of the same master key through HKDF with
*different labels*. HKDF's guarantee is exactly this: outputs under distinct
info strings are computationally independent. A server holding every auth hash
it has ever seen holds nothing that helps it derive a wrap key.

That is what allows the auth hash to be sent at all. A scheme that sent the
wrapping key, or anything from which it could be recovered, would be a scheme
where "the server cannot read the vault" is a promise rather than a property.

## Why the item id is in the AAD

Without it, a ciphertext is portable between rows. Anyone with write access to
the storage — a compromised server, an operator, a leaked backup restored
somewhere writable — could copy the ciphertext of a low-value login into the row
of a high-value one and watch what the user does next. The user unlocks, sees
the credential they expected to see under a name they trust, and uses it.

With the id bound in, that swap fails to decrypt. The tag covers the id, and the
id is not in the ciphertext's control.

The version is in the AAD for the same reason at a different scale: it stops a
v2 record from being replayed as a v1 record once v2 exists.

## Why the KDF floor is a client-side check

KDF parameters are stored with the vault and, in a hosted deployment, are served
to the client at unlock time. That makes them attacker-controlled the moment the
server is compromised. A client that trusts `{"iterations": 1}` performs one
round of PBKDF2, derives an auth hash almost free, and hands an attacker who has
been capturing auth hashes an offline guessing exercise with no work factor at
all.

So the floor is enforced where it matters — in the client, before deriving —
and, in a database-backed deployment, again as a constraint on the column.
Defence in depth on the one value the user cannot see.

## Namespaces

Every label above is prefixed by the vault's declared `namespace`. This is not
decoration. A label is compiled into the additional authenticated data of every
ciphertext a vault has ever written, and into the HKDF derivation of its keys.
Change a label string and every vault in the world that used it becomes
undecryptable — not corrupted, not recoverable, undecryptable.

So labels are append-only in the strongest sense available: superseded by a new
`:v2` label, never edited. And because MarkSyncr's vault shipped with
`marksyncr:vault:*` labels before this specification existed, the prefix is
carried as a per-vault property rather than fixed by the spec. A deployed vault
declares `"namespace": "marksyncr"` and is conformant; a new one uses
`opencreds`.

Registered: `opencreds`, `marksyncr`. Pattern: `^[a-z][a-z0-9-]{1,31}$`.

An implementation MUST reject an unregistered namespace on import unless the
operator opts in, because accepting an arbitrary prefix is accepting an
arbitrary derivation.

## Profiles

### `user`

Everything above. One person, one master password.

### `team`

The vault key is random and is wrapped to each member with `crypto_box_seal`
(X25519 anonymous sealed box) against that member's public key. The server holds
one wrapped key per member and never the key. Granting access is an existing
member unwrapping with their secret key and re-sealing to the new member's public
key — the plaintext key exists only in memory, on a machine that was already
authorized.

`logicsrc credentials` implements this today for `.env` secrets and SSH keys; see
[credential-sharing.md](../credential-sharing.md). OpenCreds adds nothing to it
except the observation that the thing being wrapped can be a vault of items
rather than a bag of strings.

The item envelope is identical under both profiles. That is the whole point: an
item exported from a personal vault imports into a team vault without
re-encoding, because only the key management differed.

**Threat model difference, stated plainly.** In the `team` profile, every member
who holds the vault key can read every item in it. Revoking a member means
rotating the key and re-encrypting, because the key they held is a key they may
have kept. Partial sharing is not a feature of a shared key; it is a second
vault.

## Randomness

Every IV, salt, user key and recovery key MUST come from a cryptographic RNG
(`crypto.getRandomValues`, `crypto.randomBytes`). An IV MUST NOT be reused under
one key — with GCM, a repeated IV under the same key is not a weakness, it is a
break, and it leaks the XOR of two plaintexts along with the authentication
subkey.

Because the user key is per vault and IVs are per write, the safe construction
is simply: generate a fresh 12-byte IV on every single encryption, never derive
it, never count with it.

## What is not covered

- **Key stretching for the export passphrase** uses the same PBKDF2 parameters
  as a vault. An export passphrase is typed once and often weaker than a master
  password; an implementation SHOULD say so rather than silently accepting four
  characters.
- **Memory hygiene.** Zeroing key material after use is out of scope for the
  format and worth doing anyway where the runtime allows it. In a browser it
  mostly does not.
- **Side channels.** Comparisons of secret-derived values (auth hashes, tags)
  MUST be constant-time. Everything else in the format compares public data.
