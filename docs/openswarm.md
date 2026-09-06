# OpenSwarm

Status: 0.1 draft. No reference implementation yet; see "What already exists" below.

Slug: `openswarm`

OpenSwarm is a LogicSRC OpenSpec family for **paid, encrypted, peer-to-peer
distribution of files and media**. It is an add-on to BitTorrent, not a new
transport. A swarm carries ciphertext, the tracker and the DHT learn nothing
about the content, every peer that serves a verified piece gets paid for it,
and the same swarm primitives carry files, audio, video, live streams and the
catalogue that describes them.

It exists because BitTorrent solved distribution and never solved the two
things that keep it from being a product: nobody is paid to seed, and nothing
in it is private. Every Profullstack media property (bittorrented.com,
tipoffwatch, genrewatch, p0dcasters) has rebuilt the same paid-access layer on
top of central HTTP proxies because the swarm could not carry the payment.

Working name during design was "IPMedia". The family is called OpenSwarm
because the swarm is the one object every member shares, because "media"
undersells `ipfile` and `ipdb`, and because "IP media" reads as IPTV, which is
a different product. The member protocols keep their `ip` names.

## The family

| Protocol | One line | Document |
| --- | --- | --- |
| Core | Records, identifiers, keys, signatures, transports, discovery, events | [`spec.md`](./openswarm/spec.md) |
| `ipfile` | Paid, encrypted file swarms as BitTorrent extension messages | [`ipfile.md`](./openswarm/ipfile.md) |
| `ippay` | Passes and vouchers: how a leecher pays and a seeder is paid, over x402 and CoinPay | [`ippay.md`](./openswarm/ippay.md) |
| `ipdb` | A replicated, append-only catalogue of manifests and metadata, discoverable over the DHT | [`ipdb.md`](./openswarm/ipdb.md) |
| `ipaudio` | Audio releases and tracks on `ipfile` swarms: renditions, seek tables, gapless, royalties | [`ipaudio.md`](./openswarm/ipaudio.md) |
| `ipvideo` | Video on demand on `ipfile` swarms: CMAF renditions, segment index, subtitles, thumbnails | [`ipvideo.md`](./openswarm/ipvideo.md) |
| `iplive` | Live streams: segment fan-out over peers, paid relays, backpressure | [`iplive.md`](./openswarm/iplive.md) |
| `ipname` | How a Moshpit name resolves to a publisher key and a catalogue | [`ipname.md`](./openswarm/ipname.md) |
| `pay2seed` | Client protocol for paid seeding: consent at upload, seed offers with escrowed budgets, the requester's market | [`pay2seed.md`](./openswarm/pay2seed.md) |
| `paid2seed` | Server protocol for paid seeding: leases, storage challenges and probes over the wire, GiB-month settlement, the seeder client | [`paid2seed.md`](./openswarm/paid2seed.md) |
| `pay2stream` | Client protocol for paid live streams: consent for channels, relay offers, tickets and listings, watching as a peer or on any HLS player | [`pay2stream.md`](./openswarm/pay2stream.md) |
| `paid2stream` | Server protocol for paid live streams: relay leases per hour, presence proofs, gateways serving standard HLS, M3U and EPG | [`paid2stream.md`](./openswarm/paid2stream.md) |

Supporting documents:

- c0mpute.com integration and use cases: [`c0mpute.md`](./openswarm/c0mpute.md)
- Proposed `ip` CLI: [`cli.md`](./openswarm/cli.md)
- Conformance: [`conformance.md`](./openswarm/conformance.md)
- Security model: [`security.md`](./openswarm/security.md)
- FAQ: [`faq.md`](./openswarm/faq.md)

## How the pieces stack

```
  +---------------------------------------------------------------+
  |  ipaudio      ipvideo      iplive         ipdb (catalogue)    |
  |  releases     titles       channels       feeds, entries      |
  +---------------------------------------------------------------+
  |  pay2seed / paid2seed        |  pay2stream / paid2stream      |
  |  consent, offers, market     |  consent, relay offers, tickets |
  |  leases, challenges, payout  |  leases, presence, HLS gateways |
  +------------------------------+--------------------------------+
  |  ipfile: manifest, per-file key pair, encrypted pieces,       |
  |          key grants, credit window, vouchers per served piece |
  +-------------------------------+-------------------------------+
  |  ippay: passes and vouchers   |  ipname: Moshpit name -> key  |
  |  x402 purchase, CoinPay hub   |  and catalogue                |
  +-------------------------------+-------------------------------+
  |  BitTorrent wire (BEP 3) + extension protocol (BEP 10)        |
  |  DHT (BEP 5, 44, 46), trackers, WebRTC peers (WebTorrent),    |
  |  webseeds (BEP 19), optional Moshpit MTP/1 tunnel             |
  +---------------------------------------------------------------+
```

Reading it upward: a video title is a set of `ipfile` swarms plus an index.
An `ipfile` swarm is an ordinary hybrid v1/v2 torrent whose payload is
ciphertext. Payment and key delivery ride on BEP 10 extension messages that a
vanilla client never sees. The catalogue that says what a swarm contains is
itself replicated as `ipfile` swarms and pointed at from the DHT.

## Reuse is the default posture

Every building block is specified once, with a stable interface, and reused:

- **Chunking and hashing** are BitTorrent v2 (BEP 52): 16 KiB blocks, SHA-256
  merkle trees, power-of-two piece lengths. `ipaudio`, `ipvideo` and `iplive`
  do not define their own.
- **Manifests** are one record shape (core §3) with a `type`. A track, a
  title and a channel are records that reference `ipfile` manifests.
- **Keys** are one identity model (core §4). A publisher key is reused for
  every file that publisher adds; per-file keys are derived from it and can be
  recovered from it. A fresh unrelated pair is minted only on request.
- **Swarm encryption** is `ipfile`'s AES-256-CTR over pieces, keyed per file.
  Audio and video renditions are encrypted the same way, by being files.
- **Payment** is `ippay`'s pass and voucher pair. A relay serving live
  segments is paid with the same voucher a seeder gets for a piece.
- **Relay** is one role. A c0mpute node that relays `iplive` segments uses
  the same credit window and the same voucher as a seeder.

A member protocol that needs something the core lacks adds a record type or
an extension message. It does not redefine a primitive.

## How c0mpute.com nodes participate

A c0mpute node already advertises roles (`storage`, `transcode`, `gateway`,
`verifier`) and takes work through a gossipsub auction. OpenSwarm adds
workload types the node can bid on and a second income path that needs no
auction at all:

| Role | Work | Paid by |
| --- | --- | --- |
| Storage | Pin an `ipfile` swarm for a period, seed it | Job price (pinning) plus vouchers per byte served |
| Relay | Fan out `iplive` segments to viewers | Vouchers per byte served |
| Transcode | Produce `ipaudio` / `ipvideo` renditions, publish them as `ipfile` swarms | Job price |
| Index | Replicate `ipdb` feeds, answer queries, serve a gateway | Job price plus x402 per query |
| Keeper | Hold a file's content key and grant it to paying peers | Share of each key grant |

Details, thirteen worked use cases and the proposed CLI invocations are in
[`c0mpute.md`](./openswarm/c0mpute.md).

## What it defines

**One swarm shape.** A hybrid BEP 52 torrent whose single payload file is
AES-256-CTR ciphertext. The v1 infohash makes it reachable from WebTorrent in a
browser, the v2 merkle tree makes every 16 KiB block verifiable, and the
plaintext root in the signed manifest makes the decrypted result verifiable.

**One key model.** A publisher key pair (Ed25519). Adding a file mints a
per-file pair derived from it: the public half is the file's identity and the
BEP 46 key under which the latest manifest is published; the private half
signs the manifest and authorises key grants and payout changes. A separate
random content key encrypts the bytes and is wrapped to paying peers.

**One payment loop.** A leecher buys a pass (x402, USDC, CoinPay as the
reference hub). A seeder serves pieces inside a bounded credit window. After
verifying each piece the leecher signs a cumulative voucher. The seeder
redeems the latest voucher at the hub, which splits it between seeder,
publisher and hub. Nobody pays for bytes they did not verify, and nobody
serves more than the window unpaid.

**One catalogue.** An `ipdb` feed is a signed, hash-linked log of records.
Its head is a BEP 44 mutable item under the feed key, so any DHT node can find
the latest catalogue of any publisher with one `get`.

**One seed market, one stream market.** A `pay2seed` offer is money
escrowed at a hub for a swarm to be kept for a period, public or private,
and it cannot be listed without a signed attestation of who put the data
there and on what basis. On the `paid2seed` side, seeders take leases,
prove they hold and serve the pieces every period, and are paid per
GiB-month. `pay2stream` and `paid2stream` do the same for a live channel:
a broadcaster attests it and buys relays by the hour, relays and gateways
prove they are online and serving, and a gateway turns the swarm into
standard HLS so any television plays it. The naming is the rule: `pay2*`
is the client protocol, the side that pays over HTTPS; `paid2*` is the
server protocol, the BitTorrent side that earns. It is how a torrent
client becomes a legitimate file sharer: consent on the way in, proof on
the way out, and a payout for staying.

## What it does not define

A media player. Transcoding settings beyond what a manifest must declare. A
token. A blockchain. Content moderation. A search ranking. DRM in the sense
of controlling a device after the key is delivered; a paying peer holds the
key and the spec says so.

## What already exists

| Piece | Where | Relationship |
| --- | --- | --- |
| Browser WebTorrent player, hybrid Node seeder, wss trackers | `profullstack/media-streamer` (bittorrented.com) | Speaks the vanilla wire this family extends; needs the `ipfile` extension to pay |
| DHT crawl (bitmagnet) and `/dht` browse | `profullstack/media-streamer`, `dht-infohash-crawler` | Observes `ipfile` swarms as opaque infohashes; `ipdb` is how it would learn what they are |
| Pay-per-pass grants, HLS manifest sealing | `media-streamer` IPTV and seedbox rails | The central-proxy version of what `ippay` moves into the swarm |
| Headless seeder daemon with an add API and per-torrent seed time | `torlink` (`torlnk serve`) | The `pay2seed` seeder client, once it polls a market and answers challenges |
| x402 v2 offer, `X-PAYMENT` proof, verify and settle | `profullstack/x402-gateway`, CoinPay | `ippay` pass purchase reuses it unchanged |
| CloudEvents 1.0 + Standard Webhooks signing | `profullstack/autoblog` | Every OpenSwarm event uses the same envelope and headers |
| MTP/1 post-quantum transport, name pins | `profullstack/moshpit-transport`, `moshpit-proxy` | Optional tunnel for native peer links; `ipname` pin kind |
| blake3 chunk store, RS 10/14 erasure, ffmpeg transcode, live-stream DIP 0019 | `profullstack/c0mpute` | The node that seeds, relays, transcodes and indexes |

New in this family: the extension messages, the manifest and key model, the
pass and voucher protocol, the catalogue log, and the media record types.

## Quick start (proposed CLI)

```bash
# One publisher identity, reused for every file
ip init

# Add a file: derives the file key pair, encrypts, builds the hybrid torrent,
# signs the manifest, starts seeding
ip file add ./interview.flac --per-gib 0.01 --key-price 0.50

# Publish an audio release that references it
ip audio publish ./release.json

# Fetch as a paying peer (buys a pass, gets the key, verifies, decrypts)
ip file get ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d --out ./interview.flac

# Ask the catalogue
ip db query --type ipaudio.track --where 'record.artist == "Ada"' --limit 20
```

## Relationship to the other LogicSRC specs

- **OpenCreds** ([opencreds.md](./opencreds.md)) stores the publisher seed as
  a `key` item. Losing that seed is the one unrecoverable event in this family,
  and OpenCreds is where it should live.
- **OpenContext** ([opencontext.md](./opencontext.md)) governs what an agent
  may read. An agent holding a pass for one swarm is entitled to that swarm's
  key and nothing else; the pass scope is the OpenContext decision.
- **OpenOntology** ([openontology.md](./openontology.md)) names the entities
  an `ipdb` entry refers to. An `ipaudio.track`'s `artist` is an ontology
  entity where one is in use.
- **Credential Sharing** ([credential-sharing.md](./credential-sharing.md))
  moves a hub API key or a payout address between providers; OpenSwarm never
  stores either.
