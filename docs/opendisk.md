# OpenDisk

OpenDisk is one file a machine serves about the disk it will rent: how much is free, what a GiB-month costs, where the box is, what it will hold, how it proves it is still holding it, and where it is paid. A requester reads the disk's own file instead of a marketplace's listing, a directory lists every disk that serves one, and a peer with a spare terabyte is on the market by putting a file at a URL. It is the web-facing door onto an [OpenSwarm](/openswarm) `paid2seed` seeder, and it is what a peer-to-peer storage market is made of. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface, with [d1sks.com](https://d1sks.com) as the reference marketplace.

Status: **0.1**. A description of a file a marketplace will read, published so a peer can serve one and any directory can read it.

Slug: `opendisk`

## The problem

OpenSwarm already says how a seeder is paid to hold a swarm: a requester posts a `pay2seed` offer at a hub with money escrowed, a seeder takes a `paid2seed` lease, proves it holds the pieces every period, and is paid per GiB-month. What it does not say is how a requester finds a seeder before posting, or how a seeder is found at all. The market in `paid2seed` is one-sided: offers are listed and seeders poll them. A requester who wants a box in Germany with 2 TB free and a year of clean proofs has no file to read, and a seeder with those things has no file to serve.

Every other rentable thing has a listing. `/.well-known/` is where a host says things about itself. What is missing is the one file that puts a seeder's capacity, price and record where a requester can fetch it, in a shape every reader agrees on, so a disk can be found instead of waited for.

## Terms

- A **disk** is capacity somebody will rent: a peer's spare drive, a seedbox, a storage node, a provider's storage plan. Its **descriptor** is the file it serves about itself.
- The **seeder** is the OpenSwarm identity that takes leases for the disk and is paid. One disk, one seeder key.
- A **requester** is whoever wants bytes kept, as `pay2seed` defines it: a publisher, a person with a backup, an agent.
- A **marketplace** is a directory of disks that also fronts a hub, so a requester can read a disk and post the offer in one place. [d1sks.com](https://d1sks.com) is the reference.
- A **reader** is anything that reads a descriptor: a marketplace, a requester's client, a person's terminal, an agent.

## The descriptor

A disk serves a JSON document at `/.well-known/opendisk.json` on its own origin.

```json
{
  "name": "seeder-a41e, Falkenstein",
  "web": "https://seeder-a41e.example",
  "operator": "https://seeder-a41e.example/.well-known/openprofile.md",
  "key": "ed25519:a41e7f0c2d9b8e5a6f3c1d4e7b0a9f8c5d2e1b4a7c0f3e6d9b2a5c8e1f4d7b0a",
  "hubs": ["https://bittorrented.com/api/openswarm", "https://d1sks.com/api/openswarm"],
  "developer": {
    "cli": {
      "name": "ip",
      "install": { "curl": "curl -fsSL https://d1sks.com/install.sh | sh" },
      "docs": "https://d1sks.com/docs/cli"
    }
  },
  "updated": "2026-09-13T06:00:00Z",
  "capacity": { "total_gib": 3726, "free_gib": 2210, "reserved_gib": 200 },
  "price": {
    "currency": "USD",
    "per_gib_month": 0.12,
    "per_gib_transfer": 0.004,
    "min_gib": 1,
    "max_gib": 2000,
    "min_days": 7,
    "max_days": 365
  },
  "location": { "regions": ["fsn1"], "countries": ["DE"] },
  "network": { "bandwidth_mbps": 1000, "transfer_gb": 20000, "ipv4": 1, "ipv6": true },
  "storage": [{ "type": "hdd", "size_gb": 4000 }],
  "accepts": {
    "visibility": ["private", "public"],
    "bases": ["own", "licensed", "open-license", "public-domain", "personal"],
    "encrypted_only": false,
    "max_file_gib": 500,
    "feeds": true
  },
  "proof": { "kinds": ["challenge", "probe"], "every_hours_min": 6, "webhook": "https://seeder-a41e.example/openswarm/hooks" },
  "record": {
    "source": "https://bittorrented.com/api/openswarm/pay2seed/seeders/ed25519:a41e7f0c2d9b8e5a6f3c1d4e7b0a9f8c5d2e1b4a7c0f3e6d9b2a5c8e1f4d7b0a",
    "standing": 412,
    "proven": 418,
    "failed": 3,
    "abandoned": 0,
    "since": "2025-11-02T00:00:00Z"
  },
  "payout": { "payee": "ed25519:a41e7f0c2d9b8e5a6f3c1d4e7b0a9f8c5d2e1b4a7c0f3e6d9b2a5c8e1f4d7b0a", "network": "eip155:8453" },
  "holding": "https://seeder-a41e.example/openswarm/holding"
}
```

The smallest valid descriptor is a name, the free space and a price:

```json
{ "name": "spare drive, Lisbon", "capacity": { "free_gib": 900 }, "price": { "currency": "USD", "per_gib_month": 0.08 } }
```

The rules, and every one degrades:

1. **`name`, `capacity.free_gib` and `price.per_gib_month` are the only required keys.** A descriptor with those alone is valid: it is a disk, it has room, it has a price. A reader lists what it was given and reports the rest as unstated rather than assumed.
2. **`operator`** is the person or organisation answerable, as an [OpenProfile.md](/openprofile) URL. `web` is the disk's site, if it has one beyond the descriptor. A disk with no operator is listed as such, and a marketplace may decline to list it.
2a. **`developer`** is the block [OpenServer](/docs/openserver) 0.2 defines, unchanged: the CLI a requester uses to rent this disk and a seeder uses to run it (`cli.name`, `cli.install` keyed by package manager with the command as the guide prints it, `cli.docs`, `cli.repo`), plus `api_docs` and `github` where they exist. A disk usually names the client its hub ships, so a marketplace can show one install line beside every disk it lists; `"cli": null` says there is none.
3. **`key`** is the seeder's OpenSwarm identity, the key that signs `paid2seed` proofs and is registered as an `ippay` payee. **`hubs`** are the hubs it takes leases at. A requester posts its offer at one of them; a disk with no `hubs` is rented some other way, and `web` says how.
4. **`updated`** is when anything in the file last changed. `capacity.free_gib` changes with every lease, so a disk that is busy updates often and a reader with `updated` unchanged since its last fetch may skip the rest.
5. **`capacity`** is in GiB: `total_gib` the disk, `free_gib` what a new lease can have now, `reserved_gib` what the operator keeps back. `free_gib` is the number that matters and the only one required.
6. **`price`** is one price list. `per_gib_month` is what one GiB held for thirty days costs, pro rata, the same unit `pay2seed` offers are priced in. `per_gib_transfer` is what serving one GiB costs on top, or absent when serving is included; a disk that prices transfer in more detail does so as [OpenBandwidth](/docs/openbandwidth) describes and keeps this one number as the summary. `min_gib`, `max_gib`, `min_days`, `max_days` bound a lease. `currency` is ISO 4217.
7. **`location`, `network`, `storage`** are as [OpenServer](/openserver) defines them, the same keys and the same units, so a directory that already reads an OpenServer storage block reads this one: the provider's own region names and ISO country codes, megabits and gigabytes, one `storage` entry per drive with `type` `nvme`, `ssd` or `hdd`. A requester choosing a disk for a backup wants the country; one choosing a seed for a release wants the bandwidth.
8. **`accepts`** is the operator's policy, the same policy a `paid2seed` seeder client applies when it polls a market, stated up front so a requester does not post an offer this disk would never take. `visibility` and `bases` are `pay2seed`'s lists. `encrypted_only: true` means the disk holds `ipfile` ciphertext and nothing else. `max_file_gib` caps one swarm. `feeds` says whether it follows `ipdb` feeds and keeps their segments.
9. **`proof`** is how the disk expects to be checked: `kinds` any of `challenge` and `probe` as `paid2seed` §4 defines them, `every_hours_min` the shortest period it will accept, `webhook` where a hub pushes challenges so the disk need not poll.
10. **`record`** is the disk's history, and its `source` is the hub's own `GET /seeders/<key>` for this seeder. The numbers are copied from there for a reader's convenience; the hub's answer wins, and a marketplace reads the hub rather than the file for anything it ranks on.
11. **`payout`** names the `ippay` payee and the network it is paid on. The address itself lives at the hub, registered by the seeder key, and this file never carries it.
12. **`holding`** is a URL that answers with what the disk holds right now, or the same list inline. The shape is below.
13. **Unknown keys are kept.** A disk says more than this document names, and a reader passes it through under the disk's own key.

Serve it as `application/json`. The descriptor is a claim; that it came from the disk's own origin is one verification, and the hub's record under `key` is the other.

## Holding

The other half of a `holders` list in [OpenFile](/openfile): what one disk is holding, from the disk's side.

```json
{
  "updated": "2026-09-13T06:14:02Z",
  "holding": [
    { "id": "sha256:d6c3f828…c493ff", "swarm": "sha256:4b74eb43…c7a342", "lease": "sha256:5c02…", "gib": 0.68, "since": "2026-09-05T18:30:00Z", "until": "2026-10-05T18:00:00Z", "provenAt": "2026-09-13T06:00:05Z" },
    { "id": "sha256:1f9e…", "swarm": "sha256:88c0…", "lease": "sha256:0e4d…", "gib": 122.4, "since": "2026-08-01T00:00:00Z", "until": "2027-08-01T00:00:00Z", "provenAt": "2026-09-13T00:00:02Z" }
  ]
}
```

`id` is the OpenFile content hash when the disk knows it, `swarm` the `infohashV2`, `lease` the `paid2seed` lease. A private swarm's `id` is its `plainRoot` from the manifest, which reveals nothing about the bytes; a disk holding `personal` swarms omits them from the public list, because a backup's existence is the requester's to announce.

## Renting a disk

A requester that has read a descriptor and wants the disk:

1. Checks `accepts` against what it wants kept, and `record.source` at the hub for the disk's standing.
2. Makes its attestation, as `pay2seed` §3 requires, and posts a `pay2seed.offer` at one of the disk's `hubs` with `priceUsdPerGibMonth` at or above `price.per_gib_month` and `seeders.min` of one.
3. Waits for the disk's seeder client to take the lease, which it does on its next poll or at once if the hub pushes to `proof.webhook`.
4. Watches the lease as `pay2seed` §7 says: proven periods, spend against the budget, the next challenge due.

A marketplace collapses those into one act: read the disk, post the offer, and show the lease when it lands. A requester that wants several disks posts one offer with `seeders.min` above one and lets the hub fill it, or reads several descriptors and posts to each. Nothing in the swarm side changes: leases, challenges, probes, receipts and payout are `paid2seed` exactly as written.

## Marketplaces

A marketplace reading descriptors:

1. **Fetches on a schedule, hourly at least**, because `free_gib` moves. A disk that has told the marketplace its `updated` has not changed is skipped.
2. **Dedupes on `key`.** One seeder identity is one disk, whatever URL its descriptor was found at. A descriptor with no `key` dedupes on its origin.
3. **Reads standing from the hub**, never from the file, for anything it sorts or filters by. The file says where; the hub says how much.
4. **Lists a disk's policy beside its price**, so a requester sees that a cheap disk takes public swarms only, or ciphertext only, before it posts.
5. **Marks a disk gone, not deleted**, when its descriptor stops answering, and shows the leases it still holds until they end.
6. **Reports absence as absence.** An unstated operator is unstated. An unstated `accepts` means the disk will say when the offer arrives.

[d1sks.com](https://d1sks.com) is the reference marketplace: a directory of every OpenDisk descriptor it has read, standing pulled from the hubs each disk names, and an offer form that posts to the disk's hub. [nichedb.dev](https://nichedb.dev) lists every disk in its hosting collection as an OpenServer offer, by the mapping below.

## As an OpenServer offer

A disk is a hosting offer, and a directory that reads [OpenServer](/openserver) descriptors lists it as one without a second parser:

| OpenServer | from OpenDisk |
|---|---|
| `provider.name`, `provider.web`, `provider.operator`, `provider.country` | `name`, `web`, `operator`, `location.countries[0]` |
| `offers[].id` | `key`, or the descriptor's origin when there is no key |
| `offers[].name` | `name` |
| `offers[].url` | the descriptor's URL |
| `offers[].kind` | `storage` |
| `offers[].premises`, `management`, `tenancy` | `off-prem`, `unmanaged`, `shared` |
| `offers[].model` | `p2p` when the operator is a person or a peer, `centralized` when it is a provider; the disk may state `model` itself and that wins |
| `offers[].location`, `network`, `storage` | the same keys, unchanged |
| `offers[].price` | `{ "amount": price.per_gib_month, "currency": price.currency, "interval": "month", "unit": "gib" }`, `unit` kept as the provider's own key |
| `offers[].stock` | `in_stock` when `free_gib` is at least `price.min_gib`, else `out_of_stock` |
| `offers[].updated` | `updated` |

A provider that sells storage plans and rents disk to swarms serves both files: an OpenServer descriptor for its plans and an OpenDisk descriptor for what a seeder can lease. A peer with one drive serves only this one, and is listed in both places.

## What is deliberately absent

**No lease in this file.** Leases, proofs, receipts and payout are `paid2seed`, and this document does not restate them. The descriptor is the ask; the offer is the bid; the lease is the match, and it is made at the hub.

**No escrow at the disk.** Money sits at a hub, as `pay2seed` says. A disk never holds a requester's funds and never has to be trusted with them.

**No reputation of its own.** `record` is a copy of what a hub signed, and a marketplace reads the hub. A disk that claims a standing its hub does not confirm is listed with the hub's number.

**No plaintext.** A disk holds what `accepts` says, and by default that is `ipfile` ciphertext it cannot read. A `personal` swarm's existence is not in the public `holding` list.

**No central registry.** Anyone may serve a descriptor and anyone may read it. d1sks.com is one marketplace among any number, and two marketplaces reading the same file list the same disk.

## Serving one

By hand, or by the seeder client. `torlnk serve` and a c0mpute node with `--openswarm` have every number this file needs: free space is the filesystem, the price and policy are the operator's configuration, the record is the hub's. Write it to the web root next to `robots.txt` and rewrite it when a lease starts or ends.

## Related standards

- [OpenSwarm](/openswarm): `pay2seed` for the offer and the attestation, `paid2seed` for leases, proofs, receipts and standing, `ippay` for the payee, `ipfile` for what is held.
- [OpenFile](/openfile): the publisher's side, and the `holders` list a disk appears in.
- [OpenServer](/openserver): the hosting offer a disk maps onto, and the units this document borrows.
- [OpenProfile.md](/openprofile): the `operator` behind a disk.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the descriptor, holding, renting a disk, marketplaces, the OpenServer mapping. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
