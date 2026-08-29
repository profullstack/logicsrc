# The OpenCreds item model

One record, six types, one field group each. This page specifies the groups
field by field. The record shape around them is [spec.md §3](./spec.md#3-the-item).

Every field in every group is a string unless stated otherwise, and every field
is OPTIONAL with an empty string as its default. A vault holds half-filled
records — someone knows the card number and not the issuing bank — and a model
that requires fields produces importers that invent them.

## login (code 1)

| Field | Type | Notes |
| --- | --- | --- |
| `username` | string | |
| `password` | string | |
| `totp` | string | An `otpauth://` URI, or a bare base32 seed. Store the URI where you have it: it carries the algorithm, digits and period, and a bare seed loses them. |
| `uris` | array | Matching URIs, see below. |

```json
{ "uri": "https://github.com", "match": "domain" }
```

`match` MUST be one of `domain`, `host`, `startsWith`, `exact`, `regex`, or
`never`. It is carried so that a move does not silently widen where a credential
will be offered; an implementation that does not autofill still round-trips it.

`login` is the only type with `history` ([spec.md §3.5](./spec.md#35-password-history)).

## card (code 2)

| Field | Notes |
| --- | --- |
| `cardholderName` | |
| `brand` | `Visa`, `Mastercard`, `Amex`, … Free text; issuers add brands. |
| `number` | Full PAN. |
| `expMonth` | `1`–`12`, no leading zero required. |
| `expYear` | Four digits. Two-digit years from an import are expanded to 20xx. |
| `code` | CVV/CVC. |

## identity (code 3)

| Field | Notes |
| --- | --- |
| `title` | Mr, Ms, Dr, … |
| `firstName`, `middleName`, `lastName` | |
| `username` | An identity's handle, distinct from a login's. |
| `company` | |
| `email`, `phone` | |
| `address1`, `address2`, `address3` | |
| `city`, `state`, `postalCode`, `country` | |
| `ssn` | National identity number. Named `ssn` for import compatibility; it is not US-specific. |
| `passportNumber` | |
| `licenseNumber` | |

## note (code 4)

No field group. The content is the record's `notes` field. A `note` item that
also carries custom `fields` is valid and common — it is how people store the
things a vault has no type for.

## key (code 5)

Introduced by OpenCreds. Covers SSH keys, PGP keys, API tokens, certificates,
and the `.env` secrets that `logicsrc credentials` synchronizes.

| Field | Notes |
| --- | --- |
| `keyType` | One of `ssh`, `pgp`, `api`, `symmetric`, `certificate`, `env`. |
| `algorithm` | `ed25519`, `rsa-4096`, `ecdsa-p256`, … |
| `publicKey` | Armoured/OpenSSH public key text. |
| `privateKey` | Armoured/PEM private key text. |
| `passphrase` | The private key's own passphrase, where it has one. |
| `fingerprint` | `SHA256:…` — a public, non-secret identifier. |
| `value` | The secret for key types that are one opaque string (`api`, `env`, `symmetric`). |
| `path` | Where the key belongs on disk, e.g. `~/.ssh/id_ed25519`. |
| `mode` | POSIX mode as an octal string, e.g. `"0600"`. |
| `expiresAt` | RFC 3339, where the key expires. |

`path` and `mode` exist so a restore is total: a private key written back with
the wrong mode is a key `ssh` will refuse to use, and a key written to the wrong
path is a key nothing finds. They carry the same information as the
self-describing envelope the `ssh` credential provider already writes.

An `.env` secret becomes `{ "keyType": "env", "value": "…" }` with the variable
name as the item `name`. That is the bridge between the two specs: Credential
Sharing moves a key/value pair between providers, OpenCreds is what it looks
like when stored.

## account (code 6)

Introduced by OpenCreds. A provider account and the tokens that authorize acting
as it — a connected Google account, a social account, a service account.

| Field | Notes |
| --- | --- |
| `provider` | `google`, `github`, `x`, `stripe`, … An OpenOntology entity id where one is in use. |
| `accountId` | The provider's own id for the account. |
| `handle` | The username or handle at that provider. |
| `email` | |
| `accessToken` | |
| `refreshToken` | |
| `tokenType` | `bearer`, … |
| `scopes` | Array of strings. |
| `expiresAt` | RFC 3339 expiry of `accessToken`. |
| `environment` | `production`, `sandbox`, … A test key and a live key look identical and are not. |

An `account` is deliberately not a `login`. A login is what a *person* types at
a sign-in form; an account is what a *machine* presents to an API. They expire
differently, they are revoked differently, and conflating them is how a rotated
refresh token ends up in a password history array.

## Folders

A vault MAY carry folders. A folder is `{ "id": "<uuid>", "name": "Work" }` and
is referenced by an item's `folderId`. Folders are flat: a name MAY contain `/`
and an implementation MAY render that as a hierarchy, but the model does not
nest, because every product that nests them disagrees about what a move does.

Folder names are **not** encrypted by the item envelope — they live in the
database payload, which is encrypted as a whole, and in a vault's own storage
they are wherever that implementation puts them. An implementation that stores
folder names in the clear MUST say so; a folder list is a good description of
someone's life.

## Worked examples

A login with history:

```json
{
  "v": 1, "id": "6f1e7b3a-1f4e-4f0f-9a1d-6a2f0b6f8d21", "type": "login",
  "name": "GitHub", "favorite": true, "folderId": null, "notes": "",
  "login": {
    "username": "anthony",
    "password": "correct-horse-battery-staple",
    "totp": "otpauth://totp/GitHub:anthony?secret=JBSWY3DPEHPK3PXP&issuer=GitHub",
    "uris": [{ "uri": "https://github.com", "match": "domain" }]
  },
  "history": [{ "password": "hunter2", "changedAt": "2026-01-04T09:12:00.000Z" }],
  "createdAt": "2025-11-02T10:00:00.000Z",
  "updatedAt": "2026-01-04T09:12:00.000Z"
}
```

An SSH deploy key:

```json
{
  "v": 1, "id": "0c0f7a2e-9d1a-4f6e-b2b7-1f3d5a7c9e11", "type": "key",
  "name": "deploy@railway", "notes": "Rotated quarterly",
  "key": {
    "keyType": "ssh", "algorithm": "ed25519",
    "publicKey": "ssh-ed25519 AAAAC3Nza… deploy@railway",
    "privateKey": "<the armoured private key body>",
    "passphrase": "", "fingerprint": "SHA256:9Vt…",
    "path": "~/.ssh/id_ed25519_railway", "mode": "0600", "expiresAt": ""
  },
  "createdAt": "2026-03-01T00:00:00.000Z",
  "updatedAt": "2026-06-01T00:00:00.000Z"
}
```

A connected account:

```json
{
  "v": 1, "id": "3a8c1d55-77e2-4b0a-9d3c-2b6e5f8a1c04", "type": "account",
  "name": "Stripe (live)",
  "account": {
    "provider": "stripe", "accountId": "acct_1P…", "handle": "profullstack",
    "email": "billing@profullstack.com",
    "accessToken": "<access token>", "refreshToken": "", "tokenType": "bearer",
    "scopes": ["charges:write", "customers:read"],
    "expiresAt": "", "environment": "production"
  },
  "createdAt": "2026-02-14T00:00:00.000Z",
  "updatedAt": "2026-02-14T00:00:00.000Z"
}
```
