# ipfile: Paid, Encrypted File Swarms

Version: **0.1** (draft)
Status: draft. Extends the OpenSwarm core ([spec.md](./spec.md)). Nothing
below is implemented.

## 1. Scope

`ipfile` is BitTorrent with three additions carried as extension messages:

1. **Encryption.** The swarm carries ciphertext. The content key is sold
   separately and delivered only to a peer that has paid.
2. **Payment.** A seeder serves pieces inside a bounded credit window and a
   leecher signs a cumulative voucher for every verified piece batch. Whoever
   seeds gets paid.
3. **Ownership.** Every file has a key pair. The manifest that names the
   swarm, the price and the payout address is signed by it.

It is not a new transport. The wire is BEP 3, the extension is BEP 10, the
hashes are BEP 52, discovery is BEP 5 and BEP 44, browsers are WebTorrent. A
client that knows none of this can still join the swarm and, if the manifest
allows, download ciphertext it cannot read.

### Non-goals

Plaintext swarms (use a torrent). Hiding the size of a file. Hiding that a
swarm exists (use `swarm.private` to keep it off the DHT, but a tracker still
knows). Revoking a delivered key without re-encrypting. Streaming media
semantics (those are `ipaudio`, `ipvideo`, `iplive`).

## 2. Terminology

Core terms apply. In addition:

| Term | Meaning |
| --- | --- |
| **manifest** | The `ipfile.manifest` record: identity, roots, swarm, price, key delivery, policy. |
| **revision** | A manifest with a higher `rev` under the same file key. |
| **keeper** | A peer holding the content key with a `delegate: true` grant, allowed to grant it onward. |
| **credit window** | Bytes a seeder will serve beyond the last voucher before choking. |
| **voucher interval** | Bytes after which a leecher owes a new voucher. |
| **vanilla peer** | A peer that did not advertise `ipfile` in its extension handshake. |

## 3. Data model

### 3.1 The manifest

```json
{
  "openswarm": "0.1",
  "type": "ipfile.manifest",
  "file": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
  "box": "x25519:4c4055604fe6bd8781cab6835093ad896f68f676b472d5bd6811e52f28cb18c3",
  "publisher": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
  "fileId": "165aa20f2088f71a1880fe42c48d211b",
  "keyDerivation": "derived",
  "rev": 1,
  "name": "interview-2026-09-05.flac",
  "size": 734003200,
  "contentType": "audio/flac",
  "pieceLength": 1048576,
  "plainRoot": "sha256:d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff",
  "cipherRoot": "sha256:ba8cd1a97b865a05cdc5840c63b086dd463624a831874c1ba0d7c4ce6f806f7a",
  "cipher": {
    "alg": "aes-256-ctr",
    "keyId": "sha256:41d10f45e705e0526c9eeedf62b32dda3daaf552dd9b6a7b09e01776b05813bb"
  },
  "swarm": {
    "infohashV1": "sha1:a3ce2180413415d7cf4268fb892b8ffd539e8459",
    "infohashV2": "sha256:4b74eb43677e4d03af5fb0856333f9aa21d9a5a3bbf944b13aa7eef379c7a342",
    "private": false,
    "trackers": [
      "wss://tracker.openwebtorrent.com",
      "wss://tracker.webtorrent.dev",
      "udp://tracker.opentrackr.org:1337/announce"
    ],
    "webseeds": [
      "https://gw.c0mpute.com/swarm/4b74eb43677e4d03af5fb0856333f9aa21d9a5a3bbf944b13aa7eef379c7a342/data"
    ]
  },
  "visibility": "public",
  "policy": {
    "vanilla": "ciphertext",
    "creditBytes": 4194304,
    "voucherBytes": 1048576
  },
  "pricing": {
    "currency": "USD",
    "perGib": "0.010000",
    "keyUsd": "0.500000",
    "split": { "publisherBps": 7000, "seederBps": 2500, "hubBps": 500 },
    "keeperBps": 1000,
    "hubs": ["https://coinpayportal.com/api/openswarm"],
    "payTo": { "network": "eip155:8453", "address": "0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5" }
  },
  "keys": {
    "modes": ["peer", "url"],
    "url": "https://keys.example.com/openswarm",
    "keepers": ["ed25519:d2d05fcad07ecbee6ff87c95159ec9969fce6c0fb9f41ff78c2c07ebe8a06c94"],
    "owner": "HjYr1barG9BmJK6DEBSm9Rl8iGeYTZFGwfyG8AJy5g3Wk8uP9nyG1IeDaHuOT/VgYoNMmGvlCnaWw4olY6xM/0GKdzr05DqWt49benOyvAs="
  },
  "replication": { "min": 3, "erasure": { "k": 10, "parity": 4 } },
  "meta": { "duration": 2941.2, "language": "en" },
  "createdAt": "2026-09-05T18:00:00.000Z",
  "updatedAt": "2026-09-05T18:00:00.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    },
    {
      "alg": "ed25519",
      "key": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `file` | The file public key. REQUIRED. The record's first signature MUST be by this key. |
| `box` | The file box public key (core §4.2). REQUIRED. |
| `publisher` | The publisher identity. REQUIRED. A second signature by this key is REQUIRED. |
| `fileId` | 16 bytes hex. REQUIRED. Stable across revisions. |
| `keyDerivation` | `derived` (from the publisher seed, core §4.2) or `standalone`. |
| `rev` | Integer, starts at 1, strictly increasing per file key. |
| `predecessor`, `successor` | File keys, for rotation (core §4.5). OPTIONAL. |
| `name` | Display name. Visible to anyone who obtains the manifest. MAY be empty. |
| `size` | Plaintext byte length. Ciphertext has the same length. |
| `contentType` | Media type of the plaintext. |
| `pieceLength` | Power of two, at least 16384. |
| `plainRoot`, `cipherRoot` | BEP 52 pieces roots (core §5.1). |
| `cipher.alg` | `aes-256-ctr` in this version. |
| `cipher.keyId` | `sha256:` of the content key. Identifies which key a grant carries without revealing it. |
| `swarm.infohashV1`, `swarm.infohashV2` | Of the hybrid torrent whose one file is the ciphertext (core §5.3). |
| `swarm.private` | BEP 27 flag. |
| `swarm.trackers`, `swarm.webseeds` | Announce URLs and BEP 19 URLs. |
| `visibility` | `public`: any peer gets the manifest on request. `pass`: only a peer presenting a valid pass in scope. |
| `policy.vanilla` | `ciphertext`: serve pieces to vanilla peers free. `deny`: choke them. |
| `policy.creditBytes` | Credit window. Default 4194304. |
| `policy.voucherBytes` | Voucher interval. Default 1048576. MUST be at most `creditBytes / 2`. |
| `pricing` | See §7. `keeperBps` is taken from `keyUsd`, the `split` is applied to per-byte vouchers. |
| `keys.modes` | Any of `peer` (a key holder in the swarm grants on request), `url` (an HTTPS key service). |
| `keys.keepers` | Identities delegated to grant. Each MUST hold an `ipfile.grant` with `delegate: true` signed by the file key. |
| `keys.owner` | The content key sealed to `box`. Lets the owner recover the key from seed plus manifest. |
| `keys.public` | OPTIONAL. The content key itself, hex. Set only when the publisher wants anyone to decrypt (a free release, an `ipdb` segment). With it present, `keyUsd` MUST be `0.000000` and no grant is ever needed. |
| `replication` | Publisher's request: at least `min` independent seeders. `erasure` is advice to storage nodes, never a wire format (§9). |
| `meta` | Free-form. Member protocols define what they put here: `ipaudio` sets `meta.track`, `ipvideo` sets `meta.title`, `ipdb` sets `meta.kind` on segment files. |

`bps` values are basis points; the three in `split` MUST sum to 10000.

### 3.2 The grant

A grant carries the content key to one recipient:

```json
{
  "openswarm": "0.1",
  "type": "ipfile.grant",
  "file": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
  "keyId": "sha256:41d10f45e705e0526c9eeedf62b32dda3daaf552dd9b6a7b09e01776b05813bb",
  "grantor": "ed25519:d2d05fcad07ecbee6ff87c95159ec9969fce6c0fb9f41ff78c2c07ebe8a06c94",
  "grantee": "x25519:de3c5a1791131231f797726a59b46b5b877628f0d10ae97fb5f119faa1ad1dc5",
  "pass": "sha256:39655de63a29b02c90b236fa870fe6f8dfad1f52a8119fe4df85e88cd6ab02fd",
  "delegate": false,
  "expiresAt": null,
  "sealed": "KrGWWxD4blHwoh7UmJedgv/CdxWz2J9cbRZpMY+09mm6FT7exyU7KjEAXmWRTLh2Xr8INCGKhv6dpjScKFGCkCrPZDyfAHE2s4E5/VXc2zQ=",
  "createdAt": "2026-09-05T18:01:30.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:d2d05fcad07ecbee6ff87c95159ec9969fce6c0fb9f41ff78c2c07ebe8a06c94",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `grantor` | The file key, or a keeper listed in the manifest. A grant by anyone else is invalid. |
| `grantee` | The recipient's box public key. |
| `pass` | Record id of the pass that paid `keyUsd`. `null` only when `delegate` is true. |
| `delegate` | True makes the grantee a keeper. Only the file key MAY sign a delegating grant. |
| `expiresAt` | Keeper delegation SHOULD expire. A paid grant is perpetual: the peer holds the key. |
| `sealed` | `crypto_box_seal(contentKey, grantee)`, base64. 80 bytes for a 32-byte key. |

A grantee decrypts `sealed` with its box private key and checks
`sha256(key) == keyId` before using it.

## 4. Encryption

### 4.1 Piece encryption

The plaintext is split into pieces of `pieceLength`. Piece `i` is encrypted
independently under AES-256-CTR:

```
iv(i)     = HKDF-SHA256(ikm = contentKey, salt = "", info = "openswarm:ipfile:iv:v1:" + decimal(i), L = 12) || 0x00000000
cipher(i) = AES-256-CTR(contentKey, iv(i), plain(i))
```

The 32-bit counter is big-endian and starts at zero, which is the WebCrypto
`AES-CTR` shape with `length: 32`. A piece is at most 2^32 blocks of 16
bytes, so the counter never wraps below 64 GiB per piece.

CTR is chosen over an AEAD because it is length-preserving and seekable: a
16 KiB block at offset `o` in piece `i` decrypts from counter `o / 16`
without touching the rest of the piece. Integrity does not come from the
cipher. It comes from two merkle trees:

- The swarm verifies every block of ciphertext against `cipherRoot` through
  the torrent's own v2 piece layers. A tampered block is rejected by any
  BitTorrent v2 client before this specification is involved.
- The decrypting client verifies every plaintext piece against the plaintext
  piece layer (§5.6), whose root is `plainRoot` in the signed manifest.

A malleable cipher whose output is pinned by a signed hash tree is not
malleable in practice: any bit flip fails one of the two checks.

### 4.2 The content key

32 random bytes per file version. A new `cipherRoot` MUST use a new content
key; reusing a key across two plaintexts under the same IV derivation would
leak their XOR. The key never leaves a peer except inside a grant's sealed
box, over a key service response, or in `keys.owner`.

## 5. Wire protocol

### 5.1 Extension handshake and `hello`

After the BitTorrent handshake, both peers send the BEP 10 extension
handshake. A peer that supports this specification includes `ipfile` in `m`
and `"openswarm": "0.1"`. Immediately after, it sends `hello`:

```
{ "t": "hello",
  "v": 1,
  "id": <32 bytes, Ed25519 public key>,
  "box": <32 bytes, X25519 public key>,
  "nonce": <16 bytes>,
  "roles": ["seed"],
  "hubs": ["https://coinpayportal.com/api/openswarm"],
  "credit": 4194304,
  "interval": 1048576,
  "mtp": <optional 32 bytes, SHA-256 of the peer's MTP/1 SPKI>,
  "sig": <64 bytes> }
```

`sig` is Ed25519 over:

```
"openswarm:hello:v1" || infohashV2 (32 bytes) || own peer_id (20 bytes) || remote peer_id (20 bytes) || nonce
```

Binding both `peer_id`s and the infohash ties the identity to this
connection in this swarm; a captured `hello` replays nowhere. `roles` is any
of `seed`, `leech`, `keeper`, `gateway`. `credit` and `interval` are the
window and the voucher interval this seeder will apply, which MUST be at
least the manifest's `policy` values.

A peer MUST NOT send any other `ipfile` message before it has sent `hello`
and received a valid one.

### 5.2 Messages

All payloads are bencoded dictionaries. `r` carries a record as UTF-8 JSON.

| `t` | Direction | Payload | Meaning |
| --- | --- | --- | --- |
| `hello` | both | §5.1 | Identity and terms. |
| `manifest_req` | any | `{ "rev": int or absent }` | Ask for the manifest, optionally a specific revision. |
| `manifest` | any | `{ "r": bytes }` | The manifest record. Sent unsolicited by a seeder after `hello` when `visibility` is `public`. |
| `layer_req` | leecher | `{}` | Ask for the plaintext piece layer. |
| `layer` | seeder | `{ "d": bytes }` | 32 bytes per piece, concatenated (§5.6). |
| `pass` | leecher | `{ "r": bytes }` | Present an `ippay.pass`. |
| `credit` | seeder | `{ "unpaid": int, "limit": int, "owed": string }` | Bytes served since the last accepted voucher, the window, and the amount owed. |
| `voucher` | leecher | `{ "r": bytes }` | An `ippay.voucher`. |
| `key_req` | leecher | `{ "keyId": bytes }` | Ask a key holder for a grant. |
| `grant` | key holder | `{ "r": bytes }` | An `ipfile.grant` sealed to the requester's `box`. |
| `deny` | any | `{ "what": string, "reason": string }` | Refuse `pass`, `key_req` or `manifest_req` with a registered reason. |
| `bye` | any | `{ "reason": string }` | About to disconnect. |

Registered `deny` and `bye` reasons: `no-pass`, `pass-invalid`,
`pass-expired`, `pass-scope`, `pass-cap`, `unpaid`, `voucher-invalid`,
`voucher-stale`, `not-keeper`, `no-key`, `visibility`, `rate`, `done`.

### 5.3 The paid session

```
leecher                                   seeder
  |  BT handshake, BEP 10 handshake         |
  |---------------------------------------->|
  |<----------------------------------------|
  |  hello                                  |
  |---------------------------------------->|
  |<------------------------------- hello   |
  |<---------------------------- manifest   |   (public visibility)
  |  pass                                   |
  |---------------------------------------->|   seeder verifies hub signature,
  |<----------------------------- unchoke   |   scope, expiry, cap
  |  request / piece ... (vanilla)          |
  |<=======================================>|   up to `credit` bytes unpaid
  |<------------------------------ credit   |   unpaid >= interval: seeder asks
  |  voucher (cumulative)                   |
  |---------------------------------------->|   seeder verifies, unpaid resets
  |  request / piece ...                    |
  |<=======================================>|
  |  key_req                                |
  |---------------------------------------->|   if seeder is a key holder
  |<------------------------------- grant   |
  |  bye done                               |
  |---------------------------------------->|
```

Rules:

1. A seeder MUST keep a leecher choked until a valid `pass` arrives, unless
   `policy.vanilla` is `ciphertext`, in which case an unpaid peer is treated
   as vanilla (§6) and gets no priority.
2. A seeder MUST NOT serve more than `credit` bytes beyond the bytes covered
   by the last accepted voucher. When the window is full it chokes and sends
   `credit`. It MAY disconnect with `bye unpaid` after 60 seconds choked.
3. A leecher MUST send a voucher when unpaid bytes reach `interval`, and
   only for bytes whose blocks it has verified against the v2 piece layer. A
   voucher is cumulative for this (pass, payee, swarm) triple (`ippay` §4).
4. A seeder MUST verify the voucher's signature, its monotonic `seq`, that
   `bytes` is at least the previous voucher's `bytes`, and that the increase
   does not exceed what it actually served. A voucher that claims more than
   served is accepted for what was served and flagged; one that claims less
   is `voucher-stale` and rejected.
5. A leecher MUST NOT sign a voucher for bytes it has not verified. It MAY
   sign for fewer than it has received; the seeder then chokes sooner. That
   is the only lever a leecher has against a slow seeder, and it costs
   nothing but throughput.
6. Vouchers cover ciphertext bytes. Payment does not depend on the leecher
   ever obtaining the key.

### 5.4 Who may pay and who is paid

The voucher's `payer` is the pass's `payer`. The voucher's `payee` is the
seeder's `hello.id`. A seeder MUST reject a voucher whose `payee` is not its
own identity. The hub pays whoever redeems a voucher signed to them, so an
identity is a payout account. A seeder that wants to be paid registers its
identity and payout address at the hub once (`ippay` §6).

### 5.5 Key delivery

**Peer mode.** Any peer whose `roles` include `keeper`, or that is the file
key itself, answers `key_req`. It MUST verify that the requester's pass is
valid, in scope for this file, and has `grant: true` (meaning `keyUsd` was
paid). It then signs and sends a grant sealed to the requester's `box`. A
keeper MUST report the grant to the hub (`ippay` §5.4) to earn `keeperBps`
and to let the hub mark the pass's grant as consumed; a pass buys one grant
per file.

**URL mode.** `GET <keys.url>/grant?file=<file key hex>&box=<x25519 hex>`
with `Authorization: Bearer <pass token>` returns the grant record as JSON.
Without a pass it returns 402 with an x402 offer for `keyUsd`, so a client
that has no hub relationship can still buy a key directly (`ippay` §3.4).

**Owner recovery.** The owner decrypts `keys.owner` with the file box private
key derived from the seed.

### 5.6 The plaintext piece layer

The plaintext v2 piece layer is the sequence of per-piece SHA-256 merkle
roots (32 bytes each) whose root is `plainRoot`. A seeder holds it because it
had the plaintext or received it with the swarm. A leecher fetches it with
`layer_req` (or from a gateway at `/swarm/<infohashV2>/layer`) and MUST
verify that it hashes to `plainRoot` before trusting a single entry. After
decrypting a piece the leecher checks it against the corresponding entry.
For a 1 GiB file with 1 MiB pieces the layer is 32 KiB.

## 6. Coexistence with vanilla BitTorrent

A vanilla client sees a hybrid torrent with one file named by a hex string.
It can download it if seeders allow. Specifically:

- The extension handshake without `ipfile` marks the peer as vanilla.
- With `policy.vanilla: "ciphertext"`, a seeder treats it as any BitTorrent
  peer: normal choking algorithm, no credit accounting, no payment. It gets
  bytes it cannot decrypt. This is a free choice a publisher makes to widen
  the swarm; vanilla peers that then seed are unpaid redundancy.
- With `policy.vanilla: "deny"`, a seeder keeps it choked and MAY disconnect.
  It still answers `ut_metadata` so the peer can learn it has nothing to gain.
- A vanilla peer never receives an `ipfile` message, because BEP 10 forbids
  sending an extension a peer did not advertise.
- The DHT, trackers and PEX carry infohashes only. A public tracker learns a
  swarm exists and how many peers it has, exactly as today.
- WebTorrent peers are vanilla until the page loads the `ipfile` extension.
  bittorrented.com's player would add it with `wire.use()`.

Encryption of the wire itself (the RC4 "message stream encryption" some
clients offer) is neither required nor relied on. Confidentiality of content
comes from piece encryption; confidentiality of the link, where wanted, comes
from the MTP/1 tunnel (core §6.5).

## 7. Pricing and settlement hook

The manifest's `pricing` is the whole price list:

| Field | Meaning |
| --- | --- |
| `perGib` | USD per GiB of ciphertext served. Vouchers are computed from it (`ippay` §4.2). |
| `keyUsd` | USD for one grant. `0.000000` makes the key free to any pass holder. |
| `split` | Where each voucher's value goes: publisher, the seeder who served, the hub. |
| `keeperBps` | Share of `keyUsd` paid to a keeper that grants. The rest of `keyUsd` goes to the publisher. |
| `hubs` | Hubs the publisher accepts passes from. A seeder MUST reject a pass from a hub not listed. |
| `payTo` | Where the publisher's share is paid. CAIP-2 network and an address. |
| `royalties` | OPTIONAL. A list of `{ "label", "network", "address", "bps" }` summing to 10000 that splits the publisher's share further. `ipaudio` and `ipvideo` records carry the same list; when both exist the manifest's wins, because the manifest is what the file key signed. |

Passes are bought over x402 exactly as `@profullstack/x402-gateway` sells
crawl passes today: a 402 whose body is CoinPay's x402 v2 offer, a proof in
`X-PAYMENT`, verify and settle through CoinPay. `ippay` §3 has the exchange.
A publisher who wants no payment at all sets `perGib` and `keyUsd` to
`0.000000`, and seeders serve for free with vouchers that carry zero; the
accounting still runs so the publisher sees who served what.

## 8. Publishing procedure

`ip file add <path>` does, in order:

1. Load the publisher seed. Generate `fileId`. Derive the file key and file
   box (core §4.2), or generate a standalone seed with `--standalone-key`.
2. Generate the content key. Compute `plainRoot` and the plaintext piece
   layer. Encrypt piece by piece; compute `cipherRoot`.
3. Build the hybrid torrent: one file named by `cipherRoot` hex, `piece
   length` as chosen, `private` per flag, `announce-list` from
   configuration, `url-list` for any gateway. Compute both infohashes.
4. Seal the content key to the file box (`keys.owner`).
5. Write the manifest with `rev: 1`. Sign with the file key, then the
   publisher key.
6. Publish the BEP 44 pointer under the file key (core §7.2).
7. Append an `ipdb.entry` for the manifest to the publisher's default feed
   (`ipdb` §4).
8. Start seeding. Announce to trackers. If any keeper is configured, send it
   a delegating grant.

A revision repeats steps 2 to 7 with `rev + 1` and the same `fileId`. A
metadata-only revision (price, trackers, keepers) skips step 2 and keeps
`cipherRoot`, `keyId` and the swarm.

## 9. Storage and serving on a c0mpute node

A c0mpute storage node stores whatever it likes internally: today that is
blake3-addressed chunks with Reed-Solomon 10 data + 4 parity shards spread
over hosts. On the wire it MUST present whole ciphertext pieces verified
against `cipherRoot`. Erasure coding is a storage policy. `replication.
erasure` in the manifest is the publisher saying what durability it is
paying for in a pin job; it never changes what a peer sends.

A node that holds only shards reconstructs the piece before serving it. A
node advertises `c0mpute:role:storage` and bids on `ipfile.pin` jobs
(`c0mpute.md` §3). Pin income and voucher income are separate: the pin job
pays for holding the bytes for a period, vouchers pay for serving them.

## 10. Retrieval procedure

`ip file get <file key | infohashV2 | ip:// url>`:

1. Resolve to a manifest: BEP 44 `get` under the file key, or `manifest_req`
   from a peer, or a gateway.
2. Verify both signatures. Verify `sha256` of the canonical bytes matches
   any record id the caller supplied.
3. Choose a hub from `pricing.hubs` the client has an account with. Buy or
   reuse a pass in scope (`ippay` §3). Include `grant: true` if the key is
   needed.
4. Join the swarm. For each peer: exchange `hello`, send `pass`, download
   with sequential priority for streaming or rarest-first for bulk, sign
   vouchers on schedule.
5. Fetch and verify the plaintext piece layer. Obtain a grant from a key
   holder or the key URL. Decrypt pieces as they complete; verify each
   against the layer.
6. On completion, verify the whole against `plainRoot`. Send `bye done`.
7. Keep seeding if configured. The client is now a seeder and earns.

## 11. Security notes specific to ipfile

- **Freeloading leecher.** Bounded by `creditBytes`. A seeder loses at most
  one window per leecher identity per session and MAY refuse an identity it
  has seen freeload (`ippay` §5.5 reputation).
- **Freeloading seeder.** Cannot happen: a voucher is only for bytes already
  received and verified. A seeder that stops after being paid was paid for
  what it sent.
- **Voucher inflation.** A seeder cannot forge a voucher; it lacks the
  payer's key. A payer that over-states `bytes` pays more than it must; that
  is its own loss.
- **Double spend across seeders.** A pass has a `capUsd`. A payer could sign
  vouchers to many seeders totalling more than the cap. The hub honours
  redemptions in order until the cap is reached and reports the rest as
  `cap-exceeded`; each seeder's exposure is still one window. A payer that
  does this is reported and its passes are refused (`ippay` §5.5).
- **Content key exposure.** A paying peer holds the key. Any peer can leak
  it. This family prices access, it does not prevent copying. Rotation is the
  remedy for a leaked key going forward, and only forward.
- **Metadata.** Size, piece length and both infohashes are public. `name`
  and `meta` are visible to anyone who obtains the manifest; `visibility:
  "pass"` restricts that to pass holders.
- **Manifest substitution.** The BEP 44 pointer is signed by the file key
  and carries `seq`; a stale pointer is refused by the DHT itself. A
  manifest from a peer is verified against the file key the client started
  from.

## 12. Events

| Type | Emitted by | `data` |
| --- | --- | --- |
| `com.logicsrc.openswarm.ipfile.manifest.published.v1` | publisher | `record` |
| `com.logicsrc.openswarm.ipfile.manifest.revised.v1` | publisher | `record` |
| `com.logicsrc.openswarm.ipfile.grant.issued.v1` | key holder | `record` (with `sealed` removed) |
| `com.logicsrc.openswarm.ipfile.session.closed.v1` | seeder | `{ "swarm", "peer", "bytes", "vouchers", "reason" }` |

## 13. Implementations

| Piece | Exists | Where | What is new |
| --- | --- | --- | --- |
| Hybrid seeder announcing to wss trackers, browser WebTorrent player, range streaming | Yes | `media-streamer` (`src/lib/streaming/streaming.ts`, `src/hooks/use-webtorrent.ts`) | The `ipfile` extension in `wire.use()`, piece decryption in the player |
| DHT observation of infohashes | Yes | `media-streamer/services/dht-search-api` (bitmagnet), `dht-infohash-crawler` | Nothing; an `ipfile` swarm is an opaque infohash to a crawler |
| x402 pass sale and verification | Yes | `x402-gateway`, CoinPay `/api/x402/verify` and `/settle` | Pass scope and vouchers (`ippay`) |
| Content-addressed chunk store, erasure coding, gateway by hash | Yes | `c0mpute` (`c0mpute-store`, `c0mpute-gateway`) | Serving pieces by index verified by SHA-256, the pin workload |
| Sealed box key wrapping | Yes | `logicsrc credentials` team vaults, OpenCreds `team` profile | The grant record |
| Manifest, file key derivation, piece encryption, `hello`, credit window, voucher exchange | No | | All of it |

## 14. Conformance

An `ipfile` implementation:

1. Produces manifests per §3.1 with both signatures and a correct BEP 44
   pointer.
2. Encrypts and decrypts per §4 and verifies against both roots.
3. Speaks every message in §5.2, refuses out-of-order messages per §5.1, and
   enforces §5.3 rules 2 to 5.
4. Treats vanilla peers per §6 according to `policy.vanilla`.
5. Issues grants only against a valid pass or a delegating grant per §5.5.
6. Passes the published fixture swarm end to end: manifest, pass, three
   vouchers, grant, decrypted output matching `plainRoot`.

## 15. Version history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-09-05 | Initial draft. |
