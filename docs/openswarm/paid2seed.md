# paid2seed: The Server Protocol for Paid Seeding

Status: 0.1 draft. Member of the [OpenSwarm](../openswarm.md) family.
Depends on the [core](./spec.md), [`ipfile`](./ipfile.md) and
[`ippay`](./ippay.md). Its client half is [`pay2seed`](./pay2seed.md).

## 1. Scope

`paid2seed` is the side that gets paid. It is spoken by a seeder, a
BitTorrent client with disk and uptime to sell, to a hub over HTTPS and to
the swarm over the ordinary wire. It defines:

- **Leases.** The hub's binding of one seeder to one `pay2seed.offer` for
  one period at one price.
- **Proof of seeding.** Storage challenges answered from held pieces, and
  probes in which a verifier fetches pieces over BEP 3 or the `ipfile`
  extension. Both work on a vanilla torrent, which is what makes seeding
  a public swarm payable.
- **Settlement.** GiB-month accrual per proven period, receipts, and
  payout through the `ippay` payee a seeder already has for vouchers.
- **The seeder client**: how a torrent client polls a market, takes work,
  seeds it, proves it, and resumes after a restart. torlink's headless
  daemon is the reference.

Consent, offers, the requester's view and notices are
[`pay2seed`](./pay2seed.md). A hub implements both. A seeder client
implements only this document.

### Non-goals

Anything about what the data is. A seeder sees an infohash or a file key,
a size, a basis and a visibility, and decides whether to hold it. It is
never asked to judge it and never able to read a private swarm.

## 2. Terminology

- **Seeder.** An identity that holds a lease and serves the swarm.
- **Verifier.** Whoever issues challenges and probes: the hub, a c0mpute
  verifier node, or the requester. The offer names who may.
- **Lease.** One seeder's share of an offer (§3). **Period.** The unit of
  accrual and proof, `offer.proof.everyHours` long.
- Other terms as `pay2seed` §2.

## 3. Leases

### 3.1 Record

```json
{
  "openswarm": "0.1",
  "type": "paid2seed.lease",
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
| `offer` | Record id of the `pay2seed.offer`. |
| `seeder` | The seeder key. MUST be a registered `ippay` payee (§5.4). |
| `slot` | 1-based, at most `offer.seeders.max`. One lease per seeder per offer. |
| `priceUsdPerGibMonth` | Copied from the offer at lease time so a later edit never changes what was agreed. |
| `graceHours` | Time from `startsAt` in which the seeder MUST pass its first proof, or the lease is `abandoned` and the slot reopens. Long enough to fetch the swarm. |

A lease is `fetching` until its first proof, `proven` while its most recent
period passed, `lapsed` when a period failed, `abandoned` after
`graceHours` without a first proof, `ended` at `endsAt`, and `voided` with
its offer.

### 3.2 Taking and losing a lease

`POST /leases` with `{ "offer": <id>, "seeder": <key>, "sig" }`, `sig` by
the seeder key over `"openswarm:paid2seed:lease:v1" || offer id`. The hub
answers `201` with the lease, `409` when the offer has no free slot or this
seeder already holds one, or `403` when the seeder's standing (§6.3) is
below the offer's or hub's floor.

A hub SHOULD hand out slots in order of standing and MUST NOT hand out
more than `seeders.max`. A seeder SHOULD NOT take a lease it cannot serve
within `graceHours`; an abandoned lease counts against standing. When an
offer is voided (`pay2seed` §8) every lease on it is `voided`, the hub
pushes `paid2seed.lease.voided`, and a seeder learns of it on its next
poll at the latest.

## 4. Proof of seeding

### 4.1 Storage challenges

Once per period, a verifier named in the offer sends the seeder:

```json
{
  "openswarm": "0.1",
  "type": "paid2seed.challenge",
  "lease": "sha256:5c02…",
  "period": 7,
  "nonce": "1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f",
  "pieces": [17, 2048, 91, 4400],
  "deadline": "2026-09-07T12:10:00.000Z",
  "createdAt": "2026-09-07T12:00:00.000Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:c9f1…", "sig": "…" }]
}
```

The seeder answers within `deadline`:

```json
{
  "openswarm": "0.1",
  "type": "paid2seed.proof",
  "challenge": "sha256:9d3a…",
  "answers": ["sha256:…", "sha256:…", "sha256:…", "sha256:…"],
  "createdAt": "2026-09-07T12:00:04.000Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:a41e…", "sig": "…" }]
}
```

Each answer is `SHA-256(nonce || piece bytes)` for the piece at that index,
which a verifier holding a copy can check and which cannot be answered
from the piece hash alone. `pieces` MUST be at least four indices chosen
uniformly at random per challenge; `deadline` MUST be at least ten minutes
after `createdAt`, enough to read four pieces from a spinning disk and not
enough to fetch them from the swarm.

### 4.2 Probes

A verifier connects to the seeder as an ordinary peer, over BEP 3 for a
vanilla torrent or the `ipfile` extension for a private swarm, and requests
the challenge's pieces. The seeder's ordinary serving is the proof; the
verifier records `{ "lease", "period", "pieces", "receivedBytes", "peer" }`
signed by its own key, `type` still `paid2seed.proof`. A probe MUST fetch
from the seeder's own announced address; a swarm being alive is not
evidence that this seeder is keeping it alive.

For a `private` swarm whose `pricing.perGib` is non-zero the verifier pays
vouchers for the probe like any leecher, and those are the seeder's in the
usual way. Hubs SHOULD prefer probes for public swarms and challenges for
private swarms they already pin.

### 4.3 Delivery

A hub pushes challenges to a seeder's registered webhook when it has one,
and otherwise leaves them to be polled from `GET /leases/<id>/challenges`.
A seeder without a webhook MUST poll at least every `everyHours / 4`
hours. `deadline` is measured from `createdAt`, not delivery, so a seeder
that polls slowly fails challenges; the cadence is the seeder's to meet.

## 5. Settlement

### 5.1 Accrual

A lease earns, for each period in which its proof passed:

```
earnedUsd = priceUsdPerGibMonth * (sizeBytes / 2^30) * (everyHours / 720)
```

in integer micro-USD, rounding down. A failed or missed period earns
nothing and moves the lease to `lapsed`; two consecutive failures end it
and reopen the slot.

### 5.2 Receipts

```json
{
  "openswarm": "0.1",
  "type": "paid2seed.receipt",
  "lease": "sha256:5c02…",
  "period": 7,
  "proof": "sha256:e77b…",
  "earnedUsd": "0.002604",
  "balanceUsd": "0.018228",
  "createdAt": "2026-09-07T12:00:05.000Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:c9f1…", "sig": "…" }]
}
```

### 5.3 Fees and payout

The hub's fee is charged to the requester at purchase, `hubBps` of
`budgetUsd` with `hubBps` no less than the hub record's `minHubBps`; it is
never deducted from a seeder's earnings. Payout is `ippay` §5.6, on the
same schedule and floor as voucher earnings.

### 5.4 Payees

A seeder is an `ippay` payee (`ippay` §6.1). Registering once covers
vouchers, key grants and leases. A seeder key that is not registered
cannot take a lease, because there would be nowhere to pay.

## 6. The seeder's hub

### 6.1 API, seeder side

Paths relative to the `pay2seed.base` in the hub record (`pay2seed`
§6.1). The requester side is `pay2seed` §6.2.

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /offers?visibility&basis&minPrice&maxSize&feed&status` | none | The market: open offers with free slots. |
| `POST /leases` | seeder signed | Take a slot (§3.2). |
| `GET /leases/<id>` | none | The lease, status, periods proven, `earnedUsd`. |
| `GET /seeders/<key>/leases?status` | none | A seeder's leases; what a client resumes after a restart. |
| `GET /leases/<id>/challenges?since` | seeder | Pending challenges for a seeder that cannot receive them pushed. |
| `POST /proofs` | seeder or verifier signed | Answer a challenge or report a probe. Returns the receipt. |
| `GET /seeders/<key>` | none | `{ "standing", "leases", "proven", "failed", "abandoned", "balanceUsd" }`. |
| `POST /webhooks` | signed | Register a CloudEvents endpoint for a seeder key. |

### 6.2 The market listing

`GET /offers` is what a seeder client shows its operator, or chooses from
on its own. Each row carries the offer, the attestation's `basis`,
`description` and `visibility`, the free slot count, and the projected
`earnedUsd` for a full lease. A client MUST show `basis` and `visibility`
wherever it shows an offer, so an operator knows whether they are being
asked to hold ciphertext for a stranger's backup or to seed an openly
licensed dataset in the clear.

### 6.3 Standing

Seeder standing is `proven - 2 * failed - 3 * abandoned` over the trailing
year, floored at zero. Requester standing is `honoured - 3 * voided`, the
same way. Both are public and are one hub's opinion signed by that hub; a
second hub MAY read it and MAY ignore it.

## 7. Seeder client behaviour

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
   of at least `lease.endsAt`, so its own reaper never drops a swarm it is
   being paid to keep.
4. For a feed offer, follows the feed (`ipdb` §5.4), fetches each new
   segment within one period of its appearance in the head, seeds all of
   them, and re-announces the head as a BEP 44 mutable item at least once
   per period so the catalogue stays findable when the publisher is
   offline.
5. Answers challenges from local pieces within `deadline`, and serves
   probes as ordinary peer traffic.
6. On restart, resumes every lease in
   `GET /seeders/<key>/leases?status=proven,fetching` before taking new ones.
7. Stops seeding and deletes the data when a lease ends or is voided,
   unless the operator has chosen to keep it; for a `private` swarm the
   ciphertext is worthless without a grant, and for a `personal` one it
   MUST be deleted.
8. Shows the operator, for every held lease, the `basis`, `visibility`,
   `earnedUsd` so far, and the next challenge due.

## 8. Relationship to `ipfile.pin`

An `ipfile.pin` job (c0mpute §3.1) is a `pay2seed.offer` with
`visibility: "private"`, `seeders.min = seeders.max = 1`, `days` and
`proof.everyHours` copied, `priceUsdPerGibMonth` derived from
`max_price_usd`, and c0mpute's storage challenge standing in for §4.1. A
c0mpute node that wins such a job holds a lease in this document's sense
and MAY report proofs to the hub to build standing there. A hub MAY
republish a `pay2seed.offer` as an `ipfile.pin` job on the c0mpute auction
when no other seeder takes it, which is how the market reaches the paid
storage network without the requester doing anything.

## 9. Events

CloudEvents as core §8, `source` the hub base:

| `type` | Data | Subscriber |
| --- | --- | --- |
| `pay2seed.attestation.registered`, `.honoured`, `.voided` | attestation id | requester |
| `pay2seed.offer.listed`, `.active`, `.settled`, `.voided` | offer id, status | requester, market followers |
| `paid2seed.lease.granted`, `.proven`, `.lapsed`, `.ended`, `.voided` | lease id, period, `earnedUsd` | seeder, requester |
| `paid2seed.challenge.issued` | the challenge record | seeder |
| `pay2seed.notice.received`, `.resolved` | notice id, outcome | requester |

## 10. Security notes

- **Sybil seeders.** One machine holding several leases on one offer under
  several keys earns several times for one copy. `seeders.max` bounds the
  loss; probes from distinct verifiers to the announced addresses, and a
  hub refusing leases to keys that share a payout address on one offer,
  bound it further. Standing makes it expensive to repeat.
- **Answer relaying.** A seeder that holds nothing could fetch challenged
  pieces from the swarm within `deadline`. Ten minutes is the floor; a hub
  SHOULD set shorter deadlines for small swarms, and probes measure the
  seeder's own serving rather than what it can fetch.
- **Payout addresses are the identity that matters.** A seeder key is
  cheap; the address it pays to is where a hub's Sybil checks bite.

## 11. Implementations

| Piece | Where | Status |
| --- | --- | --- |
| Reference hub, seeder side: leases, challenges, probes, receipts, standing | `profullstack/media-streamer` (bittorrented.com) | planned |
| Seeder client: market polling, leases, per-lease seed time, challenges | `torlink` (`torlnk serve` and `watch`) | planned; per-torrent seed time landed as baairon/torlink#186 |
| Shared seeder client and records | `@profullstack/pay2seed` | planned |
| Seeder and verifier on the storage network | `profullstack/c0mpute` via `ipfile.pin` | mapping in §8 |

## 12. Conformance

A **hub** is conformant on this side when it hands out leases as §3,
issues at least one challenge or probe per period and pays only proven
periods (§4, §5), and publishes seeder standing (§6.3). It MUST also be
conformant to `pay2seed`.

A **seeder client** is conformant when it does all of §7.

## 13. Version history

- 0.1 (2026-09-06): split out of the first pay2seed draft (2026-09-05) as
  the server half; leases, challenges and probes, accrual and receipts,
  the seeder API and client, the `ipfile.pin` mapping.
