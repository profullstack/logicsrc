# OpenSwarm on c0mpute.com

Version: **0.1** (draft)
Status: draft. Describes how a c0mpute node takes part in OpenSwarm swarms
and how it is paid. The node facts below are from the `profullstack/c0mpute`
repo as of 2026-09-05; the workload types and flows are proposed.

## 1. What c0mpute is, in the terms this document needs

A c0mpute node is a machine running the `c0mpute` Rust binary as a worker.
Its identity is a libp2p Ed25519 keypair at `~/.config/c0mpute/identity.key`.
Nodes join a Kademlia DHT under `/c0mpute/kad/1.0.0` from a bootstrap list
at `https://c0mpute.com/bootstrap.json`, and advertise capability tags
(`c0mpute:role:storage`, `c0mpute:role:transcode`, `c0mpute:role:gateway`,
`c0mpute:role:verifier`, one of `c0mpute:gpu:nvidia|amd|apple` or
`c0mpute:cpu`) on gossipsub every 60 seconds.

Work is a gossipsub auction. A buyer publishes a `JobOffer` on
`c0mpute/jobs/<workload_type>` with `required_capabilities`,
`max_price_usd` and a `deadline_unix_ms`; workers publish `JobBid`s; after
an 8 second window the buyer publishes `JobAccept`; the winner runs it and
publishes a `JobReceipt` with `output_hash` and `status`. Payment is
CoinPay escrow in USD-equivalent (USDC among others); workers keep the full
agreed price. Storage today is a blake3-addressed chunk store with
Reed-Solomon 10 data + 4 parity shards, priced at $0.008 per GB-month and
$0.005 per GB of internet egress. Transcode is in-process ffmpeg with
hardware encoders. A gateway serves `/chunks/<hash>` on port 7777. The
live-stream DIP 0019 already describes RTMP/SRT ingest to 4 second segments
swarmed BitTorrent-style.

OpenSwarm adds nothing to how a node joins or bids. It adds workload types
the node can bid on, a second identity the node registers as a payee, and
per-byte income that arrives without any auction.

## 2. Node identity and payout

A node derives an OpenSwarm identity from its libp2p key:

```
seed = HKDF-SHA256(ikm = libp2p Ed25519 private key bytes, salt = "", info = "openswarm:node:v1")
```

From that seed the node has a publisher identity (core §4.1): a signing key
for `hello` messages, vouchers it signs as a payer when it pulls from other
peers, and a box key for grants. At first start with OpenSwarm enabled it
registers as a payee (`ippay` §6.1) at every hub in its configuration,
with the same payout address `c0mpute worker register` already holds for
CoinPay. `c0mpute worker start --openswarm` is the proposed flag; the node
then adds `c0mpute:openswarm:seed`, `c0mpute:openswarm:relay`,
`c0mpute:openswarm:keeper`, `c0mpute:openswarm:index` and
`c0mpute:openswarm:gateway` to its capability tags according to which
roles it runs.

## 3. Workload types

Each is a `module.toml` `[module.workloads]` entry in a proposed `openswarm`
plugin. `spec_inline` shapes are given as the buyer sends them in
`JobOffer`; every `spec_inline` carries the records the worker needs, so a
worker never has to resolve anything before bidding.

| Workload type | Capability | What the worker does | Priced by |
| --- | --- | --- | --- |
| `ipfile.pin` | `c0mpute:role:storage`, `c0mpute:openswarm:seed` | Fetch a swarm, hold it for a period, seed it, answer storage challenges | GB-month, plus vouchers while serving |
| `ipfile.keep` | `c0mpute:openswarm:keeper` | Hold a content key under a delegating grant, answer `key_req` and the key URL | Flat per period, plus `keeperBps` per grant |
| `ipfile.gateway` | `c0mpute:role:gateway`, `c0mpute:openswarm:gateway` | Serve a swarm as a BEP 19 webseed and the manifest and layer routes | Flat per period, plus vouchers |
| `ipvideo.transcode` | `c0mpute:role:transcode` | Produce a CMAF ladder from a source `ipfile`, publish each rendition as an `ipfile`, return the segment indexes | Per job, as `ffmpeg.transcode` |
| `ipaudio.transcode` | `c0mpute:role:transcode` | Produce audio renditions with gapless values and seek indexes | Per job |
| `iplive.relay` | `c0mpute:openswarm:relay` | Join a channel as a relay for a period with a guaranteed `maxDownstream` | Per hour floor, plus vouchers |
| `ipdb.index` | `c0mpute:openswarm:index` | Follow named feeds, keep a replica current, answer `POST /db/query` | Per feed-month, plus x402 per query if the buyer sets a price |

### 3.1 `ipfile.pin`

```json
{
  "job_id": "5b8c1f3e-8a7d-4e2b-9c11-0f2a6d3e4b5c",
  "workload_type": "ipfile.pin",
  "buyer_peer_id": "12D3KooWQYhTNQdmr3ArTeUHRYzFg94BKuRMVuA2v6LzCDXkQmEA",
  "buyer_did": "did:coinpay:buyer:5d292428",
  "spec_hash": "blake3:9f4c2a1b7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b",
  "spec_inline": {
    "manifest": { "openswarm": "0.1", "type": "ipfile.manifest", "sigs": [] },
    "days": 30,
    "minPeersSeen": 1,
    "erasure": { "k": 10, "parity": 4 },
    "challenge": { "everyHours": 6 }
  },
  "required_capabilities": ["c0mpute:role:storage", "c0mpute:openswarm:seed"],
  "max_price_usd": 0.18,
  "deadline_unix_ms": 1757104800000,
  "published_at_ms": 1757101200000
}
```

(`manifest` is the full record in a real offer.) The price is for holding
734 MB for 30 days at the storage rate plus a margin. The worker fetches
the swarm as a paying peer if it has no free source (it needs a pass; the
buyer includes one scoped to the file in `spec_inline.pass` when
`pricing.perGib` is non-zero), stores the ciphertext however it likes, and
seeds. A `c0mpute:role:verifier` node runs the existing storage challenge
against random pieces; a failed challenge is a `JobReceipt` with `status:
"failed"` and a reputation slash, as today.

The receipt's `output_hash` is the swarm's `infohashV2`. Vouchers the node
earns while seeding are separate from the job and go through the hub.

### 3.2 `iplive.relay`

```json
{
  "workload_type": "iplive.relay",
  "spec_inline": {
    "channel": { "openswarm": "0.1", "type": "iplive.channel", "sigs": [] },
    "hours": 3,
    "maxDownstream": 16,
    "regions": ["us-west"]
  },
  "required_capabilities": ["c0mpute:openswarm:relay"],
  "max_price_usd": 0.60
}
```

(Other `JobOffer` fields as in §3.1.) The floor pays the relay to be there
for the whole event even if nobody watches; vouchers pay per byte when they
do. The origin adds accepted relays to `relays.allow` and to the head's
`relays` list.

### 3.3 `ipdb.index`

```json
{
  "workload_type": "ipdb.index",
  "spec_inline": {
    "feeds": ["ed25519:5d292428e8a68946e5225136c8b10e8f33ab78a45e1663d0730996dd2b63d59e/default"],
    "days": 30,
    "query": { "public": true, "priceUsd": "0.000000" },
    "gateway": true
  },
  "required_capabilities": ["c0mpute:openswarm:index", "c0mpute:role:gateway"],
  "max_price_usd": 0.50
}
```

The node follows the feeds, serves `POST /db/query` and the head route, and
publishes its gateway URL in its `hello` and capability ad so clients and
`ipname` records can point at it.

## 4. How a node gets paid

Two paths, both landing in the node's CoinPay payout:

1. **Jobs.** As today: `JobAccept` names the price, CoinPay escrow releases
   on a `completed` receipt. Pins, keeps, gateways, transcodes, relays and
   index jobs all pay this way for the commitment.
2. **Vouchers.** For every byte the node serves as a seeder, relay, keeper
   gateway or query gateway, the paying peer signs a voucher to the node's
   OpenSwarm identity. The node redeems the latest voucher per (pass,
   payee, swarm) at the hub when a session ends or every 15 minutes,
   whichever is sooner, and the hub pays out per its schedule.

A node that runs no jobs at all, only seeding swarms it chose to hold, is
still paid by vouchers. That is the "plug in and earn" path and needs no
buyer.

## 5. Use cases

Each use case is a flow plus the CLI invocations, with the `ip` CLI as
proposed in [cli.md](./cli.md) and the existing `c0mpute` CLI as it is.

### 5.1 A podcast episode, seeded by the network

Publisher: p0dcasters.com on behalf of a show. Goal: listeners pay per
episode, seeders are paid, the show gets 70 percent.

```bash
ip audio publish ./ep42.json --renditions opus-64,opus-96 --per-gib 0.005 --key-price 0.25
ip file pin ed25519:<opus-96 file key> --days 90 --min-peers 3 --max-price 0.40
```

`ip audio publish` transcodes locally (or with `--on c0mpute`), adds two
`ipfile`s, writes the track record, appends all three to the feed. `ip
file pin` publishes an `ipfile.pin` offer; three storage nodes win and
seed. A listener's app buys a pass scoped to the publisher for 2 USD once,
then streams every episode against it. p0dcasters renders the RSS feed from
the release record through a keeper gateway for apps that only speak HTTP.

### 5.2 A film, pay-per-view, no server in the path

Publisher: an independent distributor on bittorrented.com. Goal: viewers
watch in the browser, nobody proxies the bytes.

```bash
ip video publish ./film.mov --ladder default --on c0mpute --max-price 6.00
ip file pin --title sha256:<title id> --days 180 --min-peers 5
```

Four `ipvideo.transcode` jobs run on GPU nodes; each rendition is added as
an `ipfile` from the worker and seeded there. The bittorrented.com player
(WebTorrent plus the `ipfile` extension plus MSE) buys a pass in the page
with CoinPay Wallet, fetches pieces from WebRTC-capable seeders, decrypts,
plays. The distributor's share arrives daily.

### 5.3 A live game with paid relays

Publisher: tipoffwatch.com carrying a stream it has the rights to relay.

```bash
ip live create tipoff-court1 --latency low --per-gib 0.02 --key-price 1.00
ip live relay-hire ed25519:<channel key> --hours 3 --relays 6 --max-downstream 16 --max-price 4.00
ip live start tipoff-court1 --input srt://:9000 --record
```

Six `iplive.relay` jobs win. Viewers buy a 1 USD key and stream; each
viewer pulls from two relays; relays earn 35 percent of vouchers. When
the game ends the recording is published as an `ipvideo.title`
automatically and the same pass, scoped to the publisher, plays it.

### 5.4 Software release distribution, free to download

Publisher: a vendor shipping a 4 GB installer. Goal: downloads free,
seeding paid by the vendor, nothing on a CDN.

```bash
ip file add ./installer-4.2.0.dmg --public --per-gib 0 --key-price 0
ip file pin ed25519:<file key> --days 365 --min-peers 10 --erasure 10,4
```

`--public` sets `keys.public` so any peer decrypts. The vendor pays ten
pins at the storage rate; downloaders pay nothing; vanilla BitTorrent
clients with the manifest's key can also decrypt with a small tool. The
BEP 46 pointer under the file key is a permanent "latest version" link:
`ip file get ed25519:<file key>` always fetches the current release.

### 5.5 Encrypted off-site backup

Publisher: a small company. Goal: 200 GB held on three independent nodes,
readable by nobody else.

```bash
ip file add ./backup-2026-09.tar --standalone-key --private --per-gib 0.01 --key-price 0
ip file pin ed25519:<file key> --days 30 --min-peers 3 --erasure 10,4
```

`--private` sets `swarm.private` (no DHT, no PEX) and `visibility: pass`.
No grant is ever issued to anyone but the owner; `keys.owner` in the
manifest plus the standalone seed in the company's OpenCreds vault is the
recovery path. Pins are verified by storage challenges. Restore is `ip
file get` with the seed loaded.

### 5.6 A dataset sold to agents by the gigabyte

Publisher: a data vendor. Buyer: a crawler or an AI agent with an x402
wallet. Goal: sell to bots, the same motivation as the crawl paywall.

```bash
ip file add ./corpus-2026q3.parquet --per-gib 0.50 --key-price 25.00
```

```bash
# the buyer, unattended
x402 pay "https://coinpayportal.com/api/openswarm/passes?payer=<key>&file=<file key>&cap=60&grant=1"
ip file get ed25519:<file key> --pass ./pass.json --out ./corpus.parquet
```

`@profullstack/x402-client` buys the pass exactly as it buys a crawl pass.
The agent then fetches 100 GB from whichever nodes pinned it, paying 50 USD
in vouchers as it goes. Seeders that pinned the dataset earn 25 percent of
that; the vendor earns 70.

### 5.7 An album with a royalty split

Publisher: a label. Goal: three contributors paid automatically.

```bash
ip audio publish ./album/*.flac --release ./album.json --renditions flac,opus-160 \
  --royalty 0xCC3b...41E5:6000 --royalty 0x7E5F...5Bdf:3000 --royalty 0x1234...abcd:1000
```

Every voucher's publisher share is split 60/30/10 by the hub after it looks
up the track record in `ipdb`. No play counts, no statements: a payout per
day per address.

### 5.8 Running an index for a label's catalogue

Operator: a c0mpute node with a public IP. Buyer: the label.

```bash
c0mpute worker start --roles gateway --openswarm
ip db index-hire ed25519:<label key>/default ed25519:<label key>/releases --days 30 --max-price 1.00
```

The node follows both feeds and answers queries at
`https://<node>/db/query`. The label's `ipname` record names the node as
its gateway. bittorrented.com's `/dht` page can query it to show what an
`ipfile` infohash it crawled actually is.

### 5.9 Browser-only listening on bittorrented.com

No node, no install. The site loads WebTorrent, `wire.use(ipfile)`, a
WebCrypto decryptor and an `<audio>` element fed by MSE. The listener buys
a pass with CoinPay Wallet through the x402 browser flow. Everything else
is peers. The hybrid Node seeder media-streamer already runs is the one
peer that is always there.

### 5.10 A creator seeding their own work from a laptop

```bash
ip init
ip file add ./set.mp3 --per-gib 0.01 --key-price 0.50
ip file seed --all
```

No c0mpute at all. The laptop seeds, gets paid by vouchers, and goes to
sleep at night. Listeners who fetched it keep seeding if they leave the
app open, and they are paid too. Pins on c0mpute are what the creator buys
when the laptop is not enough.

### 5.11 Two organisations exchanging files over a post-quantum link

Both run native nodes with Moshpit identities and names.

```bash
ip name set chovy.hacker --gateway https://gw.example --mtp-pin <pin>
ip file add ./contract-bundle.zip --private --per-gib 0
ip file share ed25519:<file key> --to ip://preshy.nigeria --grant
ip file get ip://chovy.hacker/default/file:ed25519:<file key> --tunnel mtp
```

`ip file share` seals a grant to the counterparty's box key from its
`ipname` record and sends it out of band. `--tunnel mtp` runs the
BitTorrent connection through an MTP/1 session pinned to the counterparty's
`mtp` pin. Nothing in the transfer is decryptable by a future quantum
adversary who recorded the link.

### 5.12 Enriching the DHT crawl

bitmagnet behind bittorrented.com/dht records every infohash it sees. An
`ipfile` swarm appears as a one-file torrent named by a hex string. With an
`ipdb` replica, `/dht/<infohash>` can look up `swarm.infohashV1` across
followed feeds and render the manifest's `name`, the track or title record,
the price and a play button, instead of "unknown, 734 MB". A feed the crawl
has never seen stays opaque, which is the privacy property working as
designed.

### 5.13 A keeper for a publisher who is not always online

```bash
ip file keep-hire ed25519:<file key> --days 90 --max-price 0.30
```

The winning node receives a delegating grant sealed to its box key,
answers `key_req` in the swarm and serves the key URL. It earns
`keeperBps` of every `keyUsd`. The publisher's laptop can be off; buyers
still get keys.

## 6. What changes in c0mpute

Proposed, not built:

1. An `openswarm` plugin (`plugins/openswarm/module.toml`) declaring the
   seven workload types in §3 with `mode = "in-process"` for pin, keep,
   gateway, relay and index, and `mode = "subprocess"` wrapping the `ip`
   CLI for the two transcodes until they are ported.
2. Capability tags `c0mpute:openswarm:*` in `capabilities.rs`, gated by
   `--openswarm` flags on `worker start`.
3. A BitTorrent peer in the node: a Rust client that speaks BEP 3, 10, 52,
   BEP 44 and the `ipfile`, `ipdb`, `iplive` extensions, with WebRTC via
   the same `node-datachannel` approach media-streamer uses in Node, so
   browsers can reach it.
4. The chunk store gains a piece index: `(infohashV2, pieceIndex) ->
   blake3 chunk`, so a swarm piece is served from the existing store and
   erasure shards are reconstructed on demand.
5. `c0mpute-gateway` gains `/swarm/<infohashV2>/{manifest,layer,data}`,
   `/db/query`, `/audio/...` and `/video/...` bridge routes with the
   `ippay` §7 headers, next to the existing `/chunks/<hash>`.
6. The verifier's storage challenge accepts an `ipfile` manifest and
   challenges random pieces by SHA-256 piece root rather than blake3.
7. The status contract (`/api/status`) gains `openswarm: { swarms_seeded,
   bytes_served_24h, vouchers_redeemed_24h }`.

None of this changes the auction, escrow, DID or reputation formula.

## 7. Open questions

- Whether `ipfile.pin` should be priced by the existing $0.008 per GB-month
  rate automatically, with the buyer setting only `days`.
- Whether the verifier should also spot-check that a pinned node actually
  serves (a paid fetch by the verifier, refunded by the hub) rather than
  only that it holds.
- Whether c0mpute wants to be a hub itself, so a node's job income and
  voucher income arrive on one statement.
