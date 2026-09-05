---
openprd: "0.2"
id: "0005"
title: "Add the LogicSRC OpenSwarm specification family"
status: Draft
authors:
  - anthony@profullstack.com
created: 2026-09-05
updated: 2026-09-05
repo: profullstack/logicsrc
discussion:
implementation:
tags:
  - openswarm
  - ipfile
  - ipdb
  - ipaudio
  - ipvideo
  - iplive
  - bittorrent
  - x402
  - c0mpute
supersedes:
superseded-by:
---

## Problem

BitTorrent distributes bytes better than any CDN and has never been a
product, for two reasons. Nobody is paid to seed, so swarms die when the
uploader loses interest. Nothing in it is private, so a publisher who wants
to charge for access cannot use it at all.

Every Profullstack media property has answered that by putting a central
HTTP proxy in front of the bytes and bolting a pass system onto it:
bittorrented.com's seedbox, IPTV and radio rails, tipoffwatch and
genrewatch's shared playlists, p0dcasters' episodes. Each one re-implements
pay-per-pass grants, session caps and manifest sealing, and each one pays
for every byte it serves. The swarm the site is named after cannot carry
the payment, so it is not used for the thing that costs money.

c0mpute.com has the other half: nodes that already store, transcode,
gateway and (by design) relay live segments, paid through a job auction.
They have no way to earn from serving media once a job is done, and no
protocol that tells them what to seed.

What is missing is an open, versioned description of a paid, encrypted
swarm: how a file is encrypted so the tracker learns nothing, how a peer
that serves a verified piece is paid for it, how the key reaches a peer
that paid, and how a catalogue of such swarms is replicated without a
server. And the same primitives, reused, for audio, video and live.

## Goals

- A publisher adds a file once and it stays available as long as anyone is
  paid to seed it, on c0mpute nodes or on strangers' machines.
- A seeder is paid per verified byte served, with exposure bounded to a
  small credit window, and a leecher never pays for a byte it did not
  verify.
- A public tracker, DHT node or crawler learns an infohash and a size, not
  a title.
- One key model: a publisher seed from which every file, feed and channel
  key derives and can be recovered; a fresh unrelated key only on request.
- Vanilla BitTorrent clients remain valid swarm members and browsers remain
  first-class peers (WebTorrent, WebCrypto, MSE).
- Payment reuses x402 and CoinPay exactly as `@profullstack/x402-gateway`
  sells crawl passes today; events reuse CloudEvents and Standard Webhooks
  as `@profullstack/autoblog` emits them; post-quantum links reuse
  `moshpit-transport`; names reuse the Moshpit registry.
- Every building block (chunking, manifests, keys, encryption, payment,
  relay) is specified once and reused by `ipaudio`, `ipvideo`, `iplive`
  and c0mpute; reuse is the default posture.
- c0mpute nodes have concrete workload types to bid on and a per-byte
  income path that needs no auction.

## Non-Goals

- Not a new transport. The wire is BEP 3, the extension is BEP 10, hashing
  is BEP 52, discovery is BEP 5, 44 and 46.
- Not a token or a chain. Passes are bought once in USDC; vouchers are
  off-chain and redeemed at a hub; payouts are batched.
- Not trustless settlement. A hub is trusted as a payment processor is.
- Not DRM. A paying peer holds the key; the spec says so.
- Not a player, a recommender, or a moderation system.
- Not an implementation. This PRD adds specifications only.

## Users

- **A publisher** (label, studio, podcaster, vendor, company backing up)
  who wants distribution paid for by the people who want the bytes.
- **A seeder or relay operator**, including every c0mpute node, who wants
  to be paid for bandwidth and disk.
- **A listener or viewer** in a browser or an app, who wants to pay once
  and stream without a server deciding whether they may.
- **An agent** with an x402 wallet that buys a dataset unattended.
- **An implementer** who wants to interoperate from the published
  documents without reading Profullstack source.

## Requirements

- R1 [P0] Define the core: signed JSON records with JCS canonical form and
  SHA-256 ids, Ed25519 signatures with domain prefixes, optional ML-DSA-65,
  derived per-file, per-feed and per-channel keys from one seed, BEP 52
  identifiers, BEP 10 extension names, BEP 44 pointers, CloudEvents.
- R2 [P0] Define `ipfile`: the manifest, the grant, AES-256-CTR piece
  encryption with two merkle roots, the `hello` and payment messages, the
  credit window and voucher interval, key delivery by peer and by URL,
  vanilla coexistence, publishing and retrieval procedures.
- R3 [P0] Define `ippay`: passes bought over x402 with CoinPay's v2 offer
  and proof, payer binding, cumulative vouchers with exact integer value
  arithmetic, the hub record and API, receipts and split arithmetic, payee
  registration, standing, payout, HTTP presentation headers.
- R4 [P0] Define `ipdb`: signed hash-chained feeds, entries with put and
  delete, heads on the DHT, replication by `ipfile` segments and by gossip,
  fork detection, the query shape and result, playlists and ratings.
- R5 [P0] Define `ipaudio`: track and release records, renditions as
  `ipfile`s, seek index, aligned anchors, gapless trim, royalty split, the
  gateway bridge and RSS.
- R6 [P0] Define `ipvideo`: title record, CMAF renditions with segment
  index, subtitles, thumbnails, chapters, MSE playback, byte-range HLS
  bridge, transcode on c0mpute.
- R7 [P0] Define `iplive`: channel and head records, key epochs, the
  `iplive` extension with `window` backpressure, roles and relay
  economics, low-latency parts, recording to `ipvideo`.
- R8 [P1] Define `ipname`: the name record, the `openswarm` registry pin
  kind, the DNS TXT form, clearnet-first, the `ip://` URL.
- R9 [P1] Define the c0mpute integration: node identity and payee
  registration, seven workload types with `JobOffer` shapes, at least ten
  use cases with CLI flows, the list of proposed changes to the node.
- R10 [P1] Propose the `ip` CLI as a contract: command tree, exit codes,
  output fields, environment.
- R11 [P1] Publish conformance profiles and checklists, a security model,
  and an FAQ.
- R12 [P1] Publish the family at `logicsrc.com/openswarm` with the same
  site registration as OpenCreds (nav, docs registry, sitemap, landing).
- R13 [P2] Ship JSON Schemas under `@logicsrc/schemas` and a reference
  implementation with the fixture suite described in conformance.md.
  Deferred to a later PRD; this one is documents only.

## UX Notes

Adding a file is one command and prints everything a person needs to hand
out: the file key, both infohashes, a magnet link and an `ip://` URL. The
seed is created once and reused; the CLI never prints it without
`--reveal`.

Fetching is one command that buys or reuses a pass, joins, pays, decrypts
and verifies, and reports what it paid and who granted the key. A pass
scoped to a publisher rather than a file is what a player wants, so a
listener buys once per label, not per track.

Failure modes are named: `no-pass`, `pass-cap`, `unpaid`, `not-keeper`,
`voucher-stale`. A choke is explained by a `credit` message, not by
silence.

## Success Metrics

- A swarm seeded by one implementation, paid for by a leecher from a
  second, with vouchers redeemed at a third party's hub, decrypts to
  `plainRoot`.
- bittorrented.com's browser player streams an `ipaudio` track from peers
  with no proxy in the path and the publisher's share arrives at the
  address in the manifest.
- A c0mpute node with no jobs earns voucher income from a swarm it chose
  to pin.
- Every spec document has zero em dashes and every JSON example is valid.

## Risks & Open Questions

- **Custodial hub.** CoinPay's x402 rail pays merchants directly and
  collects no fee. A hub holds balances and pays out; that is a different
  regulatory position and a product decision.
- **EIP-3009 cannot bind a resource.** Mitigated at the hub by recording
  nonce to resource; inherent to x402 v2.
- **Key copying.** A grantee can leak the key. The family prices access
  and does not prevent copying; re-encryption is the only remedy.
- **The Moshpit registry has no `openswarm` pin kind.** One-line change on
  the registry side; until then `ipname` works over DNS TXT only.
- **Name.** The working name was IPMedia. OpenSwarm is proposed for the
  reasons in the overview; the `ip*` protocol names stay either way.
- **Seed loss** freezes every derived file. Mitigated by storing the seed
  in OpenCreds and by standalone keys for files that change hands.
- **Spec before code.** Every wire format here is unimplemented. The
  fixture suite and the interop test are how this gets honest.
