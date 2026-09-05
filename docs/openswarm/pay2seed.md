# pay2seed: Consent, Seed Offers and the Seed Market

Status: 0.1 draft. Member of the [OpenSwarm](../openswarm.md) family.
Depends on the [core](./spec.md), [`ipfile`](./ipfile.md), [`ippay`](./ippay.md)
and [`ipdb`](./ipdb.md).

## 1. Scope

`pay2seed` is how somebody pays to have data kept alive on a swarm by
machines they do not control, and how the people running those machines are
paid for it. It turns a torrent client into a legitimate file sharer: every
swarm on the market carries a signed statement of who put it there and on
what basis, every seeder holds a lease that says what they were asked to
keep and for how long, and every payout is backed by proof that the bytes
were held and served.

It covers:

- **Consent.** A signed attestation, made when the data is added, that the
  requester has the right to distribute it and accepts notice. A hub MUST
  NOT list an offer without one. This is the part BitTorrent never had.
- **Offers.** A request to store, archive or share a swarm for a period, with
  a budget, a minimum number of seeders and a proof cadence. Public offers
  cover vanilla torrents and `ipdb` feeds; private offers cover `ipfile`
  swarms, whose ciphertext a seeder holds without ever being able to read.
- **Leases.** The hub's binding of one seeder to one offer for one period at
  one price.
- **Proof of seeding.** Storage challenges answered from the held pieces, and
  probes in which a verifier fetches pieces over the ordinary wire. Both work
  on a vanilla torrent, which is what makes public seeding payable.
- **Settlement.** GiB-month accrual per proven period, receipts, and payout
  through an `ippay` hub. Served-byte vouchers, where the swarm charges for
  them, are separate and additive.
- **The market.** A hub API that lists open offers so a client can pick
  work, and a seeder client's expected behaviour.

`ipfile.pin` ([c0mpute](./c0mpute.md) §3.1) is this document's offer shape
carried on c0mpute's job auction. `pay2seed` is the same request opened to
any seeder: a torlink daemon on a seedbox, a laptop that is on most of the
day, a c0mpute node. A node MAY treat a `pay2seed.offer` as an `ipfile.pin`
job and vice versa; §11 gives the mapping.

### Non-goals

Judging content. A hub sees an attestation, an infohash and, for a private
swarm, nothing else. It enforces that the attestation exists, is signed and
is honoured on notice; whether the attestation is true is the requester's
liability, and §9 is how a false one is undone. Not a DRM: a public swarm is
public, a private swarm is `ipfile`'s encryption and no more. Not a token.
Not a replacement for `ippay` vouchers: a swarm that charges leechers keeps
charging them, and its seeders earn both ways.

## 2. Terminology

- **Requester.** The identity that posts an offer and funds it. Usually the
  publisher of the swarm; for a public torrent it may be anyone who wants it
  kept alive, subject to §3.
- **Seeder.** An identity that holds a lease and serves the swarm.
- **Hub.** An `ippay` hub that also implements this document's API (§7).
  bittorrented.com is the reference hub.
- **Verifier.** Whoever issues challenges and probes: the hub, a c0mpute
  verifier node, or the requester. A lease names who may.
- **Attestation.** The consent record (§3).
- **Offer.** The request (§4). **Lease.** One seeder's share of it (§5).
- **Period.** The unit of accrual and proof, `proof.everyHours` long.
- **Visibility.** `public` (a vanilla torrent or an `ipdb` feed, readable by
  anyone) or `private` (an `ipfile` swarm; ciphertext only).

Keys, records, signatures, amounts and times are as in the core. Every
record below is a core §3 record with the `type` shown.

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
| `subject` | Exactly one of `file` (an `ipfile` file key; visibility MUST be `private`) or `infohashV1`/`infohashV2` (at least one; visibility MUST be `public`). A feed offer (§4.4) attests the feed key in `file`. |
| `visibility` | `public` or `private`. Fixed for the life of the swarm; changing it is a new swarm. |
| `basis` | Why the requester may distribute this. One of the values in §3.2. |
| `license` | REQUIRED when `basis` is `open-license`: an SPDX identifier. Otherwise OPTIONAL. |
| `description` | OPTIONAL, at most 280 characters, shown on public listings. |
| `notice` | An HTTPS URL or `mailto:` at which the requester receives notices (§9). REQUIRED for `public`; OPTIONAL for `private`, where the hub's own contact for the requester's account stands in. |
| `acceptsTakedown` | MUST be `true`. Present so the acceptance is in the signed bytes. |

Signer: the requester key. For an `ipfile` subject the attestation MUST also
carry a signature by the file's publisher key, which is how a stranger is
prevented from attesting somebody else's private swarm. For a public
infohash no such proof of authorship exists; §3.3 is what stands in for it.

### 3.2 Basis values

| `basis` | Meaning | Allowed visibility |
| --- | --- | --- |
| `own` | The requester made it or holds the rights outright. | either |
| `licensed` | The requester holds a licence that permits redistribution. | either |
| `open-license` | Released under the SPDX licence in `license`. | either |
| `public-domain` | No rights subsist, or they were waived. | either |
| `personal` | The requester's own data, kept for themselves: backup, archive, sync. Nobody else is meant to read it. | `private` only |

A hub MUST reject an attestation whose `basis` and `visibility` disagree
with this table, and MUST reject any attestation with an unlisted `basis`.
Hubs MAY refuse to list particular bases (a hub for personal backup only, a
hub for open data only); the hub record says which (§7.1).

### 3.3 Public infohashes and the claim window

Anyone can attest a public infohash, so the attestation is a claim, not a
proof. A hub lists a public offer only after a **claim window** (`claimHours`
in the hub record, default 24) during which the infohash and the
attestation are visible at `GET /offers/<id>` and to anyone following the
hub's `pay2seed.offer.listed` event, and a notice (§9) voids it. An offer
for a swarm that already has an honoured attestation from a different key
is refused unless the new attestation's basis is `open-license` or
`public-domain`, which are the two bases that do not depend on who is
asking.

A requester's standing (§7.5) records every attestation of theirs that was
voided. A hub SHOULD refuse new public attestations from a key whose voided
count exceeds its accepted count, and MUST refuse them from a key with three
or more voided attestations in the last year.

## 4. Offers

An offer is money on the table for a swarm to be kept for a period. It is
bought from the hub exactly as an `ippay` pass is bought, so the budget is
settled before anyone starts seeding.

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
| `hub` | The hub that sold it and holds the budget. Signer of the record. |
| `requester` | Who paid, bound at purchase as `ippay` §3.3 binds a payer. |
| `attestation` | Record id of an attestation whose `subject` and `visibility` match this offer's. |
| `subject` | As the attestation, plus OPTIONAL `feed`: an `ipdb` feed key (§4.4). |
| `sizeBytes` | Ciphertext or torrent payload size. For a feed, the size at posting; §4.4 says how growth is paid. |
| `days` | Period the swarm is to be held from `startsAt`. |
| `seeders.min` | Leases the hub will hand out before the offer is `active`. `max` caps them; extra seeders beyond `max` earn only vouchers. |
| `priceUsdPerGibMonth` | What one seeder earns for holding the whole swarm for 30 days, pro rata. |
| `budgetUsd` | Escrowed. MUST be at least `max * priceUsdPerGibMonth * sizeBytes/2^30 * days/30`, rounded up to six places. |
| `proof.everyHours` | Period length. 1 to 168. |
| `proof.verifiers` | Who may challenge: `hub`, `requester`, or `c0mpute` (any node with `c0mpute:role:verifier`). |
| `pass` | For a `private` swarm whose `pricing.perGib` is non-zero: an `ippay.pass` scoped to the file, so a seeder can fetch it as a paying peer. `null` otherwise. |
| `trackers` | Announce URLs the seeder MUST add. At least one `wss://` tracker when the requester wants browser peers to find it. |
| `startsAt`, `expiresAt` | `expiresAt` is `startsAt + days`. Leases never outlive it. |
| `payment.nonce` | The settlement that funded `budgetUsd`. |

### 4.2 Purchase

`POST /offers` with an unsigned draft (every field but `hub`, `payment`,
`sigs`, `createdAt`) and no `X-PAYMENT` header answers `402` with an x402
offer for `budgetUsd` plus the hub's fee (§6.3), exactly as `ippay` §3.2
answers a pass purchase, and with the same `X-OpenSwarm-Payer` binding.
Repeating the request with a valid proof answers `201` with the signed
offer. A hub MUST verify the referenced attestation before quoting, and MUST
refuse a `private` offer whose `sizeBytes` disagrees with the manifest.

An offer is `pending` until `seeders.min` leases exist, `active` from then
until `expiresAt`, and then `settled`. It is `voided` by a notice (§9) or by
the requester (`DELETE /offers/<id>`, signed), in which case the unearned
budget is refunded to the requester's registered payout address, less what
leases have accrued.

### 4.3 Public swarms

A `public` offer is a vanilla torrent. The seeder fetches it from the swarm
like any client, using `trackers` and the DHT, and serves plaintext. Nothing
in the wire changes; the only new thing on the network is another well
behaved seeder that stays. This is how a podcast archive, a dataset, a
software release or an out-of-print recording with a clean basis gets kept
alive by strangers who are paid for it.

### 4.4 Public feeds

An offer whose `subject.feed` is set covers an `ipdb` feed: every segment
swarm the feed publishes, present and future, and the duty to keep the
feed's head reachable. A leased seeder MUST follow the feed (`ipdb` §5.4),
fetch each new segment within one period of its appearance in the head,
seed all of them, and re-announce the head as a BEP 44 mutable item at least
once per period so the catalogue stays findable when the publisher is
offline. `sizeBytes` is the feed's size at posting; each new segment is
added to the lease's accrual base at the period in which it was proven, and
the hub MUST NOT hand out leases whose projected accrual exceeds
`budgetUsd`. The requester tops up with a further offer for the same feed.

### 4.5 Private swarms

A `private` offer is an `ipfile` swarm. The seeder holds ciphertext and,
unless it also holds a grant, cannot read a byte of it. Where the manifest
has `keys.public` set the data is readable by anyone with the manifest, and
the offer is still `private` in this document's sense: what is being paid
for is storage of a specific swarm, and what the attestation says is that
the requester may store it. `personal` is the basis for a backup nobody else
is ever meant to read; the swarm's `pricing` SHOULD be zero and its manifest
SHOULD not be catalogued.

## 5. Leases

### 5.1 Record

```json
{
  "openswarm": "0.1",
  "type": "pay2seed.lease",
  "hub": "ed25519:c9f1…",
  "offer": "sha256:1b7f…",
  "seeder": "ed25519:a41e…",
  "slot": 1,
  "priceUsdPerGibMonth": "0.150000",
  "startsAt": "2026-09-05T18:30:00.000Z",
  "endsAt": "2026-10-05T18:00:00.000Z",
  "graceHours": 24,
  "createdAt": "2026-09-05T18:30:00.000Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:c9f1…", "sig": "…" }]
}
```

| Field | Rule |
| --- | --- |
| `offer` | Record id of the offer. |
| `seeder` | The seeder key. It MUST be a registered `ippay` payee (§6.4), which is where the money goes. |
| `slot` | 1-based, at most `offer.seeders.max`. A seeder holds at most one lease per offer. |
| `priceUsdPerGibMonth` | Copied from the offer at lease time so a later offer edit never changes what was agreed. |
| `graceHours` | Time from `startsAt` in which the seeder MUST pass its first proof, or the lease is `abandoned` and the slot reopens. Long enough to fetch the swarm. |

A lease is `fetching` until its first proof, `proven` while its most recent
period passed, `lapsed` when a period failed, `abandoned` after
`graceHours` without a first proof, `ended` at `endsAt`, and `voided` with
its offer.

### 5.2 Taking a lease

`POST /leases` with `{ "offer": <id>, "seeder": <key>, "sig" }`, `sig` by
the seeder key over `"openswarm:pay2seed:lease:v1" || offer id`. The hub
answers `201` with the lease, or `409` when the offer has no free slot or
this seeder already holds one, or `403` when the seeder's standing (§7.5)
is below the offer's or hub's floor.

A hub SHOULD hand out slots to seeders in order of standing, and MUST NOT
hand more than `seeders.max`. A seeder SHOULD NOT take a lease it cannot
serve within `graceHours`; an abandoned lease counts against standing.

## 6. Proof and settlement

### 6.1 Storage challenges

Once per period, a verifier named in the offer sends the seeder:

```json
{
  "openswarm": "0.1",
  "type": "pay2seed.challenge",
  "lease": "sha256:5c02…",
  "period": 7,
  "nonce": "1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f",
  "pieces": [17, 2048, 91, 4400],
  "deadline": "2026-09-07T12:10:00.000Z",
  "createdAt": "2026-09-07T12:00:00.000Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:c9f1…", "sig": "…" }]
}
```

The seeder answers within `deadline` with a proof:

```json
{
  "openswarm": "0.1",
  "type": "pay2seed.proof",
  "challenge": "sha256:9d3a…",
  "answers": ["sha256:…", "sha256:…", "sha256:…", "sha256:…"],
  "createdAt": "2026-09-07T12:00:04.000Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:a41e…", "sig": "…" }]
}
```

Each answer is `SHA-256(nonce || piece bytes)` for the piece at that index,
which a verifier that holds the piece hashes and a copy of the piece can
check, and which cannot be answered from the hash alone. A verifier that
does not hold the pieces (the hub, for a swarm it does not store) uses a
probe instead. `pieces` MUST be at least four indices chosen uniformly at
random per challenge; `deadline` MUST be at least ten minutes after
`createdAt`, which is enough to read four pieces from a spinning disk and
not enough to fetch them from the swarm.

### 6.2 Probes

A verifier connects to the seeder as an ordinary peer, over BEP 3 for a
vanilla torrent or the `ipfile` extension for a private swarm, and requests
the challenge's pieces. The seeder's ordinary serving is the proof; the
verifier records `{ "lease", "period", "pieces", "receivedBytes", "peer" }`
signed by its own key as the proof record's `answers` equivalent, with
`type` still `pay2seed.proof`. A probe MUST fetch from the seeder's own
announced address; a swarm being alive is not evidence that this seeder is
keeping it alive.

For a `private` swarm whose `pricing.perGib` is non-zero the verifier pays
vouchers for the probe like any leecher, and those vouchers are the seeder's
in the usual way. Hubs SHOULD prefer probes for public swarms, whose pieces
anyone can fetch, and challenges for private swarms they already pin.

### 6.3 Accrual and receipts

A lease earns, for each period in which its proof passed:

```
earnedUsd = priceUsdPerGibMonth * (sizeBytes / 2^30) * (everyHours / 720)
```

computed with integer arithmetic in micro-USD, rounding down. A failed or
missed period earns nothing and moves the lease to `lapsed`; two
consecutive failures end it and reopen the slot. Earned amounts are
credited to the seeder's `ippay` payee balance and reported with a receipt:

```json
{
  "openswarm": "0.1",
  "type": "pay2seed.receipt",
  "lease": "sha256:5c02…",
  "period": 7,
  "proof": "sha256:e77b…",
  "earnedUsd": "0.002604",
  "balanceUsd": "0.018228",
  "createdAt": "2026-09-07T12:00:05.000Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:c9f1…", "sig": "…" }]
}
```

The hub's fee is charged to the requester at purchase, `hubBps` of
`budgetUsd` with `hubBps` no less than the hub record's `minHubBps`; it is
never deducted from a seeder's earnings. Payout is `ippay` §5.6, on the
same schedule and floor as voucher earnings.

### 6.4 Payees

A seeder is an `ippay` payee (`ippay` §6.1). Registering once covers
vouchers, key grants and leases. A seeder key that is not registered cannot
take a lease, because there would be nowhere to pay.

## 7. The hub

### 7.1 Hub record

An `ippay.hub` record that offers this document adds:

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

`bases` is what this hub will list. `minStanding` is the floor for taking a
lease. A hub MAY run a market for private backups only, or for open data
only, by narrowing `bases`.

### 7.2 API

All bodies are JSON. Records are verified on receipt. Paths are relative to
`pay2seed.base`.

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `POST /attestations` | signed record | Register an attestation. `201` with its id, `409` if one is honoured for the subject by another key (§3.3). |
| `GET /attestations/<id>` | none | The record and `{ "status": "claimed|honoured|voided", "notices": n }`. |
| `POST /offers` | x402 + `X-OpenSwarm-Payer` | Buy an offer (§4.2). |
| `GET /offers?visibility&basis&minPrice&maxSize&feed&status` | none | The market: open offers with free slots, newest first, paged. |
| `GET /offers/<id>` | none | The offer, its status, leases held, slots free. |
| `DELETE /offers/<id>` | requester signed | Void and refund the unearned budget. |
| `POST /leases` | seeder signed | Take a slot (§5.2). |
| `GET /leases/<id>` | none | The lease, status, periods proven, `earnedUsd`. |
| `GET /seeders/<key>/leases?status` | none | A seeder's leases; what a client resumes after a restart. |
| `POST /proofs` | seeder or verifier signed | Answer a challenge or report a probe. Returns the receipt. |
| `GET /leases/<id>/challenges?since` | seeder | Pending challenges for a seeder that cannot receive them pushed. |
| `GET /seeders/<key>` | none | `{ "standing", "leases", "proven", "failed", "abandoned", "balanceUsd" }`. |
| `GET /requesters/<key>` | none | `{ "standing", "attestations", "voided", "offers" }`. |
| `POST /notices` | signed | A notice against an attestation (§9). |
| `POST /webhooks` | signed | Register a CloudEvents endpoint for a requester or seeder key. |

### 7.3 Delivering challenges

A hub pushes challenges to a seeder's registered webhook when it has one,
and otherwise leaves them to be polled from
`GET /leases/<id>/challenges`. A seeder without a webhook MUST poll at
least every `everyHours / 4` hours. `deadline` is measured from
`createdAt`, not from delivery, so a seeder that polls slowly fails
challenges; the cadence is the seeder's problem to meet.

### 7.4 The market listing

`GET /offers` is what a seeder client shows its operator, or chooses from
on its own. Each row carries the offer, the attestation's `basis`,
`description` and `visibility`, the free slot count, and the projected
`earnedUsd` for a full lease. A client MUST show `basis` and `visibility`
wherever it shows an offer, so an operator knows whether they are being
asked to hold ciphertext for a stranger's backup or to seed an openly
licensed dataset in the clear.

### 7.5 Standing

Seeder standing is `proven - 2 * failed - 3 * abandoned` over the trailing
year, floored at zero. Requester standing is `honoured - 3 * voided`, the
same way. Standing is public at `GET /seeders/<key>` and
`GET /requesters/<key>`, and portable in the sense that it is one hub's
opinion signed by that hub; a second hub MAY read it and MAY ignore it.

## 8. Client behaviour

A seeder client (torlink's headless daemon is the reference) does the
following, and a conformant one does all of it:

1. Holds a seeder key, registered as an `ippay` payee with a payout
   address, and stores the key as an OpenCreds `key` item.
2. Polls `GET /offers` on the hubs it is configured for, filtered by the
   operator's policy: which `visibility` and `basis` values to accept, the
   minimum `priceUsdPerGibMonth`, the maximum `sizeBytes`, free disk to keep
   in reserve.
3. Takes a lease, fetches the swarm (as a paying peer when `offer.pass` is
   set), adds the offer's `trackers`, and seeds with a per-torrent seed time
   of at least `lease.endsAt`, so the client's own reaper never drops a
   swarm it is being paid to keep.
4. Answers challenges from local pieces within `deadline`, and serves
   probes as ordinary peer traffic.
5. On restart, resumes every lease in `GET /seeders/<key>/leases?status=proven,fetching`
   before taking new ones.
6. Stops seeding and deletes the data when a lease ends or is voided, unless
   the operator has chosen to keep it; for a `private` swarm the ciphertext
   is worthless without a grant, and for a `personal` one it MUST be
   deleted.
7. Shows the operator, for every held lease, the `basis`, `visibility`,
   `earnedUsd` so far, and the next challenge due.

A requester client (`ip` CLI, a web app) makes the attestation, buys the
offer, and watches `GET /offers/<id>` or the events.

## 9. Notices and takedown

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
references it: leases end, seeders are told by event and by their next
poll, the requester is refunded the unearned budget less leases' accrued
earnings, and the requester's `voided` count rises. A hub that voids on
every notice without review is conformant; a hub that never voids is not.

For a `private` swarm the hub cannot inspect the content and does not
pretend to. What it has is the requester's identity, their attestation and
their standing, which is what accountability looks like for ciphertext.

## 10. Security notes

- **Sybil seeders.** One machine holding several leases on one offer under
  several keys earns several times for one copy. `seeders.max` bounds the
  loss; probes from distinct verifiers to the announced addresses, and a
  hub refusing leases to keys that share a payout address on the same
  offer, bound it further. Standing makes it expensive to repeat.
- **Answer relaying.** A seeder that holds nothing could fetch challenged
  pieces from the swarm within `deadline`. Ten minutes is the floor; a hub
  SHOULD set shorter deadlines for small swarms, and probes measure the
  seeder's own serving rather than what it can fetch.
- **Hub as escrow.** The budget sits with the hub. A requester trusts the
  hub with `budgetUsd` for `days`, as a pass buyer trusts it with `capUsd`
  for 30. A hub's signed receipts and refunds are its auditable trail.
- **Attestation is a claim.** §3.3's window, standing and notices are the
  defence. A hub that lists a public offer the moment it is paid is not
  conformant.
- **Private means ciphertext, not secret existence.** A lease reveals to
  its seeder the file key, the size and the requester's key. `personal`
  swarms SHOULD use a fresh unrelated file pair (core §4.2) so that backups
  are not linkable to a publisher's catalogue.

## 11. Relationship to `ipfile.pin`

An `ipfile.pin` job (c0mpute §3.1) is a `pay2seed.offer` with
`visibility: "private"`, `seeders.min = seeders.max = 1`, `days` and
`proof.everyHours` copied, `priceUsdPerGibMonth` derived from
`max_price_usd`, and c0mpute's storage challenge standing in for §6.1. A
c0mpute node that wins such a job holds a lease in this document's sense
and MAY report proofs to the hub to build standing there. A hub MAY
republish a `pay2seed.offer` as an `ipfile.pin` job on the c0mpute auction
when no other seeder takes it, which is how the market reaches the paid
storage network without the requester doing anything.

## 12. Events

CloudEvents as core §8, `source` the hub base:

| `type` | Data | Subscriber |
| --- | --- | --- |
| `pay2seed.attestation.registered`, `.honoured`, `.voided` | attestation id | requester |
| `pay2seed.offer.listed`, `.active`, `.settled`, `.voided` | offer id, status | requester, market followers |
| `pay2seed.lease.granted`, `.proven`, `.lapsed`, `.ended`, `.voided` | lease id, period, `earnedUsd` | seeder, requester |
| `pay2seed.challenge.issued` | the challenge record | seeder |
| `pay2seed.notice.received`, `.resolved` | notice id, outcome | requester |

## 13. Implementations

| Piece | Where | Status |
| --- | --- | --- |
| Reference hub: attestations, offers, leases, probes, market, notices | `profullstack/media-streamer` (bittorrented.com) | planned; the seedbox rental rail is the pay-per-pass half of it today |
| Seeder client: market polling, leases, per-lease seed time, challenges | `torlink` (`torlnk serve` and `watch`) | planned; per-torrent seed time landed as baairon/torlink#186 |
| Shared client and promo library | `@profullstack/pay2seed` | planned |
| Seeder and verifier on the storage network | `profullstack/c0mpute` via `ipfile.pin` | mapping in §11 |
| Requester CLI | `ip seed …` ([cli.md](./cli.md)) | proposed |

## 14. Conformance

A **hub** is conformant when it: refuses offers without an honoured
attestation (§3); enforces the basis table and claim window (§3.2, §3.3);
escrows the budget before listing (§4.2); issues at least one challenge or
probe per period and pays only proven periods (§6); publishes the market
and standing (§7); forwards and resolves notices within `claimHours` (§9).

A **seeder client** is conformant when it does all of §8.

A **requester client** is conformant when it makes an attestation the
signer actually holds the key for, buys offers only against it, and
receives notices at the `notice` endpoint it named.

## 15. Version history

- 0.1 (2026-09-05): first draft. Attestation with basis table and claim
  window; offers bought over x402 with escrowed budgets; leases with
  slots and grace; challenges and probes; GiB-month accrual and receipts;
  public feeds on `ipdb`; notices; the `ipfile.pin` mapping.
