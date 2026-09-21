# OpenSlice

OpenSlice is a container whose compute is rented from one market and whose disk is mounted from another. A **slice** is a fraction of a machine: some threads, some memory, perhaps a GPU, a little scratch, running one OCI image, with its durable state on an [OpenObject](/openobject) bucket mounted at a path. Because the state is in the bucket, the host is interchangeable: stop the slice here, start it there, the mount reattaches, the address moves with it. The host is a [c0mpute](https://c0mpute.com) node, or any machine that serves the file below; the settlement is OpenSwarm's; the disk is OpenObject's. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface, with [slic3s.com](https://slic3s.com) as the reference marketplace.

Status: **0.1**. A description of a file a host serves about the slices it will run, the file a slice is, and the reservation between them, published so a slice can move between hosts and a host can be found instead of waited for.

Slug: `openslice`

## The problem

A c0mpute job ends. A buyer posts an offer, a worker bids, runs it, publishes a receipt, and is paid; the work has a completion event and the settlement is built around it. A service has no such event. A web app, a game server, an agent that listens for messages, a database behind them: these run until somebody stops them, and what they need from a machine is a share of it for a while, not a job done.

c0mpute's hosting draft already found this for static sites and wrote a continuous reservation for it: epochs, presence proofs, slashable collateral. What is missing is the general case, a container, and the two facts that make a container on a peer network tolerable: the host holds nothing the owner cannot get back, because the disk is a bucket kept at three replicas elsewhere, and the host is described in a file, so a buyer picks one by reading rather than by hoping the auction lands somewhere good. The name is the thing sold: a slice of a machine.

The name is shared. ETSI's OpenSlice is an operations support system for 5G network slicing. This document is about containers, not radio, and says so here so a reader who searched for the other one knows.

## Terms

- A **host** is a machine that runs slices: a c0mpute worker with the slice role, or any box serving the descriptor below. Its **descriptor** is the file it serves about itself.
- A **slice** is one container instance under one owner: an image, a resource ask, mounts, ports, a lifetime. Its **spec** is the file that says so.
- The **owner** is who holds the slice key and pays the reservation.
- A **reservation** is the match between a slice and a host at a hub: hours, price, escrow, proofs, payout. It is the `paid2seed` lease's shape applied to compute.
- A **mount** is an OpenObject bucket seen as a directory inside the slice.
- A **marketplace** reads host descriptors, shows standing from the hubs, and launches slices. [slic3s.com](https://slic3s.com) is the reference.

## The host descriptor

A host serves a JSON document at `/.well-known/openslice.json` on its own origin.

```json
{
  "name": "rig-7b, Helsinki",
  "web": "https://rig-7b.example",
  "operator": "https://rig-7b.example/.well-known/openprofile.md",
  "key": "ed25519:b70c4e2a9d1f6c3b8e5a0d7f2c9b4e1a6f3d0c7b2e9a5f8d1c4b7e0a3f6d9c2b",
  "hubs": ["https://slic3s.com/api/openswarm", "https://c0mpute.com/api/openswarm"],
  "developer": {
    "cli": {
      "name": "c0mpute",
      "install": { "curl": "curl -fsSL https://c0mpute.com/install.sh | sh" },
      "docs": "https://c0mpute.com/docs/cli",
      "repo": "https://github.com/profullstack/c0mpute"
    }
  },
  "updated": "2026-09-21T06:00:00Z",
  "runtime": { "engine": "crun", "oci": "1.1", "rootless": true, "arch": "x86_64", "kernel": "6.12", "gpu": "nvidia" },
  "capacity": {
    "vcpu_total": 32, "vcpu_free": 20,
    "ram_mb_total": 131072, "ram_mb_free": 81920,
    "scratch_gb_free": 800,
    "gpu": [{ "model": "NVIDIA RTX 4090", "vendor": "NVIDIA", "count": 1, "vram_mb": 24576, "free": 1 }],
    "slices_max": 16, "slices_running": 5
  },
  "price": {
    "currency": "USD",
    "per_vcpu_hour": 0.006,
    "per_gib_ram_hour": 0.002,
    "per_gpu_hour": 0.35,
    "per_gib_scratch_month": 0.05,
    "per_gib_transfer": 0.005,
    "min_hours": 1,
    "max_hours": 8760
  },
  "location": { "regions": ["hel1"], "countries": ["FI"] },
  "network": { "bandwidth_mbps": 1000, "transfer_gb": 30000, "ipv4": 1, "ipv6": true, "ports": "any", "domains": true },
  "compute": { "arch": "x86_64", "model": "AMD Ryzen 9 7950X", "cores": 16, "threads_per_core": 2 },
  "accepts": {
    "images": ["ghcr.io", "docker.io", "openobject"],
    "privileged": false,
    "gpu": true,
    "egress": true,
    "max_vcpu": 16,
    "max_ram_mb": 65536,
    "max_scratch_gb": 200,
    "mounts": ["openobject"]
  },
  "proof": { "kinds": ["presence", "probe"], "epoch_seconds": 3600, "webhook": "https://rig-7b.example/openslice/hooks" },
  "record": {
    "source": "https://slic3s.com/api/openswarm/openslice/hosts/ed25519:b70c…9c2b",
    "standing": 96,
    "epochs": 2210,
    "missed": 4,
    "evicted": 0,
    "since": "2026-06-01T00:00:00Z"
  },
  "payout": { "payee": "ed25519:b70c…9c2b", "network": "eip155:8453" },
  "running": "https://rig-7b.example/openslice/running"
}
```

The smallest valid descriptor is a name, free threads, free memory and a price:

```json
{ "name": "old laptop, Porto", "capacity": { "vcpu_free": 4, "ram_mb_free": 8192 }, "price": { "currency": "USD", "per_vcpu_hour": 0.004, "per_gib_ram_hour": 0.001 } }
```

The rules, and every one degrades:

1. **`name`, `capacity.vcpu_free`, `capacity.ram_mb_free`, `price.per_vcpu_hour` and `price.per_gib_ram_hour` are the only required keys.** A reader lists what it was given and reports the rest as unstated.
2. **`operator`** is who is answerable, as an [OpenProfile.md](/openprofile) URL. **`key`** is the host's OpenSwarm identity, the key that signs presence proofs and is paid; on c0mpute it is derived from the libp2p key as the c0mpute document says. **`hubs`** are where it takes reservations.
3. **`developer`** is the block [OpenServer](/docs/openserver) 0.2 defines, unchanged.
4. **`updated`** is when anything changed; `capacity` changes with every slice, so a busy host updates often.
5. **`runtime`** is what runs the container: `engine` is `crun`, `runc`, `podman`, `docker`, `firecracker`, `gvisor` or `wasmtime`; `oci` the runtime-spec version; `rootless` whether containers run without root on the host; `arch` as OpenServer spells it; `gpu` the vendor whose devices can be passed in, or absent.
6. **`capacity`** is in the units [OpenCPU](/docs/opencpu), [OpenMemory](/docs/openmemory) and [OpenGPU](/docs/opengpu) use: `vcpu` threads, `ram_mb` mebibytes, `vram_mb` mebibytes, `scratch_gb` gigabytes of local disk a slice may use and lose. `*_free` is what a new slice can have now and is what matters. `gpu[].free` counts devices not passed to a running slice.
7. **`price`** is per hour for threads, memory and GPU, per month for scratch, per GiB for internet egress. A slice's hourly price is `vcpu * per_vcpu_hour + ram_gib * per_gib_ram_hour + gpus * per_gpu_hour`, pro rata by the second. `min_hours` and `max_hours` bound a reservation.
8. **`location`, `network`, `compute`** are as OpenServer defines them. `network.ports` is `any`, a list, or `none` for a host that gives slices no inbound address; `network.domains` is whether the host will answer for a hostname the owner points at it.
9. **`accepts`** is policy stated up front. `images` are the registries it will pull from, plus `openobject` when it will take an image from a bucket; `privileged: false` is the only value this version defines; `mounts` lists the mount kinds it can attach, `openobject` being the one this document needs.
10. **`proof`** is how the host expects to be checked: `presence` is the host's signed statement per epoch that the slice ran; `probe` is a hub or the owner hitting the slice's health route from outside. `epoch_seconds` is the settlement period.
11. **`record`** is the host's history at the hub named in `source`, copied for convenience: epochs proven, `missed`, and `evicted` (slices the host stopped before the owner did). A marketplace ranks on the hub's number, not the file's.
12. **`payout`** names the `ippay` payee and network.
13. **`running`** is a URL that answers with what the host runs now, or the list inline; shape below.
14. **Unknown keys are kept.**

Serve it as `application/json`. The descriptor is a claim; the origin is one verification, the hub's record under `key` is the other.

## The slice

A slice is a record the owner writes and signs, sends to a hub with the reservation, and may keep anywhere.

```json
{
  "openslice": "0.1",
  "type": "openslice.slice",
  "id": "ed25519:5e1d8a0c3f7b2e9d6c4a1f0b8e3d7c2a5f9b0e4d1c6a3f8b7e2d5c0a9f4b1e6d",
  "name": "shop-api",
  "owner": "https://ana.example/.well-known/openprofile.md",
  "image": { "ref": "ghcr.io/ana/shop-api@sha256:1f0e…d9c2", "arch": "x86_64" },
  "command": ["node", "server.js"],
  "compute": { "vcpu": 2, "ram_mb": 4096, "gpu": null, "scratch_gb": 10 },
  "mounts": [
    { "bucket": "ed25519:3a9f…4a6c", "prefix": "shop/", "path": "/data", "mode": "rw", "cache_gb": 4, "sync": false },
    { "bucket": "ed25519:77c1…0e2b", "prefix": "", "path": "/assets", "mode": "ro", "cache_gb": 2 }
  ],
  "env": [
    { "name": "NODE_ENV", "value": "production" },
    { "name": "DATABASE_URL", "vault": "opencreds://ana.example/shop/database-url" }
  ],
  "ports": [{ "container": 8080, "protocol": "tcp", "public": true, "domain": "api.shop.example" }],
  "health": { "http": "/healthz", "every_seconds": 30, "grace_seconds": 60 },
  "placement": { "countries": ["FI", "DE", "NL"], "exclude_hosts": [], "near": "ed25519:3a9f…4a6c", "min_standing": 80 },
  "lifetime": { "hours": 720, "renew": true, "restart": "always" },
  "price_cap": { "currency": "USD", "per_hour": 0.05 },
  "created": "2026-09-21T09:00:00Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:5e1d…1e6d", "sig": "…" }]
}
```

1. **`id`** is the slice key. The slice is whoever holds the private half; it signs the spec, the reservation and every change. A slice keeps its `id` across hosts, which is what makes a move a move and not a new slice.
2. **`image`** is an OCI image by digest. `ref` is a registry reference, or `openobject://<bucket>/<key>` for an image tarball kept in a bucket, which is how an image outlives the registry it came from. A tag without a digest is refused: two hosts must run the same bytes.
3. **`compute`** is the ask, in OpenCPU, OpenMemory and OpenGPU units. `gpu` is `null` or `{ "count", "vram_mb", "vendor" }`. `scratch_gb` is local disk the slice may write and will lose on a move; the root filesystem is an overlay on scratch and counts against it.
4. **`mounts`** are OpenObject buckets. `prefix` narrows the mount to keys under it; `path` is where it appears; `mode` `rw` or `ro`; `cache_gb` is the local read cache, out of scratch; `sync` makes `fsync` wait for `healthy`, as the OpenObject mounting section says. The content key for an `encryption: owner` bucket is granted to the slice key, not the host, and the mount runs inside the slice's namespace; the host can read what the slice reads, and this document says so plainly below.
5. **`env`** is either a literal `value` or a `vault` reference an [OpenCreds](/opencreds) vault resolves at start. A vault secret never appears in the spec, at a hub, or in the marketplace's copy.
6. **`ports`** are what the slice listens on. `public: true` asks the host for an address; `domain` is a hostname the owner will point at the host's address, which the host answers for when `network.domains` is true. A host that cannot give a port refuses the reservation rather than run the slice deaf.
7. **`health`** is the route a host and a hub probe. A slice that fails `health` for `grace_seconds` is `unhealthy` on the record, restarted under `lifetime.restart`, and an epoch with no healthy probe is not paid.
8. **`placement`** is what the owner will accept: countries, hosts never to use again, `near` a bucket key so the marketplace prefers hosts on the same network as its holders, `min_standing` at the hub.
9. **`lifetime`** is the reservation's length, whether the owner's client renews it from escrow while funds last, and the restart policy `always`, `on-failure` or `never`.
10. **`price_cap`** is the most the owner will pay per hour. A host whose price for this ask is above it is not offered the reservation.

## Running one

An owner that has read a descriptor and wants the host:

1. **Read** the descriptor for `accepts`, `capacity` and `price`, and `record.source` at the hub for standing. Price the ask; refuse if above `price_cap`.
2. **Reserve.** Post an `openslice.reservation` at one of the host's `hubs`: the slice spec, the host `key`, `hours`, the hourly price, `budgetUsd` escrowed for the hours, `proof.epoch_seconds`. The hub holds the money, as `pay2seed` does for disks.
3. **Take.** The host takes the reservation on its next poll or at once when the hub pushes to `proof.webhook`, and answers with a lease: the reservation id, its address for each public port, and `startsAt`. A host that has no room by then declines and the hub offers it to the next.
4. **Start.** The host pulls the image by digest, resolves `env`, attaches the mounts (the OpenObject client inside the slice's namespace, the grant boxed to the slice key and handed over by the owner's client on the lease), applies `compute` as cgroup limits, passes the GPU if asked, opens the ports, and runs `command`. The slice is `running` when `health` first answers.
5. **Prove.** Once per epoch the host signs a presence record: the reservation, the epoch, seconds run, CPU-seconds used, bytes in and out, health probes seen, and the same Merkle root over its request log that c0mpute's hosting draft defines. The hub, the owner, or a c0mpute verifier probes `health` from outside during the epoch. A proven epoch is paid to `payout.payee` from escrow; a missed one is not, and counts against `record.missed`.
6. **Renew or end.** The owner's client renews from escrow while `lifetime.renew` and funds allow. At the end, or on `stop`, the host stops the container, the mount flushes write-back to `healthy`, scratch is discarded, and the lease closes with a final proof.

**Moving.** A move is a stop on one host and a start on another under the same slice `id`: the owner posts a new reservation with the spec unchanged, the new host starts, the mounts reattach to the same buckets at the index's current `seq`, the owner repoints `domain` or the marketplace does, and the old reservation ends. Nothing on the old host is needed. A host that goes away without a final proof is `evicted` on its record, and the owner's client moves the slice the same way; the slice's data was never only there.

States on the record: `pending`, `pulling`, `running`, `unhealthy`, `stopped`, `moved`, `evicted`.

## The reservation

```json
{
  "openslice": "0.1",
  "type": "openslice.reservation",
  "hub": "ed25519:c9f1…",
  "owner": "ed25519:5e1d…1e6d",
  "host": "ed25519:b70c…9c2b",
  "slice": "sha256:2b7e…",
  "hours": 720,
  "priceUsdPerHour": "0.031000",
  "budgetUsd": "22.320000",
  "proof": { "epochSeconds": 3600, "verifiers": ["hub", "owner"] },
  "startsAt": "2026-09-21T09:05:00.000Z",
  "expiresAt": "2026-10-21T09:05:00.000Z",
  "payment": { "network": "eip155:8453", "nonce": "0x4d1a…" },
  "createdAt": "2026-09-21T09:04:41.000Z",
  "sigs": [{ "alg": "ed25519", "key": "ed25519:c9f1…", "sig": "…" }]
}
```

`slice` is the hash of the signed spec, kept at the hub beside it. `budgetUsd` is at least `hours * priceUsdPerHour`, rounded up. `verifiers` may include `c0mpute`, in which case a verifier node is paid to probe, as the disk protocols allow. Everything else is `pay2seed` and `paid2seed` with the swarm replaced by the container: one lease per reservation, one proof per epoch, GiB-months become slice-hours.

## Running

The other half of `record`: what one host runs now, from the host's side, at `running`.

```json
{
  "updated": "2026-09-21T09:30:00Z",
  "running": [
    { "slice": "ed25519:5e1d…1e6d", "reservation": "sha256:8c0a…", "vcpu": 2, "ram_mb": 4096, "gpu": 0, "since": "2026-09-21T09:05:12Z", "until": "2026-10-21T09:05:00Z", "state": "running", "provenAt": "2026-09-21T09:00:00Z" }
  ]
}
```

A host lists a slice's key and its resource use, never its image, mounts, env or ports; what a slice does is the owner's to announce.

## The marketplace

A marketplace reading descriptors does what an OpenDisk marketplace does: fetches on a schedule because `capacity` moves, dedupes on `key`, reads standing from the hub for anything it ranks on, shows `accepts` beside `price`, marks a host gone rather than deleted, and reports absence as absence. On top of that it:

1. **Prices an ask** against every host it knows and shows the hourly number before the owner posts.
2. **Prefers locality.** With `placement.near`, it ranks hosts on the same network as the bucket's holders first, because a slice reading its own disk should not pay internet egress for it.
3. **Launches.** One act: read the host, post the reservation, hand over the mount grants, show the address when the lease lands.
4. **Moves.** On `evicted`, on a failed health probe past grace, or on the owner's click, it reserves elsewhere within `placement` and repoints `domain`.
5. **Gives a name** when the owner has none: `<slice>.slic3s.app` or its own, pointed at whichever host runs the slice now.

[slic3s.com](https://slic3s.com) is the reference: every host descriptor it has read, standing from the hubs each names, and a launcher that takes a slice spec.

## As an OpenServer offer

A host is a hosting offer, and a directory that reads [OpenServer](/openserver) lists it without a second parser:

| OpenServer | from OpenSlice |
|---|---|
| `provider.name`, `web`, `operator`, `country`, `developer` | `name`, `web`, `operator`, `location.countries[0]`, `developer` |
| `offers[].id` | `key`, or the descriptor's origin when there is no key |
| `offers[].kind` | `cloud` |
| `offers[].premises`, `management`, `tenancy` | `off-prem`, `unmanaged`, `shared` |
| `offers[].model` | `p2p` when the operator is a person or a peer, `centralized` when it is a provider; the host may state `model` itself and that wins |
| `offers[].compute` | `{ "vcpu": capacity.vcpu_free, "ram_mb": capacity.ram_mb_free, "arch": runtime.arch }` plus `compute` unchanged |
| `offers[].gpu` | `capacity.gpu[0]` as an OpenGPU block, `count` its `free` |
| `offers[].location`, `network` | the same keys, unchanged |
| `offers[].price` | `{ "amount": per_vcpu_hour, "currency", "interval": "hour", "unit": "vcpu" }`, `unit` kept as the provider's own key; the memory and GPU prices ride along under `price` unchanged |
| `offers[].stock` | `in_stock` while `vcpu_free` and `ram_mb_free` are above zero and `slices_running` is below `slices_max` |
| `offers[].updated` | `updated` |

A provider that sells VPS plans and rents slices serves both files. A peer with one rig serves only this one, and is listed in both places.

## On c0mpute

A c0mpute node with the slice role adds `c0mpute:role:slice` and `c0mpute:openslice:host` to its capability tags, serves the descriptor from its gateway, and takes reservations as a continuous contract rather than a job: the hosting draft's epoch attestation with the site replaced by the container. `c0mpute slice up slice.json` reads the spec, prices it against the hosts the node knows, reserves, and prints the address; `c0mpute slice ls`, `logs`, `stop` and `move` do what they say. A slice on a c0mpute host reading an OpenObject bucket whose holders are c0mpute storage workers pays nothing for the bytes, which is the case the two documents were written for: compute from c0mpute.com, disk from d1sks.com, the pair from slic3s.com.

## What is deliberately absent

**No orchestration.** One slice is one container on one host. There are no pods, no services, no autoscaling, no scheduler beyond the marketplace's ranking. Two slices that need each other find each other by `domain`.

**No confidential compute.** A host runs the container and can read what the container reads, including a mounted bucket's plaintext while it is mounted. What this document promises is the opposite direction: nothing on the host is needed to get the slice back. An owner who cannot trust any host with a secret keeps it out of the slice.

**No persistent local disk.** Scratch is gone on a move. State that must survive is in a mount.

**No network between slices.** Each slice has its own address on its own host. A private network across hosts is a different specification.

**No image registry.** A slice names an image by digest at a registry it trusts, or keeps it in a bucket.

**No settlement of its own.** The reservation is a lease, the epoch is a period, the presence record is a proof, and payout is `ippay`. The disk protocols were written first and this document applies them.

## Related standards

- [OpenObject](/openobject): the bucket a slice mounts.
- [OpenDisk](/opendisk): the same shape for a disk, and the marketplace rules this document copies.
- [OpenSwarm](/openswarm): `pay2seed` and `paid2seed` for the reservation's shape, `ippay` for the payee, and the c0mpute document for node identity.
- [OpenServer](/openserver), [OpenCPU](/docs/opencpu), [OpenMemory](/docs/openmemory), [OpenGPU](/docs/opengpu): the hosting offer a host maps onto and the units this document borrows.
- [OpenCreds](/opencreds): where `env` secrets live.
- [OpenProfile.md](/openprofile): the owner and the operator.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-21 | First publication: the host descriptor, the slice, running one, the reservation, running, the marketplace, the OpenServer mapping, c0mpute. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
