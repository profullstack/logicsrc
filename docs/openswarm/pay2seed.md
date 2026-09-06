# pay2seed: The Client Protocol for Paid Seeding

Status: 0.1 draft. Member of the [OpenSwarm](../openswarm.md) family.
Depends on the [core](./spec.md), [`ipfile`](./ipfile.md), [`ippay`](./ippay.md)
and [`ipdb`](./ipdb.md). Its server half is [`paid2seed`](./paid2seed.md).

## 1. Scope

`pay2seed` is the side that pays. It is spoken over HTTPS by a requester, a
person or a program that wants data kept alive on a swarm by machines they
do not control, to a hub. It defines:

- **Consent.** A signed attestation, made when the data is added, that the
  requester has the right to distribute it and accepts notice. A hub MUST
  NOT list an offer without one. This is the part BitTorrent never had.
- **Offers.** A request to store, archive or share a swarm for a period,
  with a budget escrowed at the hub, a number of seeders wanted, and a
  proof cadence. Public offers cover vanilla torrents and `ipdb` feeds;
  private offers cover `ipfile` swarms whose ciphertext a seeder holds
  without ever reading.
- **The requester's view of the market**, of standing, and of notices.

Everything on the BitTorrent side, how a seeder takes a lease, proves it
holds and serves the pieces, and is paid, is [`paid2seed`](./paid2seed.md).
The two documents share one hub, one set of record types, and one
lifecycle; the split is who speaks which half. A hub implements both. A
requester client implements only this one. A seeder client implements
only the other.

`ipfile.pin` ([c0mpute](./c0mpute.md) §3.1) is this document's offer
carried on c0mpute's job auction; `paid2seed` §8 gives the mapping.

### Non-goals

Judging content. A hub sees an attestation, an infohash and, for a private
swarm, nothing else. It enforces that the attestation exists, is signed and
is honoured on notice; whether it is true is the requester's liability, and
§7 is how a false one is undone. Not a DRM. Not a token. Not a replacement
for `ippay` vouchers: a swarm that charges leechers keeps charging them.

## 2. Terminology

- **Requester.** The identity that posts an offer and funds it. Usually the
  publisher of the swarm; for a public torrent it may be anyone who wants
  it kept alive, subject to §3.
- **Seeder.** An identity that holds a lease and serves the swarm
  (`paid2seed`).
- **Hub.** An `ippay` hub that also implements this document and
  `paid2seed`. bittorrented.com is the reference hub.
- **Attestation.** The consent record (§3). **Offer.** The request (§4).
- **Period.** The unit of accrual and proof, `proof.everyHours` long.
- **Visibility.** `public` (a vanilla torrent or an `ipdb` feed) or
  `private` (an `ipfile` swarm; ciphertext only).

Keys, records, signatures, amounts and times are as in the core.

## 3. Consent: the attestation

An attestation is the requester saying, under signature, what the data is
and why they may distribute it. It is made once per swarm, before the first
offer, and every offer for that swarm references it.

### 3.1 Record

```json
{
  "openswarm": "0.1",
  "type": "pay2seed.attestation",
  "subject": { "infohashV1": "4330ddb304b78b1398a77297f57ea22c1ef3fb56", "infohashV2": null, "file": null },
  "visibility": "public",
  "basis": "own",
  "license": "CC-BY-4.0",
  "description": "Field recordings, Dartmoor, 2026",
  "notice": "https://example.com/.well-known/pay2seed-notice",
  "acceptsTakedown": true,
  "createdAt": "2026-09-05T18:00:00.000Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:0d87…", "sig": "…" }]
}
```

| Field | Rule |
| --- | --- |
| `subject` | Exactly one of `file` (an `ipfile` file key; visibility MUST be `private`), `infohashV1`/`infohashV2` (at least one; visibility MUST be `public`), or `channel` (an `iplive` channel key; see `pay2stream` §3). A feed offer (§4.4) attests the feed key in `file`. |
| `visibility` | `public` or `private`. Fixed for the life of the swarm. |
| `basis` | Why the requester may distribute this. One of §3.2. |
| `license` | REQUIRED when `basis` is `open-license`: an SPDX identifier. |
| `description` | OPTIONAL, at most 280 characters, shown on public listings. |
| `notice` | An HTTPS URL or `mailto:` at which the requester receives notices (§7). REQUIRED for `public`. |
| `acceptsTakedown` | MUST be `true`. Present so the acceptance is in the signed bytes. |

Signer: the requester key. For an `ipfile` subject the attestation MUST
also carry a signature by the file's publisher key, which is how a
stranger is prevented from attesting somebody else's private swarm. For a
public infohash no such proof of authorship exists; §3.3 stands in for it.

### 3.2 Basis values

| `basis` | Meaning | Allowed visibility |
| --- | --- | --- |
| `own` | The requester made it or holds the rights outright. | either |
| `licensed` | The requester holds a licence that permits redistribution. | either |
| `open-license` | Released under the SPDX licence in `license`. | either |
| `public-domain` | No rights subsist, or they were waived. | either |
| `personal` | The requester's own data, kept for themselves: backup, archive, sync. | `private` only |

A hub MUST reject an attestation whose `basis` and `visibility` disagree
with this table, and any with an unlisted `basis`. Hubs MAY refuse to list
particular bases; the hub record says which (§5.1).

### 3.3 Public infohashes and the claim window

Anyone can attest a public infohash, so the attestation is a claim. A hub
lists a public offer only after a **claim window** (`claimHours` in the
hub record, default 24) during which the infohash and the attestation are
visible at `GET /offers/<id>` and on the `pay2seed.offer.listed` event,
and a notice voids it. An offer for a swarm that already has an honoured
attestation from a different key is refused unless the new basis is
`open-license` or `public-domain`, the two that do not depend on who is
asking.

A requester's standing (`paid2seed` §6.3) records every attestation of
theirs that was voided. A hub SHOULD refuse new public attestations from a
key whose voided count exceeds its accepted count, and MUST refuse them
from a key with three or more voided in the last year.

## 4. Offers

An offer is money on the table for a swarm to be kept for a period. It is
bought from the hub as an `ippay` pass is, so the budget is settled before
anyone starts seeding.

### 4.1 Record

```json
{
  "openswarm": "0.1",
  "type": "pay2seed.offer",
  "hub": "ed25519:c9f1…",
  "requester": "ed25519:0d87…",
  "attestation": "sha256:8e1c…",
  "subject": { "infohashV1": "4330ddb304b78b1398a77297f57ea22c1ef3fb56", "infohashV2": null, "file": null, "feed": null },
  "visibility": "public",
  "sizeBytes": 7462331904,
  "days": 30,
  "seeders": { "min": 3, "max": 10 },
  "priceUsdPerGibMonth": "0.150000",
  "budgetUsd": "12.000000",
  "proof": { "everyHours": 6, "verifiers": ["hub"] },
  "pass": null,
  "trackers": ["udp://tracker.opentrackr.org:1337/announce", "wss://tracker.openwebtorrent.com"],
  "startsAt": "2026-09-05T18:00:00.000Z",
  "expiresAt": "2026-10-05T18:00:00.000Z",
  "payment": { "network": "eip155:8453", "nonce": "0x2f0a…" },
  "createdAt": "2026-09-05T18:00:00.000Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:c9f1…", "sig": "…" }]
}
```

| Field | Rule |
| --- | --- |
| `hub` | The hub that sold it and holds the budget. Signer. |
| `requester` | Who paid, bound at purchase as `ippay` §3.3 binds a payer. |
| `attestation` | Record id of an attestation whose `subject` and `visibility` match. |
| `subject` | As the attestation, plus OPTIONAL `feed`: an `ipdb` feed key (§4.4). |
| `sizeBytes` | Ciphertext or payload size. For a feed, the size at posting. |
| `days` | Period the swarm is to be held from `startsAt`. |
| `seeders.min` | Leases before the offer is `active`; `max` caps them. |
| `priceUsdPerGibMonth` | What one seeder earns for the whole swarm for 30 days, pro rata. |
| `budgetUsd` | Escrowed. At least `max * priceUsdPerGibMonth * sizeBytes/2^30 * days/30`, rounded up. |
| `proof.everyHours` | Period length, 1 to 168. |
| `proof.verifiers` | `hub`, `requester`, or `c0mpute`. |
| `pass` | For a `private` swarm whose `pricing.perGib` is non-zero: an `ippay.pass` scoped to the file so a seeder can fetch as a paying peer. |
| `trackers` | Announce URLs the seeder MUST add. At least one `wss://` when browser peers should find it. |
| `startsAt`, `expiresAt` | `expiresAt` is `startsAt + days`. Leases never outlive it. |
| `payment.nonce` | The settlement that funded `budgetUsd`. |

### 4.2 Purchase

`POST /offers` with an unsigned draft (every field but `hub`, `payment`,
`sigs`, `createdAt`) and no `X-PAYMENT` header answers `402` with an x402
offer for `budgetUsd` plus the hub's fee (`paid2seed` §5.3), exactly as
`ippay` §3.2 answers a pass purchase, with the same `X-OpenSwarm-Payer`
binding. Repeating with a valid proof answers `201` with the signed offer.
A hub MUST verify the referenced attestation before quoting, and MUST
refuse a `private` offer whose `sizeBytes` disagrees with the manifest.

An offer is `pending` until `seeders.min` leases exist, `active` from then
until `expiresAt`, then `settled`. It is `voided` by a notice (§7) or by
the requester (`DELETE /offers/<id>`, signed), and the unearned budget is
refunded to the requester's payout address less what leases have accrued.

### 4.3 Public swarms

A `public` offer is a vanilla torrent. Nothing in the wire changes; the
only new thing on the network is another well behaved seeder that stays.
A podcast archive, a dataset, a software release, an out-of-print
recording with a clean basis: kept alive by strangers who are paid for it.

### 4.4 Public feeds

An offer whose `subject.feed` is set covers an `ipdb` feed: every segment
swarm the feed publishes, present and future, and the duty to keep the
feed's head reachable. What a leased seeder must do about it is
`paid2seed` §7. `sizeBytes` is the feed's size at posting; each new segment
joins the accrual base at the period it is proven, and the hub MUST NOT
hand out leases whose projected accrual exceeds `budgetUsd`. The requester
tops up with a further offer for the same feed.

### 4.5 Private swarms

A `private` offer is an `ipfile` swarm. The seeder holds ciphertext and,
without a grant, cannot read a byte of it. `personal` is the basis for a
backup nobody else is ever meant to read; its `pricing` SHOULD be zero and
its manifest SHOULD not be catalogued. Where the manifest has `keys.public`
set the data is readable by anyone with the manifest and the offer is
still `private` in this document's sense: the attestation says the
requester may store it.

## 5. The requester's hub

### 5.1 Hub record

An `ippay.hub` record that offers this family adds:

```json
"pay2seed": {
  "base": "https://bittorrented.com/api/openswarm/pay2seed",
  "bases": ["own", "licensed", "open-license", "public-domain", "personal"],
  "claimHours": 24,
  "minStanding": 0,
  "verifiers": ["hub", "c0mpute"],
  "maxDays": 365
}
```

`bases` is what this hub will list. `minStanding` is the floor a seeder
needs to take a lease (`paid2seed`). A hub MAY run a market for private
backups only, or for open data only, by narrowing `bases`.

### 5.2 API, requester side

All bodies JSON, records verified on receipt, paths relative to `base`.
The seeder side of the same API is `paid2seed` §6.1.

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `POST /attestations` | signed record | Register. `201` with its id; `409` if one is honoured for the subject by another key (§3.3). |
| `GET /attestations/<id>` | none | The record and `{ "status": "claimed|honoured|voided", "notices": n }`. |
| `POST /offers` | x402 + `X-OpenSwarm-Payer` | Buy an offer (§4.2). |
| `GET /offers?visibility&basis&minPrice&maxSize&feed&status` | none | The market, newest first, paged. What a seeder client reads; what a requester watches. |
| `GET /offers/<id>` | none | The offer, its status, leases held, slots free, periods proven per lease. |
| `DELETE /offers/<id>` | requester signed | Void and refund the unearned budget. |
| `GET /requesters/<key>` | none | `{ "standing", "attestations", "voided", "offers" }`. |
| `POST /notices` | signed | A notice against an attestation (§7). |
| `POST /webhooks` | signed | Register a CloudEvents endpoint for a requester key. |

## 6. Requester client behaviour

A requester client (the `ip seed` commands in [cli.md](./cli.md), a web
app such as bittorrented.com's upload form) does the following:

1. Holds a requester key, stored as an OpenCreds `key` item, registered
   as an `ippay` payee so refunds have somewhere to go.
2. Makes the attestation before anything else, and MUST NOT let a user
   post an offer without choosing a `basis` and, for `public`, a `notice`
   endpoint. The basis list is a choice, never a default.
3. Buys offers only against attestations the key actually signed.
4. Includes a pass in a `private` offer when the manifest charges per GiB.
5. Watches `GET /offers/<id>` or the events for `active`, `lapsed` leases
   and `settled`, and shows the user seeders held out of wanted, periods
   proven, and spend against the budget.
6. Receives notices at the endpoint it named, and shows them.

## 7. Notices and takedown

Anyone may `POST /notices` against an attestation:

```json
{
  "openswarm": "0.1",
  "type": "pay2seed.notice",
  "attestation": "sha256:8e1c…",
  "kind": "rights|illegal|personal-data|other",
  "claimant": { "name": "…", "contact": "mailto:…" },
  "statement": "…",
  "createdAt": "2026-09-06T09:00:00.000Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:77aa…", "sig": "…" }]
}
```

On a notice the hub MUST forward it to the requester's `notice` endpoint
and MUST, within `claimHours`, either void the attestation or record that
it was reviewed and stands. Voiding an attestation voids every offer that
references it: leases end (`paid2seed` §3.2), the requester is refunded
the unearned budget less accrued earnings, and their `voided` count rises.
A hub that voids on every notice without review is conformant; a hub that
never voids is not.

For a `private` swarm the hub cannot inspect the content and does not
pretend to. What it has is the requester's identity, attestation and
standing, which is what accountability looks like for ciphertext.

## 8. Security notes

- **Attestation is a claim.** §3.3's window, standing and notices are the
  defence. A hub that lists a public offer the moment it is paid is not
  conformant.
- **Hub as escrow.** The budget sits with the hub for `days`, as a pass
  buyer's `capUsd` does for 30. The hub's signed receipts and refunds are
  its auditable trail.
- **Private means ciphertext, not secret existence.** An offer reveals to
  its seeders the file key, the size and the requester's key. `personal`
  swarms SHOULD use a fresh unrelated file pair (core §4.2) so backups are
  not linkable to a publisher's catalogue.

## 9. Implementations

| Piece | Where | Status |
| --- | --- | --- |
| Reference hub, requester side: attestations, offers, market, notices | `profullstack/media-streamer` (bittorrented.com) | planned; the seedbox rental rail is the pay-per-pass half today |
| Requester client and shared records | `@profullstack/pay2seed` | planned |
| Requester CLI | `ip seed …` ([cli.md](./cli.md)) | proposed |

## 10. Conformance

A **hub** is conformant on this side when it refuses offers without an
honoured attestation (§3), enforces the basis table and claim window
(§3.2, §3.3), escrows the budget before listing (§4.2), publishes the
market and requester standing (§5.2), and forwards and resolves notices
within `claimHours` (§7). It MUST also be conformant to `paid2seed`.

A **requester client** is conformant when it does all of §6.

## 11. Version history

- 0.1 (2026-09-06): split out of the first pay2seed draft (2026-09-05) as
  the client half; attestation, offers, requester API, notices.
