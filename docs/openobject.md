# OpenObject

OpenObject is a bucket you can mount. It is one file a store serves about the object storage it runs, one record for a bucket, one record per object, and the rules that turn a pile of rented disks into a place where keyed objects are kept at a stated redundancy, verified every period, repaired when a disk fails, and read back by path from anywhere. The disks are [OpenDisk](/opendisk) disks paid under [OpenSwarm](/openswarm) leases; the bytes on them are `ipfile` ciphertext the owner alone can read; the store is whoever keeps the index and posts the offers. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface, with [d1sks.com](https://d1sks.com) as the reference store, running every bucket at three replicas by default.

Status: **0.1**. A description of the shape a store, a client and a mount agree on, published so a bucket can move between stores and a disk can hold objects for any of them.

Slug: `openobject`

## The problem

The pieces under this document already exist. `pay2seed` says how one swarm is paid to be held, `paid2seed` says how a holder proves it still holds it, OpenDisk says how a disk is found, OpenFile says how a publisher lists the files it has released. c0mpute hosts files as blake3-addressed objects behind Reed-Solomon 10 data and 4 parity shards, on its own network, through its own routes.

What none of them says is what an application needs: a bucket with a name, a thousand keys under it that change, a promise that each object is on three different machines in two different countries, a read by key that comes back verified, a list by prefix, a version history, and a mount so a process can open `/data/photos/2026/09/a.jpg` without knowing any of the above. Every store that has built this has built it once, for itself, in a shape only its own client reads. OpenObject is that shape written down, so a bucket at one store is the same bucket at another, and a disk holding objects for one store is holding the same records for all of them.

## Terms

- A **store** is the service that keeps a bucket's index, places its objects on disks, watches their proofs and repairs them. It is a gateway, not a holder; it may hold nothing itself. [d1sks.com](https://d1sks.com) is the reference. Its **descriptor** is the file it serves about itself.
- A **bucket** is a named set of objects under one key, with one placement policy. The bucket key signs the index.
- An **object** is bytes under a **key**, where a key is a UTF-8 path such as `photos/2026/09/a.jpg`. An object has **revisions**; the newest is what a plain read returns.
- A **disk** is an OpenDisk disk. A **holder** is a disk holding one object under a `paid2seed` lease.
- The **policy** is the redundancy a bucket asks for: `replicas` (every holder has the whole object) or `erasure` (every holder has one shard).
- A **mount** is a file-system view of a bucket on a client machine, or inside an [OpenSlice](/openslice) slice.
- The **owner** is who holds the bucket key and the content keys, and whose escrow at a hub pays the disks.

## The store descriptor

A store serves a JSON document at `/.well-known/openobject.json` on its own origin.

```json
{
  "name": "d1sks.com",
  "web": "https://d1sks.com",
  "operator": "https://profullstack.com/.well-known/openprofile.md",
  "key": "ed25519:7c02e4a19f5d3b8c6e1a0f4d7b2c9e8a5f3d1c0b4e7a6f9d2c5b8e1a4f7d0c3b",
  "api": "https://d1sks.com/openobject/v1",
  "hubs": ["https://d1sks.com/api/openswarm", "https://bittorrented.com/api/openswarm"],
  "disks": "https://d1sks.com/api/disks",
  "developer": {
    "cli": {
      "name": "ip",
      "install": { "curl": "curl -fsSL https://d1sks.com/install.sh | sh" },
      "docs": "https://d1sks.com/docs/cli"
    },
    "api_docs": "https://d1sks.com/docs/openobject"
  },
  "updated": "2026-09-21T06:00:00Z",
  "policies": [
    { "id": "3x", "mode": "replicas", "replicas": 3, "min_operators": 3, "min_countries": 2, "default": true },
    { "id": "2x", "mode": "replicas", "replicas": 2, "min_operators": 2 },
    { "id": "rs-10-4", "mode": "erasure", "k": 10, "parity": 4, "min_operators": 14 }
  ],
  "price": {
    "currency": "USD",
    "per_gib_month": { "3x": 0.036, "2x": 0.024, "rs-10-4": 0.017 },
    "per_gib_transfer": 0.005,
    "per_10k_ops": 0.004,
    "min_gib": 0,
    "max_object_gib": 500
  },
  "location": { "countries": ["DE", "FI", "US", "PT", "SG"] },
  "capacity": { "free_gib": 184000, "disks": 412 },
  "accepts": { "encryption": ["owner", "store"], "versioning": true, "public_reads": true, "mounts": ["fuse", "nfs", "webdav", "s3"] },
  "proof": { "every_hours": 6, "repair_within_hours": 24 },
  "record": { "source": "https://d1sks.com/api/openswarm/pay2seed/requesters/ed25519:7c02…0c3b", "buckets": 1930, "objects": 41200000, "lost": 0, "since": "2026-09-13T00:00:00Z" },
  "s3": "https://s3.d1sks.com"
}
```

The smallest valid descriptor is a name, an API and one policy:

```json
{ "name": "spare closet", "api": "https://closet.example/openobject/v1", "policies": [{ "id": "3x", "mode": "replicas", "replicas": 3 }] }
```

The rules, and every one degrades:

1. **`name`, `api` and one entry in `policies` are the only required keys.** A reader lists what it was given and reports the rest as unstated.
2. **`operator`** is who is answerable, as an [OpenProfile.md](/openprofile) URL. **`key`** is the store's OpenSwarm identity, the requester key it posts `pay2seed` offers under and the key a disk sees on every lease. **`hubs`** are where it posts. A store with no key is a store that places nothing and only indexes; `api` says what it does.
3. **`disks`** is where the store's pool is listed: a URL answering with the OpenDisk descriptors it places onto, or the descriptors inline. An owner reads the pool before trusting a policy that promises three operators.
4. **`developer`** is the block [OpenServer](/docs/openserver) 0.2 defines, unchanged.
5. **`policies`** are what the store will run. `mode` is `replicas` or `erasure`. For `replicas`, `replicas` is how many holders each have the whole object. For `erasure`, `k` data shards and `parity` shards, one per holder, and any `k` rebuild the object. `min_operators` and `min_countries` are floors on distinctness across a policy's holders, counted on the disks' `operator` and `location.countries`. One policy is `default: true`; a bucket that names none gets it. **Three replicas on three operators in two countries is the policy this document means by "3x", and it is the reference store's default.**
6. **`price`** is per policy for keeping, one number for serving and one for operations. `per_gib_month` for a policy is what the owner pays per GiB of plaintext, so a `3x` price already covers three disks; a store passes the disks' `per_gib_month` through with its margin. `per_10k_ops` prices index operations (PUT, DELETE, LIST); reads of bytes are `per_gib_transfer`. `max_object_gib` caps one object.
7. **`location`** and **`capacity`** are the pool summarised: the countries its disks are in and the free GiB across them. `capacity.disks` is the count.
8. **`accepts`** is policy. `encryption: owner` means the owner encrypts before upload and the store never has a content key; `store` means the store holds keys for the owner, which is what a public bucket or an S3 client needs. `mounts` lists what the store can serve a bucket as.
9. **`proof`** is the cadence the store leases at (`pay2seed` `proof.everyHours`) and the longest it lets an object stay below policy before a replacement holder has been leased.
10. **`record`** is the store's standing as a requester at its hubs, `source` the hub's own page; the numbers are copied for convenience and a reader that ranks on them reads the hub. `lost` is objects that went below the read threshold, ever, and a store that has lost one says so.
11. **`s3`** is an S3-compatible endpoint when the store serves one, see below.
12. **Unknown keys are kept.**

Serve it as `application/json`. The descriptor is a claim; that it came from the store's own origin is one verification, and the hub's record under `key` is the other.

## The bucket

A bucket is a record the store keeps at `<api>/b/<bucket>` and the owner may keep anywhere.

```json
{
  "openobject": "0.1",
  "type": "openobject.bucket",
  "id": "ed25519:3a9f0c2e7d1b5a8c4f6e2d0b9a7c1e3f5d8b0a2c4e6f8d1b3a5c7e9f0d2b4a6c",
  "name": "photos",
  "owner": "https://ana.example/.well-known/openprofile.md",
  "store": "https://d1sks.com/openobject/v1",
  "policy": { "id": "3x", "mode": "replicas", "replicas": 3, "min_operators": 3, "min_countries": 2 },
  "encryption": { "by": "owner", "box": "x25519:4c40…18c3" },
  "versioning": { "keep": 10, "days": 90 },
  "public": false,
  "index": "ed25519:3a9f…4a6c/index",
  "budget": { "hub": "https://d1sks.com/api/openswarm", "payment": { "network": "eip155:8453" } },
  "created": "2026-09-13T10:00:00Z",
  "updated": "2026-09-21T06:14:02Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:3a9f…4a6c", "sig": "…" }]
}
```

1. **`id`** is the bucket key, an Ed25519 public key. The bucket is whoever holds the private half. Names are per owner and per store; the key is what a disk, a hub and a second store agree on.
2. **`policy`** is one of the store's policies, copied in full at creation so the bucket carries its own promise when it moves.
3. **`encryption.by`** is `owner` or `store`. With `owner`, each object is an `ipfile` swarm whose per-file key is derived from a bucket master key the owner holds, `keyDerivation: derived` as `ipfile` defines it, and `box` is the bucket's X25519 key that grants are boxed to. With `store`, the store holds the master key and serves plaintext to authorised readers.
4. **`versioning`** keeps the last `keep` revisions of a key or those newer than `days`, whichever is more. `{ "keep": 1 }` is a bucket with no history. A revision kept is a revision still leased and paid for.
5. **`public: true`** means any reader may GET and LIST without credentials. A public bucket is `encryption: store` or holds plaintext swarms.
6. **`index`** is an `ipdb` feed under the bucket key: the append-only log of object records, one entry per revision and per tombstone. A store replicates it; a second store rebuilds the bucket from it; a mount follows it.
7. **`budget`** names the hub and network the owner's escrow sits at. The store spends it on leases and repairs under `pay2seed` as the owner's delegate, and the hub's ledger for the requester is the bill.

## The object

One record per revision, appended to the index and returned by `HEAD`.

```json
{
  "openobject": "0.1",
  "type": "openobject.object",
  "bucket": "ed25519:3a9f…4a6c",
  "key": "photos/2026/09/a.jpg",
  "rev": 3,
  "seq": 48211,
  "id": "sha256:d6c3f8285b7871d6a400cba14408288a9acde679f12e1e7dc276f29ca7c493ff",
  "size": 4194304,
  "contentType": "image/jpeg",
  "meta": { "camera": "X100VI" },
  "swarm": { "manifest": "sha256:9ab1…", "infohashV2": "sha256:4b74…a342", "cipherRoot": "sha256:ba8c…6f7a" },
  "inline": null,
  "policy": { "mode": "replicas", "replicas": 3 },
  "holders": [
    { "disk": "ed25519:a41e…7b0a", "lease": "sha256:5c02…", "since": "2026-09-20T18:30:00Z", "provenAt": "2026-09-21T06:00:05Z", "shard": null },
    { "disk": "ed25519:9d3c…11ef", "lease": "sha256:71aa…", "since": "2026-09-20T18:30:04Z", "provenAt": "2026-09-21T06:00:09Z", "shard": null },
    { "disk": "ed25519:02be…c8d0", "lease": "sha256:c3f0…", "since": "2026-09-20T18:30:07Z", "provenAt": "2026-09-21T05:59:58Z", "shard": null }
  ],
  "state": "healthy",
  "tombstone": false,
  "created": "2026-09-20T18:29:51Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:3a9f…4a6c", "sig": "…" }]
}
```

1. **`key`** is the path. `/` separates segments, a key never starts with `/`, and there are no directories: a prefix that other keys share is listed as one, and that is all a directory is.
2. **`rev`** counts revisions of this key from 1. **`seq`** is the entry's position in the bucket's index and is the bucket's clock: the record with the higher `seq` is the newer statement about a key, whoever wrote it and whenever it was signed.
3. **`id`** is the SHA-256 of the plaintext, the `plainRoot` of the swarm, and the object's ETag. Two revisions with one `id` are one swarm held once, so a rewrite of unchanged bytes costs an index entry and nothing else.
4. **`swarm`** names the `ipfile` manifest the bytes live in. An object of `size` under 65,536 bytes may instead be carried in **`inline`**, base64 in the index entry, with no swarm and no holders; the index's own replication is its redundancy. A store may pack many small objects into one swarm and record `swarm.range` for each; the record still carries its own `id`.
5. **`holders`** are the disks under lease, one per replica or per shard, `shard` the shard index in erasure mode. `provenAt` is the last proof the store saw, from `paid2seed` receipts.
6. **`state`** is `healthy` when every holder the policy asks for is leased and proven within `proof.every_hours`; `degraded` when fewer are but the object can still be read (at least one replica, or at least `k` shards); `lost` below that; `pending` before the first proof. A read of a `degraded` object succeeds; a store reports the state on every `HEAD`.
7. **`tombstone: true`** is a deletion: the newest record for a key says there is no object. Earlier revisions stay readable by `rev` until `versioning` lets them go.
8. The record is signed by the bucket key when the owner wrote it and by the store key when the store did on the owner's behalf; either is valid, and a reader that finds neither treats the record as hearsay.

## Placement

What the policy means, and what the store must do to say `healthy`:

1. **Distinct disks.** Every holder is a different OpenDisk `key`. Never two replicas on one seeder.
2. **Distinct operators**, at least `min_operators`, counted on the disks' `operator`; a disk with no operator counts as its own and no more.
3. **Distinct countries**, at least `min_countries`, counted on `location.countries`.
4. **Offers, not uploads.** The store posts one `pay2seed` offer per object with `seeders.min` set to `replicas` (or `k + parity`) and `subject` the swarm, `visibility: private` unless the bucket is public, from the owner's escrow. Disks take leases as `paid2seed` says; the store fills from its pool first by posting to the disks' own hubs. Nothing in the swarm side changes.
5. **The first copy comes from the client.** The client seeds the swarm, or uploads to the store's gateway which seeds it, until `replicas` holders have fetched and proven. A store that accepts the bytes and answers before that reports `state: pending`, and an honest client keeps its copy until `healthy`.
6. **Locality is a preference, not a policy.** A store may place near where reads come from, or near the c0mpute nodes that will read the bucket, but never at the expense of the floors.

## Repair

1. A holder whose challenge or probe fails, or whose lease ends without renewal, is `failed` on the record at once.
2. The store posts a replacement offer within `proof.repair_within_hours`, sourced from any healthy holder, and appends a record with the new holder when its first proof lands. The object is `degraded` meanwhile, never silently short.
3. Repair spends the bucket's budget. A store that cannot repair because the escrow is empty says so on the record (`state: degraded`, `reason: budget`) and to the owner by whatever channel it has; it never lets an object drop below policy without a record saying why.
4. In erasure mode, repair rebuilds one shard from any `k` and places it on a new disk; it never re-encodes the whole object.
5. An object below the read threshold is `lost`, the store's `record.lost` goes up by one, and the record stays in the index so the loss is on the books.

## Reading, writing, listing

The store's API under `api`. Bodies are `application/json` unless bytes.

| Method and path | Does |
|---|---|
| `PUT /b/<bucket>` | Create or update a bucket record. Body is the record, signed by the bucket key. |
| `GET /b/<bucket>` | The bucket record and its `state` summary: objects, GiB, `healthy`, `degraded` and `lost` counts. |
| `GET /b/<bucket>?prefix=&delimiter=/&after=&limit=` | List keys: the newest non-tombstone record per key under `prefix`; with `delimiter`, common prefixes collapse to one entry each. Cursor is `after`. |
| `PUT /b/<bucket>/<key>` | Write a revision. Body is the bytes (ciphertext when `encryption.by: owner`, with `X-OpenObject-Manifest` carrying the `ipfile` manifest) or, with `Content-Type: application/vnd.openobject.object+json`, a record for a swarm already seeded. `If-Match: <etag>` makes it conditional on the current `id`; `If-None-Match: *` makes it create-only. Answers `201` with the record and `state`. |
| `GET /b/<bucket>/<key>` | The newest revision's bytes, verified against `id` before the last byte is sent. `Range` is honoured. `?rev=` reads an older revision. `ETag` is the `id`. `X-OpenObject-State` is the state. |
| `HEAD /b/<bucket>/<key>` | The record, as headers and as `X-OpenObject-Record` JSON. |
| `DELETE /b/<bucket>/<key>` | Append a tombstone. `?purge=1` also ends the leases of every revision, which is the only way bytes leave the disks before `versioning` lets them. |
| `GET /b/<bucket>/<key>?versions` | Every revision's record, newest first. |
| `GET /b/<bucket>.index?after=<seq>` | The index as an `ipdb` feed, for a mount or a second store to follow. |
| `POST /b/<bucket>/<key>:repair` | Ask for a repair pass now. |
| `GET /b/<bucket>/<key>:holders` | The holders with their OpenDisk descriptors, for a client that wants to fetch from the swarm itself. |

Authorisation is one of: a request signed by the bucket key (`Authorization: OpenObject <sig>` over method, path, date and body hash); an [OpenAccess](/openaccess) token with scope `openobject:read` or `openobject:write` and the bucket in its grant; nothing, on a `public` bucket's reads. A `409` on `If-Match` carries the current record. `402` on a write means the escrow will not cover the policy, with the shortfall.

Reads by a client that holds the content key are `ipfile` reads: fetch the ciphertext from any holder or the store's webseed, decrypt, verify `id`. A store reading for an `encryption: store` bucket does the same with its own key. Either way the plaintext hash is checked before it is served, and a mismatch is a `502` and a `failed` mark on the holder it came from.

## Mounting

A mount turns a bucket into a directory. It is how an [OpenSlice](/openslice) slice gets its disk and how a laptop gets its photos.

1. **Keys are paths.** The mount shows `photos/2026/09/a.jpg` at `<mountpoint>/photos/2026/09/a.jpg`. Directories are prefixes and exist while a key is under them. An empty directory is a key ending in `/` with no bytes.
2. **Metadata is the index.** The mount follows `<bucket>.index` and answers `stat`, `readdir` and `open` from it, so a list never touches a disk. A mount that has the index from `seq` 48211 sees exactly the bucket at 48211.
3. **Data is the swarm.** `read` fetches pieces from holders or the store's gateway, verifies, caches on local disk up to the mount's cache size. A slice on c0mpute reads from a holder on the same network with no internet egress.
4. **Writes are write-back.** A file written is a local revision until `close`, then one `PUT`; the object is `pending` until the store says `healthy`, and the mount keeps its copy until then. `fsync` waits for `pending` to clear when the mount is `--sync`; otherwise it returns when the store has the bytes.
5. **Consistency is close-to-open by `seq`.** Two mounts writing one key both succeed; the higher `seq` wins and the other becomes a revision. A mount that wants a lock uses `If-Match` and gets a `409`. There is no byte-range locking and no atomic rename across keys; `rename` is a copy of the record under the new key and a tombstone under the old, two index entries, and a reader may see the moment between them.
6. **Owners' keys stay with the mount.** With `encryption: owner`, the mount holds the bucket master key and the store never sees plaintext. Inside a slice, the key is granted to the slice for its reservation, as [OpenSlice](/openslice) says.
7. **What a mount is not.** Not a block device, not POSIX, not a database. A program that needs `O_APPEND`, `flock`, sparse files or sub-second `mtime` from two writers needs a local disk and should write its results to the bucket when it is done.

A store lists what it can serve a bucket as in `accepts.mounts`: `fuse` (the reference `ip mount` client), `nfs` and `webdav` (served by the store's gateway for machines that cannot run a client, plaintext only on `encryption: store` buckets or over a per-mount key the gateway holds for the session), and `s3` below.

## S3

A store may serve an S3-compatible endpoint at `s3`, because every tool already speaks it. Bucket name is the OpenObject bucket `id` or a name the store maps to one; object key is the key; `ETag` is the hex of `id`; `x-amz-meta-*` is `meta`; `ListObjectsV2` is the list above; `PutObject` with `If-None-Match: *` is create-only; versions are S3 versions with `VersionId` equal to `rev`. Multipart upload becomes one swarm when completed. Credentials are an OpenAccess token as the secret key and its id as the access key, or a store-issued pair. An S3 client never sees `holders` or `state`; `HeadObject` carries `x-amz-meta-openobject-state` so a careful one can. `encryption: owner` buckets are not reachable over S3, because S3 has nowhere to put the key.

## As an OpenServer offer

A store is a storage offer, and a directory that reads [OpenServer](/openserver) lists it as one:

| OpenServer | from OpenObject |
|---|---|
| `provider.name`, `web`, `operator`, `developer` | the same keys |
| `offers[]` | one per policy: `id` the policy id, `name` the store's name and the policy, `kind` `storage`, `model` `p2p`, `premises` `off-prem`, `management` `managed`, `tenancy` `shared` |
| `offers[].price` | `{ "amount": price.per_gib_month[policy], "currency", "interval": "month", "unit": "gib" }` |
| `offers[].location` | `location`, unchanged |
| `offers[].stock` | `in_stock` while `capacity.free_gib` is above zero |
| `offers[].updated` | `updated` |

The disks under a store are listed separately as OpenDisk offers; a directory shows a store as one line and its pool as many.

## On c0mpute

c0mpute's storage role already holds blake3-addressed objects as Reed-Solomon 10 data and 4 parity shards and serves them from a gateway. Mapped onto this document: the network is a store, `rs-10-4` is its erasure policy, its gateway serves the API above, each storage worker is an OpenDisk disk, and `ipfile.pin` is the workload a placement becomes. What c0mpute gains is the bucket, the index and the mount, and what a bucket gains from c0mpute is locality: a slice or a transcode job reading a bucket held on the same network pays no internet egress, which is the network's whole argument for hosting files at all. An `object.repair` workload lets any verifier node run the repair pass and be paid per object restored.

## What is deliberately absent

**No settlement of its own.** Every byte held is a `pay2seed` offer and a `paid2seed` lease, and every proof and payout is theirs. This document adds the index, the policy and the repair loop, nothing under them.

**No plaintext at a disk.** With `encryption: owner` a disk holds ciphertext it cannot read and a store holds an index it cannot decrypt. With `encryption: store` the owner has chosen to trust the store, and the disks still see nothing.

**No central registry.** A store is anyone with an index and a hub account. A bucket moves by handing a second store its record and its index; the disks and the leases do not change.

**No POSIX.** A mount is a bucket seen as paths. What it promises is in the mounting section, and it promises no more.

**No consensus.** One bucket key, one index, one clock. Two stores serving one bucket follow the same feed; two owners of one bucket are one owner with two machines.

## Related standards

- [OpenSwarm](/openswarm): `ipfile` for the swarms, `pay2seed` and `paid2seed` for holding and proof, `ipdb` for the index, `ippay` for the payee.
- [OpenDisk](/opendisk): the disks a store places onto, and their `holding` lists in which every object above appears.
- [OpenFile](/openfile): a publisher's released files; a public bucket may be listed there, and an OpenFile entry may point at a bucket key.
- [OpenSlice](/openslice): the container that mounts a bucket.
- [OpenServer](/openserver): the storage offer a store maps onto, and the units this document borrows.
- [OpenAccess](/openaccess): the token a client presents.
- [OpenProfile.md](/openprofile): the owner and the operator.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-21 | First publication: the store descriptor, the bucket, the object, placement, repair, the API, mounting, S3, the OpenServer mapping, c0mpute. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
