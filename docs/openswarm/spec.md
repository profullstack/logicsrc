# The OpenSwarm Core Specification

Version: **0.1** (draft)
Status: draft. Nothing below is implemented yet. Wire formats are expected to
change before 1.0, and this document says where.

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT and MAY are to be
interpreted as described in RFC 2119.

## 1. Scope

The core defines what every member protocol shares:

1. **Records** (§3): the JSON shape, canonicalisation, identifiers and
   signatures of every object in the family.
2. **Keys** (§4): publisher identities, derived per-file keys, box keys, and
   the rules for reuse, rotation and loss.
3. **Hashing and chunking** (§5): what a content identifier is and why it is
   a BitTorrent v2 merkle root.
4. **Transports** (§6): the BitTorrent wire, the extension protocol, browser
   peers, webseeds, and the optional Moshpit tunnel.
5. **Discovery** (§7): DHT, trackers, Moshpit names.
6. **Events** (§8): the CloudEvents envelope and webhook signing.
7. **Versioning and conformance** (§9, §10).

Member protocols (`ipfile`, `ippay`, `ipdb`, `ipaudio`, `ipvideo`, `iplive`,
`ipname`) add record types and extension messages. They MUST NOT redefine
anything in this document.

## 2. Terminology

| Term | Meaning |
| --- | --- |
| **record** | A signed JSON object with an `openswarm` version and a `type`. |
| **record id** | `sha256:` plus the hex SHA-256 of the record's canonical bytes without `sigs`. |
| **publisher** | The Ed25519 identity that owns files and feeds. |
| **file key** | A per-file Ed25519 pair derived from the publisher key. Its public half is the file's identity. |
| **box key** | An X25519 pair used to receive sealed content keys. Every identity has one. |
| **content key** | 32 random bytes that encrypt one file version's pieces. |
| **swarm** | One BitTorrent swarm carrying one ciphertext payload. |
| **piece** | A BEP 52 piece: a power-of-two length, at least 16 KiB. |
| **block** | 16 KiB, the unit of a BitTorrent `request` and of a v2 merkle leaf. |
| **peer** | Any participant in a swarm. A **seeder** has all pieces, a **leecher** wants some, a **relay** forwards live segments. |
| **gateway** | An HTTP server that serves ciphertext by range (a BEP 19 webseed) and answers catalogue queries. |
| **hub** | The settlement service that sells passes and redeems vouchers. See `ippay`. |
| **pass** | A hub-signed record that lets a peer spend up to a cap on named swarms. |
| **voucher** | A payer-signed cumulative IOU for bytes received from one payee. |
| **grant** | A record carrying a content key sealed to one recipient's box key. |
| **feed** | An `ipdb` log owned by one key. |

## 3. Records

### 3.1 Shape

Every object in the family is a record:

```json
{
  "openswarm": "0.1",
  "type": "ipfile.manifest",
  "createdAt": "2026-09-05T18:00:00.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

| Field | Type | Rule |
| --- | --- | --- |
| `openswarm` | string | Family version the record was written under. `"0.1"`. |
| `type` | string | `<protocol>.<noun>`, lower case. Registered types are listed by each member document. |
| `createdAt` | string | RFC 3339, UTC, millisecond precision. |
| `sigs` | array | One or more signatures (§3.4). MAY be empty only for record types a member document marks as unsigned. |

Every other field is defined by the member document for that `type`. An
implementation reading an unknown field MUST preserve it on round trip.

### 3.2 Canonical form

The canonical bytes of a record are the RFC 8785 (JSON Canonicalization
Scheme) serialisation of the record with the `sigs` member removed. JCS
sorts keys, strips whitespace and fixes number formatting. Amounts and hashes
are strings in this family precisely so that JCS never has to touch a float.

### 3.3 Record id

```
id = "sha256:" + lowercase_hex(SHA-256(canonical bytes))
```

The id is never stored inside the record. A reader computes it. Two records
with the same canonical bytes are the same record, which is what makes `ipdb`
replication idempotent.

### 3.4 Signatures

A signature entry is `{ "alg", "key", "sig" }`. The signed message is:

```
"openswarm:sig:v1:" + type + "\n" + canonical bytes
```

The prefix is domain separation. A signature over an `ipfile.manifest` can
not be replayed as a signature over an `ippay.voucher` with the same body.

| `alg` | `key` prefix | Signature | Status |
| --- | --- | --- | --- |
| `ed25519` | `ed25519:` | 64 bytes, base64 | REQUIRED |
| `mldsa65` | `mldsa65:` | 3309 bytes, base64 | OPTIONAL, for post-quantum ownership |

A record MUST carry at least one `ed25519` signature by the key the member
document names as its signer. It MAY carry an `mldsa65` signature by a key
the same identity has bound (§4.6). A verifier that does not implement
`mldsa65` MUST ignore those entries and MUST NOT treat their presence as an
error.

Key strings are `<alg>:<hex>`. Ed25519 and X25519 public keys are 32 bytes,
so 64 hex characters. ML-DSA-65 public keys are 1952 bytes.

### 3.5 Amounts and times

Money is a decimal string with exactly six fractional digits, in USD:
`"0.002500"`. Six digits is USDC's precision and is what CoinPay's x402
dialect already carries. Integer arithmetic is specified where rounding
matters (`ippay` §4). Times are RFC 3339 UTC. Byte counts are JSON integers
and MUST stay below 2^53.

## 4. Keys

### 4.1 Publisher identity

A publisher identity is a 32-byte seed. From it:

```
publisher signing key  = Ed25519 keypair from seed
publisher box key      = X25519 keypair from HKDF-SHA256(seed, salt = "", info = "openswarm:box:v1")
```

The identity string is `ed25519:<hex of the signing public key>`. The box
public key is published in the records that need it (§4.4).

`ip init` creates one seed. It is reused for every file, feed and channel the
publisher adds. The seed SHOULD be stored as an OpenCreds `key` item with
`keyType: "openswarm-seed"`; it is the one thing in this family that cannot
be regenerated.

### 4.2 Per-file keys are derived, and reusable by default

Adding a file mints a key pair for that file. By default the pair is derived,
not random:

```
fileId     = 16 random bytes, recorded in the manifest as hex
fileSeed   = HKDF-SHA256(ikm = publisher seed, salt = fileId, info = "openswarm:file:v1")
file key   = Ed25519 keypair from fileSeed
file box   = X25519 keypair from HKDF-SHA256(fileSeed, salt = "", info = "openswarm:box:v1")
```

Consequences, all intended:

- Holding the publisher seed and any manifest (which carries `fileId`) is
  enough to recover that file's private key. There is no key database to back
  up beyond the seed.
- Two files never share a key. Compromise of one file seed does not expose
  another, because HKDF output is one-way from the seed.
- The public half is stable across revisions of the file. A re-encode keeps
  the same `fileId`, so it keeps the same identity and the same BEP 46
  pointer (§7.2).

`ip file add --standalone-key` mints a random `fileSeed` instead. The manifest
records `"keyDerivation": "standalone"` so tooling knows the seed must be
backed up on its own. Use it for a file whose ownership will be transferred:
handing over a standalone seed transfers exactly one file.

### 4.3 What each half does

| Half | Used for |
| --- | --- |
| File public key | The file's identity in every reference (`"file": "ed25519:..."`), the BEP 44 key under which the latest manifest is announced, the key peers verify manifests against. |
| File private key | Signs every manifest revision. Signs `ipfile.grant` records that delegate the content key to a keeper. Signs payout changes: the `pricing.payTo` a hub pays a publisher's share to is whatever the latest signed manifest says. |
| File box key | Receives the owner's own sealed copy of the content key (`keys.owner` in the manifest), so the content key is recoverable from the manifest plus the seed. |
| Content key | Encrypts the pieces. Random, 32 bytes, per file version. Never signs anything. |

The file key is not a wallet. It authorises where money goes; the money goes
to an EVM address the manifest names. A seeder's payout address is likewise
its own, registered at the hub against the seeder's identity key (`ippay`
§6). Nothing in this family derives a wallet from a signing key.

### 4.4 Box keys and sealing

Any content key that travels does so inside a sealed box:

```
sealed = X25519 anonymous sealed box (libsodium crypto_box_seal) to the recipient's box public key
```

This is the construction the OpenCreds `team` profile already uses to wrap a
vault key to a member, and it is chosen for the same reason: a seeder can hand
a key to a peer it has never met, given only that peer's box public key from
the `hello` message. When the link is already an MTP/1 session (§6.5) the
box is still applied; the transport protects the link, the box protects the
key at rest in a `grant` record.

### 4.5 Rotation

**Publisher rotation.** Mint a new seed. For each file, publish a manifest
revision signed by the old file key (derived from the old seed) that names
the new `publisher`, and that carries a new `fileId` and a new file key
derived from the new seed in `successor`. Readers that already hold the old
file key follow `successor` once and re-pin. The old seed is kept only to
derive old file keys during the transition.

**File rotation.** Same mechanism for one file: a final revision under the
old file key with `successor` set. A reader MUST NOT follow a `successor`
chain more than 8 deep, and MUST refuse a successor whose own latest manifest
does not name the predecessor in `predecessor`. Both links are required so a
compromised old key cannot redirect a file to an attacker's swarm; the
attacker would also need to sign as the new key.

**Content key rotation.** Re-encrypt under a fresh content key and publish a
new revision with a new `cipherRoot` and new swarm. Old grants stop working
for the new swarm. Rotation is the only way to revoke a key that has been
delivered; a delivered key is held by the peer, and the spec does not pretend
otherwise.

### 4.6 Post-quantum binding

An identity MAY bind an ML-DSA-65 key by publishing an `openswarm.binding`
record signed by both keys:

```json
{
  "openswarm": "0.1",
  "type": "openswarm.binding",
  "subject": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
  "pq": "mldsa65:0f3a51c0a3e6d1e2f4c99b3d3b6a2c5a9f1e8d7c6b5a4f3e2d1c0b9a8f7e6d5c",
  "createdAt": "2026-09-05T18:00:00.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

(`pq` is truncated above for readability; a real value is 1952 bytes of
hex, and the record carries a second entry with `"alg": "mldsa65"` whose
3309-byte signature is omitted here for the same reason.)
This matches the Moshpit registry's `mtp` pin kind, which is an ML-DSA-65
identity. A verifier that trusts the binding accepts an `mldsa65` signature
from `pq` as a signature by `subject`.

### 4.7 Loss

If the publisher seed is lost and no standalone seeds exist:

- Every file's ciphertext stays servable. Seeders hold pieces, not keys.
- Every grant already delivered keeps working.
- No manifest can be revised: prices, payout address, trackers and
  `successor` are frozen at the last signed revision.
- Payouts continue to the frozen `pricing.payTo`.
- No new keeper can be delegated. Existing keepers keep granting.

That is the failure mode, stated so that it can be planned for. Store the
seed in a vault.

## 5. Hashing and chunking

### 5.1 The content identifier

The identifier of a file's bytes is its **BEP 52 pieces root**: the SHA-256
merkle root over 16 KiB leaves, padded per BEP 52. It is written
`sha256:<64 hex>`.

This is chosen over a flat SHA-256 or an IPFS CID because a swarm peer can
verify a single 16 KiB block against it with a merkle proof, which is what
lets a leecher sign a voucher the moment a block arrives. A flat hash would
make every payment wait for the whole file. A CID would be a second tree that
no BitTorrent client checks.

An `ipfile` manifest carries two roots: `plainRoot` over the plaintext and
`cipherRoot` over the ciphertext. The swarm verifies against `cipherRoot`
through the torrent's own hashes; the client verifies its decrypted output
against `plainRoot`.

c0mpute's chunk store addresses objects by blake3 (`c0mpute://blake3:<hex>`).
That stays internal to the node. A c0mpute storage node maps piece index to
blake3 chunk however it likes; what it puts on the wire is verified by SHA-256.

### 5.2 Piece length

A piece length MUST be a power of two and at least 16 KiB (BEP 52). Members
recommend defaults: `ipfile` 1 MiB for files over 64 MiB and 256 KiB below;
`ipaudio` 256 KiB; `ipvideo` 1 MiB; `iplive` one segment per piece.

### 5.3 Hybrid torrents

A swarm's info dictionary MUST be a hybrid v1/v2 torrent per BEP 52: it
carries both `pieces` (SHA-1, v1) and `file tree` with `piece layers`
(SHA-256, v2). Two infohashes result:

- `infohashV1`: SHA-1 of the info dictionary, 20 bytes. This is what
  WebTorrent in a browser uses, and what today's trackers and the bitmagnet
  crawl behind bittorrented.com/dht record.
- `infohashV2`: SHA-256 of the info dictionary, truncated to 20 bytes for
  DHT and tracker use, full 32 bytes in records.

The info dictionary MUST NOT contain plaintext file names. `name` is the
ciphertext root in hex. A crawler that fetches metadata over BEP 9 learns a
size and a hash.

## 6. Transports

### 6.1 The wire

Peer connections are BitTorrent (BEP 3) over TCP, uTP, or WebRTC data
channels (the WebTorrent dialect). Every standard message keeps its meaning.
OpenSwarm never changes `choke`, `unchoke`, `have`, `request`, `piece` or the
bitfield. That is what makes a vanilla client a valid, if unpaid, participant.

### 6.2 Extension messages

All family messages ride on the extension protocol (BEP 10). The extension
handshake advertises:

```
{ "m": { "ipfile": 20, "ipdb": 21, "iplive": 22, "ut_metadata": 3, "ut_pex": 1 },
  "v": "ip/0.1",
  "openswarm": "0.1" }
```

The numbers are local ids chosen by the sender, as BEP 10 requires. The
names are fixed: `ipfile`, `ipdb`, `iplive`. Message payloads are bencoded
dictionaries with a string key `t` naming the message. Records embedded in a
message are carried as their UTF-8 JSON bytes under key `r`, so the bencode
layer never has to understand JSON.

A peer that did not advertise a name MUST NOT be sent that extension's
messages. A peer receiving a message for an extension it advertised but a `t`
it does not know MUST ignore it.

### 6.3 Browser peers

WebTorrent supports BEP 10 extensions via `wire.use()`, and the four wss
trackers bittorrented.com's player already announces to
(`wss://tracker.webtorrent.dev`, `wss://tracker.openwebtorrent.com` are the
two that handshake today) find WebRTC peers. A browser peer signs vouchers
with WebCrypto Ed25519 and seals with X25519 from the same API. Nothing in
this family requires a native binary in a browser.

A browser can only reach WebRTC peers. A swarm that wants browser reach MUST
have at least one hybrid peer (a native seeder that also announces to a wss
tracker), which is what media-streamer's `StreamingService` already is.

### 6.4 Webseeds and gateways

A gateway is a BEP 19 webseed: it serves ciphertext by HTTP range under the
URL the manifest lists. A gateway MAY require a pass (`Authorization: Bearer`
with the pass's `token`) and MAY require vouchers in a request header
(`ippay` §7). A gateway that requires neither is a free webseed and is how a
publisher pays for its own distribution instead of charging for it.

### 6.5 Moshpit tunnel

Between two native peers that both hold Moshpit identities, the BitTorrent
connection MAY be tunnelled through an MTP/1 session
(`@profullstack/moshpit-transport`: X25519 + ML-KEM-768 key agreement,
ML-DSA-65 server identity, ChaCha20-Poly1305 records, TCP). The `hello`
message carries the peer's MTP pin (`base64(SHA-256(SPKI))`) so a peer can
reconnect over the tunnel after meeting on the plain wire. MTP/1 has no
client authentication; ownership on the tunnel is still proved by `hello`
signatures (`ipfile` §5.1), not by the transport.

MTP/1 is TCP only and 64 KiB per record. It is not available to browsers and
it does not replace the swarm wire. It is the confidentiality option for
node-to-node links, and it is the transport the hub API SHOULD be reachable
over in addition to HTTPS.

## 7. Discovery

### 7.1 Peers

A swarm is found the way any torrent is: DHT `get_peers` on `infohashV1` and
on the truncated `infohashV2` (BEP 5), tracker announces (BEP 15, HTTP, and
wss for browsers), PEX (BEP 11), LSD. A manifest lists the trackers it wants.
A manifest MAY set `swarm.private` to true (BEP 27), which disables DHT and
PEX and leaves only trackers and webseeds; that is the choice for a swarm
whose existence should not be public.

### 7.2 Latest manifest by file key

The latest manifest for a file is announced as a BEP 44 mutable item:

```
k    = file public key (32 bytes)
salt = "ipfile"
seq  = manifest rev
v    = bencoded { "ih": <infohashV1, 20 bytes>, "ih2": <infohashV2, 32 bytes>, "m": <manifest record id, 32 bytes> }
```

`v` is 100 bytes, well inside the 1000 byte BEP 44 limit. The item is signed
by the file key, which is why the file key is Ed25519 and why it is the file's
identity. This is BEP 46 with an extra pointer: the magnet form is
`magnet:?xs=urn:btpk:<file key hex>&s=ipfile`.

The manifest itself is fetched from any peer in the swarm over the `ipfile`
`manifest` message, from a gateway at `/swarm/<infohashV2>/manifest`, or from
an `ipdb` replica.

### 7.3 Feeds and names

An `ipdb` feed head is a BEP 44 mutable item under the feed key with salt
`ipdb:<feed name>`. A Moshpit name resolves to a publisher key and a gateway
through `ipname`. A client that starts from a name, a feed, a file key or an
infohash reaches the same manifest.

## 8. Events

### 8.1 Envelope

Every event is a CloudEvents 1.0 envelope, as `@profullstack/autoblog`
already emits:

```json
{
  "specversion": "1.0",
  "id": "7f2b5a7e-2b0e-4c8f-9a4d-3d6c0b9c1e10",
  "type": "com.logicsrc.openswarm.ipfile.voucher.redeemed.v1",
  "source": "https://coinpayportal.com/api/openswarm",
  "subject": "sha256:41d10f45e705e0526c9eeedf62b32dda3daaf552dd9b6a7b09e01776b05813bb",
  "time": "2026-09-05T18:02:11.000Z",
  "datacontenttype": "application/json",
  "data": {
    "record": { "openswarm": "0.1", "type": "ippay.voucher" }
  }
}
```

`type` is `com.logicsrc.openswarm.<protocol>.<noun>.<verb>.v1`. `subject` is
the record id the event is about. `data.record` is the full record where the
event carries one. Each member document registers its types.

### 8.2 Delivery

Webhooks are Standard Webhooks as autoblog signs them: `POST` with
`content-type: application/cloudevents+json`, headers `webhook-id` (the
event id), `webhook-timestamp` (unix seconds) and `webhook-signature`
(`v1,<base64 HMAC-SHA256>` over `<id>.<timestamp>.<body>`), a five minute
tolerance window, retries at 0, 10 and 60 seconds on network error, 5xx, 408
and 429. Receivers verify with a constant-time compare.

## 9. Versioning

- `openswarm` on a record is the family version. A 0.x reader MUST accept
  any 0.x record and MUST preserve unknown fields.
- Each member document has its own version history. Adding a record type,
  a message `t` or a field is additive and does not bump the family version.
- Wire changes that break an existing message get a new `t` name. A message
  name is never redefined, for the same reason an OpenCreds label is never
  edited: peers that shipped it are still running.
- Extension names in the BEP 10 handshake (`ipfile`, `ipdb`, `iplive`) are
  permanent. A breaking revision would ship as `ipfile2`.

## 10. Conformance

A conforming implementation of the core:

1. Reads and writes records per §3, computes ids and verifies `ed25519`
   signatures with the domain prefix.
2. Derives file keys and box keys per §4 from a seed, and produces a manifest
   that a second implementation given the same seed and `fileId` can sign
   identically.
3. Computes BEP 52 pieces roots and builds hybrid torrents per §5.
4. Speaks BEP 10 and ignores unknown `t` values per §6.2.
5. Publishes and reads the BEP 44 pointer per §7.2.
6. Emits events per §8 where it emits events at all.

Member conformance is defined per document; the checklist is collected in
[conformance.md](./conformance.md).

## 11. Registered record types

| Type | Signer | Document |
| --- | --- | --- |
| `openswarm.binding` | subject and pq | this document §4.6 |
| `ipfile.manifest` | file key (and publisher key) | ipfile |
| `ipfile.grant` | grantor | ipfile |
| `ippay.hub` | hub key | ippay |
| `ippay.pass` | hub key | ippay |
| `ippay.voucher` | payer key | ippay |
| `ippay.receipt` | hub key | ippay |
| `ipdb.entry` | feed key | ipdb |
| `ipdb.head` | feed key | ipdb |
| `ipdb.tombstone` | feed key | ipdb |
| `ipaudio.release`, `ipaudio.track` | publisher key | ipaudio |
| `ipvideo.title` | publisher key | ipvideo |
| `iplive.channel`, `iplive.head` | channel key | iplive |
| `ipname.pin` | publisher key | ipname |
| `pay2seed.attestation` | requester key (and file's publisher key for `ipfile` subjects) | pay2seed |
| `pay2seed.offer`, `pay2seed.lease`, `pay2seed.receipt` | hub key | pay2seed |
| `pay2seed.challenge` | verifier key | pay2seed |
| `pay2seed.proof` | seeder key, or verifier key for a probe | pay2seed |
| `pay2seed.notice` | claimant key | pay2seed |

## 12. Version history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-09-05 | Initial draft. Records, derived file keys, BEP 52 identifiers, BEP 10 extensions, BEP 44 pointers, CloudEvents. |
