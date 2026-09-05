# iplive: Live Streams over Paid Peers

Version: **0.1** (draft)
Status: draft. Extends the OpenSwarm core ([spec.md](./spec.md)). Reuses
`ipfile`'s encryption, grants and credit window and `ippay`'s passes and
vouchers. Adds one BEP 10 extension, `iplive`. Nothing below is
implemented.

## 1. Scope

`iplive` moves a live stream from one origin to many viewers through peers
that are paid to relay it:

1. A **channel** record: identity, renditions, latency mode, price, relay
   policy.
2. A **head** record: signed every segment, naming the segments that exist
   and the key epoch in force.
3. The **`iplive` extension**: announcing, requesting and fanning out
   encrypted segments with backpressure.
4. **Roles**: origin, relay, viewer, and how a relay is paid.
5. **Recording**: how a finished stream becomes an `ipvideo` title.

### Non-goals

Ingest protocols (RTMP and SRT are the encoder's business; c0mpute's DIP
0019 covers them). Sub-second latency; the floor is one part duration.
Chat. Ads.

## 2. Terminology

| Term | Meaning |
| --- | --- |
| **channel** | A named live source with a key pair derived from the publisher seed. |
| **channel id** | 20 bytes: SHA-256 of `"openswarm:iplive:v1" || channel public key`, truncated. Used where the DHT and trackers want an infohash. |
| **origin** | The peer that encodes, encrypts, signs heads and holds the content key. |
| **relay** | A peer that forwards segments it has verified and is paid per byte. |
| **viewer** | A peer that plays. It MAY also relay. |
| **segment** | One CMAF fragment, 2000 ms by default, encrypted as one unit. |
| **part** | In low-latency mode, a sub-segment chunk (500 ms default) announced before the segment completes. |
| **key epoch** | The span of segments encrypted under one content key. |
| **live edge** | The newest segment the origin has announced. |

## 3. Data model

### 3.1 Channel

The channel key derives like a feed:

```
channelSeed = HKDF-SHA256(ikm = publisher seed, salt = utf8("live:" + name), info = "openswarm:live:v1")
```

```json
{
  "openswarm": "0.1",
  "type": "iplive.channel",
  "channel": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
  "box": "x25519:4c4055604fe6bd8781cab6835093ad896f68f676b472d5bd6811e52f28cb18c3",
  "publisher": "ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e",
  "name": "courtside",
  "title": "Courtside, live",
  "latency": "low",
  "segmentMs": 2000,
  "partMs": 500,
  "epochSegments": 900,
  "dvrSegments": 1800,
  "renditions": [
    { "id": "720p", "codecs": "avc1.64001f,mp4a.40.2", "width": 1280, "height": 720, "frameRate": 30, "bitrateKbps": 2800 },
    { "id": "360p", "codecs": "avc1.64001e,mp4a.40.2", "width": 640, "height": 360, "frameRate": 30, "bitrateKbps": 800 }
  ],
  "swarm": {
    "trackers": ["wss://tracker.openwebtorrent.com", "udp://tracker.opentrackr.org:1337/announce"],
    "private": false
  },
  "relays": { "allow": "any", "maxDownstream": 8, "minRelays": 2 },
  "policy": { "vanilla": "deny", "creditBytes": 8388608, "voucherBytes": 2097152 },
  "pricing": {
    "currency": "USD",
    "perGib": "0.020000",
    "keyUsd": "1.000000",
    "split": { "publisherBps": 6000, "seederBps": 3500, "hubBps": 500 },
    "keeperBps": 0,
    "hubs": ["https://coinpayportal.com/api/openswarm"],
    "payTo": { "network": "eip155:8453", "address": "0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5" }
  },
  "keys": { "modes": ["peer"], "keepers": [] },
  "createdAt": "2026-09-05T20:00:00.000Z",
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
| `channel`, `box` | Channel signing and box keys. Signed by both channel and publisher, as an `ipfile` manifest is. |
| `latency` | `normal`: segments announced when complete. `low`: parts announced as they are encoded. |
| `segmentMs`, `partMs` | 2000 and 500 by default. 4000 is allowed and matches c0mpute DIP 0019. |
| `epochSegments` | Segments per content key. 900 at 2 s is 30 minutes. |
| `dvrSegments` | Segments the origin and relays keep for late joiners and scrubbing. |
| `relays.allow` | `any`, or a list of identities allowed to pull from the origin. |
| `relays.maxDownstream` | Peers one relay will feed at once. |
| `relays.minRelays` | Relays the origin wants before it stops feeding viewers directly. |
| `policy`, `pricing`, `keys` | As `ipfile` §3.1 and §7, with the same fields and meanings. `seederBps` pays relays. |

The record lives in `ipdb` under `channel:<channel key>`.

### 3.2 Head

Signed by the channel key every time a segment (or, in low-latency mode,
a part) is announced:

```json
{
  "openswarm": "0.1",
  "type": "iplive.head",
  "channel": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
  "seq": 4187,
  "prev": "sha256:ba8cd1a97b865a05cdc5840c63b086dd463624a831874c1ba0d7c4ce6f806f7a",
  "epoch": 4,
  "keyId": "sha256:41d10f45e705e0526c9eeedf62b32dda3daaf552dd9b6a7b09e01776b05813bb",
  "live": true,
  "segments": [
    {
      "seq": 4187,
      "t": 8374000,
      "d": 2000,
      "renditions": [
        { "id": "720p", "root": "sha256:d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff", "size": 702113, "parts": [175528, 175530, 175527, 175528] },
        { "id": "360p", "root": "sha256:4b74eb43677e4d03af5fb0856333f9aa21d9a5a3bbf944b13aa7eef379c7a342", "size": 200418, "parts": [50104, 50105, 50104, 50105] }
      ]
    }
  ],
  "init": [
    { "id": "720p", "root": "sha256:c9f17d4eaf2b28122b46d111cef6697d2c3f708a19d4628bce5c0304481b355b", "size": 1524 },
    { "id": "360p", "root": "sha256:00bc9c01ca00938016e276fe5b5748cfe13fd02bc53cc651535682c8dd5c83be", "size": 1498 }
  ],
  "relays": ["ed25519:d2d05fcad07ecbee6ff87c95159ec9969fce6c0fb9f41ff78c2c07ebe8a06c94"],
  "createdAt": "2026-09-05T22:19:34.000Z",
  "sigs": [
    {
      "alg": "ed25519",
      "key": "ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d",
      "sig": "RGRH7pDpXYcagULqj+8z05pLH99Lc6yLmfdbYgtGeRpjX5l0NcT3QSq9AWBtLw+5+JJiKoZ3s4ty74q/zBSE8w=="
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `seq` | Segment number of the live edge. Starts at 1 when the stream starts. |
| `prev` | Id of the previous head, so a viewer can detect a skipped announcement. |
| `epoch`, `keyId` | Which content key encrypts segments from this seq on. A key change is announced one full segment before it applies. |
| `segments` | The newest segment, or the newest few. A head is small: relays fill history from `have`. |
| `segments[].renditions[].root` | BEP 52 pieces root of the segment ciphertext, with the segment as one piece. That is what a relay verifies before forwarding. |
| `segments[].renditions[].parts` | Byte lengths of each part, in order, for low-latency requests. |
| `init` | Roots and sizes of each rendition's init segment, which is not encrypted. |
| `relays` | Identities the origin currently feeds; a viewer prefers these. |
| `live` | `false` in the final head, which marks the end of the stream. |

Heads are not stored in `ipdb`. The final head is, under
`channel:<key>:end:<seq>`, alongside the recording (§8).

### 3.3 Segment encryption

As `ipfile` §4.1, with the segment as a single piece and the IV derived with
`info = "openswarm:iplive:iv:v1:" + decimal(seq)`. The content key changes
each epoch; a grant carries `keyId` and a viewer requests a new grant when
the head announces a new `keyId`. A pass expiring mid-stream stops at the
next epoch, which is why epochs are short.

## 4. Wire protocol

### 4.1 Finding peers

Peers announce the channel id to the DHT (`announce_peer`) and to the
channel's trackers exactly as they would an infohash. Vanilla clients that
see it find a swarm whose `ut_metadata` returns nothing; they leave.
Browsers find WebRTC peers through wss trackers as with any WebTorrent
swarm.

### 4.2 Handshake

The BitTorrent handshake uses the channel id as the infohash. The BEP 10
handshake advertises `iplive`. Both sides send `hello` with the `ipfile`
§5.1 fields (identity, box, nonce, roles, hubs, credit, interval, sig)
where `roles` is any of `origin`, `relay`, `viewer`, and the signature
covers the channel id in place of `infohashV2`.

### 4.3 Messages

| `t` | Payload | Meaning |
| --- | --- | --- |
| `hello` | as `ipfile` | Identity and terms. |
| `channel` | `{ "r": bytes }` | The channel record. Sent by origin and relays after `hello`. |
| `head` | `{ "r": bytes }` | A head record. Forwarded to every downstream peer within 100 ms of receipt. |
| `have` | `{ "from": int, "to": int, "r": [string] }` | Segment range and rendition ids the sender holds. |
| `window` | `{ "buffer": int, "live": int, "down": int, "max": int }` | Segments buffered, live edge, downstream count, `maxDownstream`. Sent after `hello` and whenever it changes. |
| `want` | `{ "seq": int, "r": string, "part": int or absent }` | Request one segment, or one part. |
| `seg` | `{ "seq": int, "r": string, "part": int or absent, "o": int, "d": bytes }` | A 16 KiB chunk of the requested unit at offset `o`. |
| `init` | `{ "r": string, "d": bytes }` | An init segment. |
| `pass`, `credit`, `voucher`, `key_req`, `grant`, `deny`, `bye` | as `ipfile` | Payment and keys, unchanged. |

`seg` chunks are 16 KiB so that a WebRTC data channel and an MTP/1 record
both carry one without fragmentation.

### 4.4 Session

```
viewer                                    relay
  |  hello                                  |
  |---------------------------------------->|
  |<------------------------------- hello   |
  |<----------------------------- channel   |
  |<------------------------------ window   |   buffer=30 live=4187 down=3 max=8
  |  pass                                   |
  |---------------------------------------->|
  |<-------------------------------- head   |   seq 4187
  |<-------------------------------- have   |   4158..4187
  |  want 720p init                         |
  |---------------------------------------->|
  |<-------------------------------- init   |
  |  want 4185 720p                         |
  |---------------------------------------->|
  |<--------------------------------- seg   |   x 43 chunks
  |  want 4186 720p ...                     |
  |  key_req                                |
  |---------------------------------------->|   relay is not a keeper:
  |<-------------------------------- deny   |   not-keeper; ask origin or keys.url
  |  voucher                                |
  |---------------------------------------->|
```

Rules:

1. A viewer starts `segmentMs * 2` behind the live edge in `normal` mode
   and one part behind in `low` mode.
2. A peer MUST NOT `want` a seq below `live - buffer` of the peer it asks.
   If it has fallen further behind it jumps to `live - 1` and discards.
   Stalls are resolved by dropping, never by holding a relay's buffer.
3. A relay forwards a segment only after verifying its ciphertext against
   the `root` in a head signed by the channel key. A relay never needs the
   content key.
4. A relay serving `down >= max` answers new `hello`s with `deny rate` and
   the current `head`, whose `relays` list points elsewhere.
5. Payment is `ipfile` §5.3 rules 2 to 6, with a relay as payee. The
   default window is larger (8 MiB) because a segment is bigger than a
   piece and a choke at the live edge is a stall.
6. Keys come from the origin or a keeper listed in the channel, never from
   a plain relay. A relay MAY be a keeper if the publisher delegates to it.

### 4.5 Low latency

In `low` mode the origin announces a head as soon as the first part of a
segment is encoded, with `parts` filled in as they complete (lengths for
finished parts, `0` for pending). A viewer requests parts by index and
appends them to MSE as they arrive. A part is encrypted as part of the
segment's CTR stream: part `k` begins at counter `offset(k) / 16`, so a
relay can forward parts without waiting for the segment and a viewer can
decrypt them in order. The segment `root` is only known when the segment
completes; a relay in `low` mode forwards parts on the strength of the
signed head naming the part lengths and verifies the root when the last
part lands, disconnecting any upstream whose completed segment fails.

## 5. Roles and payment

| Role | Holds key | Pays | Is paid |
| --- | --- | --- | --- |
| Origin | Yes | Nothing | Publisher share of every voucher, `keyUsd` per grant |
| Relay | No | Vouchers to its upstream for bytes it pulled | Vouchers from downstream for bytes it served |
| Viewer | Yes, after a grant | Vouchers to whoever served it | Vouchers if it also relays |

A relay's margin is `seederBps` of what it serves minus what it pays
upstream. With `perGib = 0.020000`, a relay feeding eight viewers from one
upstream pull earns `8 * 0.35 * 0.02 = 0.056` and pays `0.02` per GiB
pulled, before the hub's share. That is the incentive to relay, and a
c0mpute node bids on `iplive.relay` jobs for the guaranteed floor
(`c0mpute.md` §3).

The origin is a peer that pays nobody; `relays.allow` and `minRelays` are
how it limits its own upload. A publisher who wants more reach than its
relays provide buys pins on c0mpute.

## 6. Publishing procedure

`ip live create courtside --latency low` writes the channel record and
puts it in `ipdb`. `ip live start courtside --input srt://:9000` then:

1. Derives the channel key. Generates epoch 1's content key.
2. Runs the encoder (ffmpeg) producing CMAF segments per rendition, and
   for `low` mode, parts.
3. For each completed unit: encrypts, computes the root, signs a head,
   announces to the DHT and trackers, sends `head` to every connected peer.
4. Answers `key_req` with grants for pass holders.
5. Rotates the content key every `epochSegments`, announcing the new
   `keyId` one segment early.
6. On stop: signs a final head with `live: false`, and if `--record`,
   assembles the recording (§8).

## 7. Viewer procedure

`ip live watch ed25519:<channel key>` or a browser page:

1. Resolve the channel record from `ipdb` or a peer.
2. Buy or reuse a pass scoped to the channel key with `grant: true`.
3. Find peers; prefer identities in the latest head's `relays`; connect to
   two.
4. Get the init segment, the head, a grant. Start at the live edge minus
   the offset in §4.4 rule 1.
5. Pull each segment from the connected peer with the smaller `live - seq`
   lag; on a `deny rate` or a stall over one segment duration, replace the
   peer.
6. Send vouchers on schedule to each peer that served bytes.

## 8. Recording

With `--record`, the origin keeps every segment's plaintext, concatenates
each rendition into one CMAF file, and publishes an `ipvideo.title` whose
segment index is exactly the head history. Because segments were 2 or 4
seconds and keyframe-aligned, the recording is a valid `ipvideo` ladder
with no re-encode. The title's `ipdb` entry references the channel in
`meta.channel` and the final head's id.

## 9. Security and privacy

- **Relays see ciphertext and heads.** They learn segment sizes and
  timing, never content.
- **Head forgery** needs the channel key. A relay forwarding an unsigned or
  wrongly signed head is dropped by every downstream peer.
- **Freeloading** is bounded per `ipfile` §11 with the larger window.
- **Denial by relay count**: an origin with `relays.allow: any` can be
  surrounded by relays that pull and never serve. It pays them nothing (it
  pays nobody) and they earn nothing; the cost is its upload. `maxDownstream`
  on the origin is the cap.
- **Late key**: a viewer whose pass expires keeps the current epoch's key
  and loses the next. Epoch length is the publisher's tolerance.

## 10. Events

| Type | Emitted by |
| --- | --- |
| `com.logicsrc.openswarm.iplive.channel.created.v1` | publisher |
| `com.logicsrc.openswarm.iplive.stream.started.v1` | origin |
| `com.logicsrc.openswarm.iplive.stream.ended.v1` | origin, with the final head id and recording title id |
| `com.logicsrc.openswarm.iplive.relay.joined.v1` | origin |

## 11. Implementations

| Piece | Exists | Where | What is new |
| --- | --- | --- | --- |
| RTMP/SRT ingest to HLS segments, segment swarming in the DHT, relay nodes rebuilding playlists, LL-HLS opt-in | Designed | `c0mpute` `dips/0019-live-stream-plugin.md` | Encrypted segments, signed heads, paid relays: the same design with `ippay` attached |
| Live TV playback in the browser (hls.js, mpegts.js) | Yes | `media-streamer` `hls-player-modal.tsx`, tipoffwatch and genrewatch players | MSE append of decrypted CMAF parts from peers instead of an HLS URL |
| Pay-per-game passes with live session caps | Yes (central) | `media-streamer` IPTV resale (`iptv_share_sessions`) | Concurrency is no longer the owner's provider line; it is the origin's `maxDownstream` |
| Channel and head records, `iplive` messages, relay economics, recording to `ipvideo` | No | | All of it |

## 12. Conformance

An origin signs a head per unit, rotates keys per epoch, and announces a
key change one segment early. A relay verifies roots before forwarding,
honours `window` rules, and never serves below `live - buffer`. A viewer
drops rather than stalls, vouchers every peer that served it, and requests
a grant on a `keyId` change.

## 13. Version history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-09-05 | Initial draft. |
