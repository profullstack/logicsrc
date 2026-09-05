---
openprd: "0.2"
id: "0006"
title: "Add pay2seed to the OpenSwarm family: consent at upload and a paid seed market"
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
  - pay2seed
  - ipfile
  - ippay
  - ipdb
  - bittorrent
  - torlink
  - bittorrented
  - c0mpute
supersedes:
superseded-by:
---

## Problem

BitTorrent is the best distribution network ever built and it has never
been a legitimate business, because two things are missing from the
protocol. Nobody is paid to seed, so a swarm lives exactly as long as
somebody feels like leaving a client open. And nothing about an upload says
who put it there or whether they were allowed to, so every index is a pile
of unattributed infohashes and every seeder is presumed to be doing
something wrong.

OpenSwarm (PRD 0005) fixed the first half for encrypted media: `ippay` pays
a seeder per verified piece served. It does not pay anyone to *stay*. A
piece that nobody downloads this month earns nothing, so an archive, a
backup, a dataset waiting for its buyer or a podcast's back catalogue is
exactly as unfunded as it was before. `ipfile.pin` on c0mpute pays a
storage node to hold a swarm, but only a c0mpute node, only for a private
`ipfile` swarm, and only through c0mpute's auction.

The second half, consent, is not addressed anywhere. bittorrented.com
indexes what the DHT crawl finds and runs a seedbox rental rail, and
neither has a place for "I made this, here is the licence, here is where to
send a notice". A user of ours who wants to share their own work, keep an
off-site copy of their own data, or seed an openly licensed dataset for
money has no way to say so that anyone else can check.

## Goals

- **Consent is part of the upload.** A signed attestation with a fixed set
  of bases (`own`, `licensed`, `open-license`, `public-domain`, `personal`)
  and a notice endpoint, without which no hub lists the swarm. Public
  claims get a claim window and a public standing; false ones are voided
  on notice and count against the requester.
- **Anyone can pay to have anything kept.** An offer escrows a budget at a
  hub for a swarm to be held for N days by M seeders at a price per
  GiB-month. Public offers cover vanilla torrents and `ipdb` feeds; private
  offers cover `ipfile` ciphertext.
- **Anyone can be paid to keep it.** A seeder takes a lease, proves each
  period by challenge or probe, and is paid per proven period through the
  same `ippay` payee it already has for vouchers. torlink's headless daemon
  is the reference client; a laptop qualifies.
- **The market is one HTTP surface.** `GET /offers` is what a client picks
  work from. bittorrented.com is the reference hub.
- **Reuse.** Offers are bought like passes (x402, `X-OpenSwarm-Payer`),
  payouts are `ippay` §5.6, challenges are c0mpute's storage challenge,
  feeds are `ipdb`, events are the family envelope. One new document, six
  new record types, no new primitive.

## Non-Goals

- Deciding what content is acceptable. The hub enforces that an
  attestation exists, is signed and is honoured on notice. Its truth is
  the requester's liability.
- Encrypting public swarms. Public is public; private is `ipfile`.
- A reputation system that crosses hubs. Standing is one hub's signed
  opinion.
- A token, a chain, or a DAO.
- The seeder client, the hub, or the library themselves. This PRD adds the
  specification; implementation is tracked in each repo (§ Requirements
  lists them).

## Users

- **A creator or label** who wants their own release kept online for a
  year without running a server, and wants it on record that they are the
  one who put it there.
- **A person keeping a backup** who wants three copies of ciphertext held
  by strangers for 30 days and deleted after, and never wants the strangers
  to know what it is.
- **An open data or open source publisher** with a 4 GB installer or a
  dataset who wants ten seeders paid to stay, and downloaders to pay
  nothing.
- **A seedbox operator or torlink user** with disk and bandwidth to spare
  who wants to be paid for holding swarms, and to see, before accepting,
  whether they would be holding a stranger's ciphertext or seeding a
  CC-BY dataset in the clear.
- **bittorrented.com** as the hub: attestations, offers, the market, and
  the seedbox rental rail it already runs, with IPTV and other passes sold
  beside it.
- **A c0mpute node** that already bids on `ipfile.pin` and now sees the
  same offers from any hub.

## Requirements

1. `docs/openswarm/pay2seed.md` specifies: the attestation record and
   basis table; the claim window and requester standing; the offer record,
   its purchase over x402, and its lifecycle; public swarms, public feeds
   on `ipdb`, private swarms; the lease record and slot rules; storage
   challenges and probes; GiB-month accrual, receipts and payout through
   `ippay`; the hub record extension and API; seeder client behaviour;
   notices and takedown; the `ipfile.pin` mapping; events; conformance.
2. `docs/openswarm.md` lists `pay2seed` in the family table, the stack
   diagram, "What it defines" and "What already exists".
3. `docs/openswarm/spec.md` §11 registers the six `pay2seed.*` record
   types and their signers.
4. `docs/openswarm/cli.md` gains the `ip seed` command group.
5. The `/openswarm` page on logicsrc.com lists `pay2seed` among the
   protocols.
6. Implementations, tracked outside this repo:
   - bittorrented.com (`profullstack/media-streamer`): the reference hub.
   - torlink (`baairon/torlink`, via the `ralyodio` fork): the seeder
     client. Per-torrent seed time (#186) is the first piece.
   - `@profullstack/pay2seed`: the shared client (hub calls, records,
     signing) and the promo surfaces the Profullstack media sites embed.
   - c0mpute: `ipfile.pin` interop per §11.

## UX Notes

- An attestation is one form on the upload screen: what is it, why may
  you share it, where do notices go. The basis list is a radio group;
  `personal` is greyed out unless the swarm is private.
- The market listing shows, for every offer, the basis and visibility in
  words a seeder can act on: "Open licence (CC-BY-4.0), public, 7.4 GB,
  30 days, earns about $1.04". A seeder client MUST show the same.
- A seeder's own view is a table of leases: what, basis, earned so far,
  next challenge due, ends on. torlink's `/downloads` grows a `lease`
  block per torrent.
- A requester sees, per offer: status, seeders held out of wanted, proven
  periods, and a spend bar against the budget.

## Success Metrics

- A public swarm with an honoured attestation and a funded offer on
  bittorrented.com is held by its `seeders.min` within `graceHours`, and
  still has that many proven seeders at `expiresAt`.
- A torlink daemon takes a lease, passes every challenge for 30 days, and
  is paid out without an operator touching it.
- An `ipfile.pin` job from c0mpute and a `pay2seed.offer` from
  bittorrented.com are served by the same node with one code path.
- A notice against a public attestation ends every lease on it within
  `claimHours` and the requester's standing shows it.

## Risks & Open Questions

- **Sybil seeding.** One machine, many keys, one copy. `seeders.max`,
  probes to announced addresses, and refusing a shared payout address on
  one offer bound it; they do not remove it. Open: whether a hub should
  require a small stake per lease that a failed period forfeits.
- **Answer relaying on challenges.** A seeder holding nothing can fetch
  the four pieces inside a ten-minute deadline on a fast link. Probes are
  the stronger evidence for public swarms; deadlines should scale with
  piece count. Open: whether a challenge should also demand a piece the
  swarm currently has no other seeder for.
- **Claim window versus liveness.** Twenty-four hours before a public
  offer is listed is a day of nobody being paid. Open: a shorter window
  for `open-license` and `public-domain` bases, which a licence file in
  the swarm can substantiate.
- **Hub as escrow.** Budgets sit with the hub for up to a year. A hub
  going away takes them. Same trust as `ippay` passes, longer duration.
  Open: whether budgets should be released to the hub per period rather
  than at purchase.
- **Private and `personal` swarms are unreviewable by design.** Consent is
  the requester's signature and standing, nothing else. This is stated
  in the spec rather than hidden.
- **Naming.** The rest of the family uses `ip` names. `pay2seed` is the
  product name and reads as one to a seeder choosing work; the record
  types are `pay2seed.*` so the two never need reconciling.
