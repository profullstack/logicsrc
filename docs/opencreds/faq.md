# OpenCreds FAQ

### Why not just use the Bitwarden JSON export?

It is the closest thing that exists, and it is a product's export format rather
than a specification: undocumented, versioned by the product, plaintext-only in
practice, and with no integrity check. OpenCreds keeps the parts that work — the
item-with-a-type-group shape, the type codes — and adds the parts that are
missing: an encrypted form as the default, an authenticated manifest, a declared
crypto construction, published schemas and a conformance suite.

The type codes 1–4 are deliberately the same. Compatibility is cheaper than
elegance.

### Why is there a plaintext form at all?

Because people move *to* products that read nothing else, and a format that
refuses to express that gets worked around with a script that is worse — no
warning, no file mode, no label. Specifying it means it can be made loud: an
explicit flag, a confirmation, `protected: false` in the header, and an owner-only
file mode.

### Why PBKDF2 rather than Argon2id?

Argon2id is better and needs WASM in a browser, which means adding
`wasm-unsafe-eval` to an extension's content security policy. That is a real cost
paid by every user of a product to benefit the KDF. The parameters are carried
per vault specifically so the switch is a migration later rather than a break
now, and `argon2id` is already a registered value.

### Why is `namespace` a property instead of a constant?

Because MarkSyncr's vault shipped first, with `marksyncr:vault:*` labels baked
into the additional authenticated data of every ciphertext it has written.
Changing a label does not migrate a vault; it makes it undecryptable. Carrying
the prefix as data is what lets a deployed vault be conformant without
re-encrypting a single item. New vaults use `opencreds`.

### Why is an `account` not a `login`?

A login is what a person types at a sign-in form. An account is what a machine
presents to an API. They expire differently, they are revoked differently, and
they are rotated by different actors. Conflating them is how a rotated refresh
token ends up in a password history array, and how an expiry date ends up in a
notes field.

### Can I keep `.env` secrets in an OpenCreds vault?

Yes — that is what `key` items with `keyType: "env"` are. The variable name is
the item `name` and the secret is `key.value`. `logicsrc credentials` moves those
values *between providers*; OpenCreds is what one looks like when it is stored
rather than moved.

### Does this replace `logicsrc credentials`?

No. Credential Sharing is a sync spec: providers, plans, diffs, dry runs,
rollback and audit. OpenCreds is a record and a file. They meet at the `key`
item — a synced `.env` entry, stored — and at the `team` profile, which is the
credential-sharing key scheme applied to a vault of items.

### What happens if two devices edit the same item?

The specification does not say, because it does not specify storage. The
reference implementation and both Profullstack products store one row per item
with a monotonic revision, so a client that writes with a stale revision is
rejected rather than overwriting. That is a recommendation, not a requirement.

### Why cap password history at twenty?

The item is one blob, rewritten in full on every save. An uncapped history array
grows that blob without bound, and the growth is invisible until a vault sync
starts timing out. Twenty entries is more history than anyone consults.

### Can I import a vault without the passphrase, just to see what is in it?

You can see the header: version, namespace, export time, generator, and the
manifest — item count, counts by type, folder count. That is enough for a
preview and it is authenticated, so it cannot be lied about. Nothing else is
readable, which is the point.

### Is there a hosted OpenCreds service?

No, and the specification does not describe one. A conforming vault is a file
and a key. Products built on it may be hosted; the standard is not.

### How do I claim conformance?

Run `opencreds conformance` against the published fixtures, pass every MUST, and
say which profile and namespace you implement. The suite is in
`packages/opencreds/fixtures/` and ships in the published package, so nobody has
to read our source to verify their own implementation.
