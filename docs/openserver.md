# OpenServer

OpenServer is one file a hosting provider serves about what it sells: every server, instance, box, rack, function and peer-market listing it offers, with the specs, the price, where it runs and whether it is in stock. A directory reads the provider's own file instead of scraping an aggregator, a buyer's agent reads it instead of a pricing page, and the provider stays the author of its own words. It covers cloud, VPS, dedicated and bare-metal servers, colocation, hardware sold to run on your own premises, shared and managed hosting, platforms, functions, storage, GPU, edge, peer-to-peer markets and the hybrids in between. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. A description of a file a directory already reads, published so a provider can serve one and any directory can read it.

Slug: `openserver`

## The problem

Every hosting provider publishes its catalog as a web page, and every comparison site scrapes those pages. The scrape breaks when the page changes, the comparison site's terms then forbid anyone else from scraping the scrape, and the provider, who wanted its offers seen, is the one party with no say in how they appear. A buyer's agent that wants "a 4 vCPU ARM box in Europe under 10 a month, in stock" reads twenty pricing pages twenty different ways, and the peer-to-peer markets, where the seller is a stranger and the price moved a minute ago, cannot be read by a page scraper at all.

The pieces exist. Providers already keep this data in a database, because their order form reads it. `/.well-known/` is where a host says things about itself. What is missing is the one file that puts a provider's catalog where a reader can fetch it, in a shape every reader agrees on, so an offer can be found instead of scraped.

## Terms

- A **provider** is anyone who sells compute, storage or the space to run it: a cloud, a VPS host, a dedicated-server company, a colocation facility, a hardware vendor, a platform, a peer-to-peer marketplace. Its **descriptor** is the file it serves about itself.
- An **offer** is one thing a provider sells at a price: a plan, an instance type, a server configuration, a rack unit, an appliance, a market listing.
- A **directory** is anything that reads descriptors and lists offers across providers: a comparison site, a database, a search index, an agent's own cache.
- A **reader** is anything that reads a descriptor: a directory, a person's terminal, a program, an agent.

## The descriptor

A provider serves a JSON document at `/.well-known/openserver.json` on its own origin.

```json
{
  "provider": {
    "name": "Northwind Hosting",
    "web": "https://northwind.example",
    "operator": "https://northwind.example/.well-known/openprofile.md",
    "country": "NL",
    "support": "https://northwind.example/support",
    "status": "https://status.northwind.example",
    "legal": "https://northwind.example/terms"
  },
  "updated": "2026-09-13T06:00:00Z",
  "offers": [
    {
      "id": "vps-arm-4",
      "name": "ARM 4",
      "url": "https://northwind.example/vps/arm-4",
      "kind": "vps",
      "premises": "off-prem",
      "management": "unmanaged",
      "tenancy": "shared",
      "model": "centralized",
      "location": { "regions": ["ams1", "fra1"], "countries": ["NL", "DE"] },
      "compute": { "vcpu": 4, "ram_mb": 8192, "arch": "arm64" },
      "storage": [{ "type": "nvme", "size_gb": 80 }],
      "network": { "bandwidth_mbps": 1000, "transfer_gb": 4000, "ipv4": 1, "ipv6": true },
      "price": { "amount": 7.5, "currency": "EUR", "interval": "month" },
      "stock": "in_stock",
      "updated": "2026-09-13T06:00:00Z"
    },
    {
      "id": "dedi-epyc-16",
      "name": "EPYC 16",
      "url": "https://northwind.example/dedicated/epyc-16",
      "kind": "dedicated",
      "premises": "off-prem",
      "management": "unmanaged",
      "tenancy": "dedicated",
      "model": "centralized",
      "location": { "regions": ["ams1"], "countries": ["NL"] },
      "compute": { "cores": 16, "ram_mb": 131072, "arch": "x86_64" },
      "storage": [{ "type": "nvme", "size_gb": 1920 }, { "type": "nvme", "size_gb": 1920 }],
      "network": { "bandwidth_mbps": 10000, "transfer_gb": 50000, "ipv4": 1, "ipv6": true },
      "price": { "amount": 129, "currency": "EUR", "interval": "month", "setup": 49, "commitment": "1 month" },
      "stock": "preorder"
    },
    {
      "id": "gpu-l40s-1",
      "name": "L40S x1",
      "url": "https://northwind.example/gpu/l40s",
      "kind": "gpu",
      "premises": "off-prem",
      "management": "unmanaged",
      "tenancy": "dedicated",
      "model": "centralized",
      "location": { "regions": ["fra1"], "countries": ["DE"] },
      "compute": { "vcpu": 16, "ram_mb": 65536, "arch": "x86_64", "gpu": { "model": "NVIDIA L40S", "count": 1, "vram_mb": 49152 } },
      "storage": [{ "type": "nvme", "size_gb": 500 }],
      "price": { "amount": 1.4, "currency": "EUR", "interval": "hour" },
      "stock": "out_of_stock"
    },
    {
      "id": "market-ask-8c7f",
      "name": "8 vCPU, 32 GB, RTX 4090 (peer 8c7f)",
      "url": "https://market.northwind.example/asks/8c7f",
      "kind": "p2p",
      "premises": "off-prem",
      "management": "unmanaged",
      "tenancy": "dedicated",
      "model": "p2p",
      "location": { "countries": ["US"] },
      "compute": { "vcpu": 8, "ram_mb": 32768, "arch": "x86_64", "gpu": { "model": "NVIDIA RTX 4090", "count": 1, "vram_mb": 24576 } },
      "price": { "amount": 0.42, "currency": "USD", "interval": "hour" },
      "stock": "in_stock",
      "updated": "2026-09-13T06:14:02Z"
    }
  ]
}
```

The smallest valid descriptor is a provider with a name and an offer with a name:

```json
{ "provider": { "name": "Northwind Hosting" }, "offers": [{ "name": "ARM 4" }] }
```

The rules, and every one degrades:

1. **`provider.name` and `offers[].name` are the only required keys.** A descriptor with those alone is valid. A reader lists what it was given and reports the rest as unstated rather than assumed.
2. **`provider`** is who sells. `web` is the site, `country` an ISO 3166-1 alpha-2 code for where the company is, `support` where a customer gets help, `status` the status page, `legal` the terms a purchase is under. `operator` is the person or organisation answerable, as an [OpenProfile.md](/openprofile) URL.
3. **`updated`** on the descriptor is when anything in it last changed. **`updated`** on an offer is when that offer last changed, and wins over the descriptor's for that offer. Both are ISO 8601. A reader with the descriptor's `updated` unchanged since its last fetch may skip the rest.
4. **`offers[].id`** is stable for as long as the offer is the same thing. It is the dedupe key: a reader that sees the same provider origin and `id` tomorrow updates its row rather than adding one. Absent, the reader derives one from `name`, and a renamed offer becomes a new one, which is the cost of not stating it.
5. **`kind`** is what is sold, one word from the list below. **`premises`**, **`management`**, **`tenancy`** and **`model`** are four axes that cut across every kind, each its own key so a reader filters on them without guessing from the kind. A `dedicated` offer is usually `tenancy: dedicated`; a `managed` one is usually `management: managed`; but the axes are stated, not inferred, because a managed VPS and an unmanaged one are the same kind and different offers.
6. **`location`** is where the offer runs. `regions` are the provider's own region names, unchanged, so a buyer can use them at the order form. `countries` are ISO codes, so a directory can group across providers. An on-prem offer has no location, because it runs wherever the buyer puts it.
7. **`compute`, `storage`, `network`** describe the thing. Units are fixed: `ram_mb` and `vram_mb` in mebibytes, `size_gb` in gigabytes, `bandwidth_mbps` in megabits per second, `transfer_gb` per interval. `vcpu` is threads sold, `cores` is physical cores; a dedicated box states `cores`, a virtual one states `vcpu`, and one may state both. `arch` is `x86_64`, `arm64`, `riscv64` or the provider's own word. `storage` is a list, one entry per volume, so two drives are two entries. `ipv4` is a count, `ipv6` a boolean.
8. **`price`** is one price. `amount` is a number, `currency` an ISO 4217 code, `interval` is `hour`, `month`, `year` or `once`. `setup` is a one-time amount on top. `commitment` is the shortest term a buyer signs for, in words the provider uses. An offer sold at several intervals is several offers with a shared prefix in `id`, or one offer at the interval the provider quotes first, and a reader shows what it was given.
9. **`stock`** is `in_stock`, `out_of_stock`, `preorder` or `unknown`. Absent means `unknown`. A directory that shows stock shows when it was read.
10. **Unknown keys are kept.** A provider says more than this document names, and a reader passes it through under the provider's own key.

Serve it as `application/json`. The descriptor is a claim; that it came from the provider's own origin is the verification.

## Kinds

One word each. A provider picks the closest; the four axes say the rest.

| kind | what is sold |
|---|---|
| `cloud` | a virtual machine on a cloud platform, billed by the hour or the second, with an API |
| `vps` | a virtual private server, billed by the month |
| `dedicated` | a whole physical server rented from the provider's rack |
| `bare-metal` | a whole physical server with cloud-style provisioning and hourly billing |
| `colocation` | rack space, power and network for a server the buyer owns |
| `on-prem` | hardware or an appliance sold or leased to run on the buyer's premises |
| `shared` | a slice of a server the provider administers, typically web hosting with a control panel |
| `managed` | a server the provider runs for the buyer, patches, backups and all, sold as the service rather than the box |
| `paas` | a platform that takes code and runs it, with no server the buyer sees |
| `serverless` | functions or containers billed by invocation or by the second of use |
| `storage` | object, block or file storage sold on its own |
| `gpu` | compute sold for the accelerator, whatever runs beside it |
| `edge` | compute placed near users at many small points of presence |
| `p2p` | a listing on a decentralised marketplace where the seller is a peer, not the operator |
| `hybrid` | a bundle that spans premises, such as an appliance with a cloud control plane |

The axes:

| key | values | meaning |
|---|---|---|
| `premises` | `on-prem`, `off-prem`, `hybrid` | where the hardware physically is: the buyer's site, the provider's, or both |
| `management` | `managed`, `unmanaged`, `co-managed` | who administers the operating system and what runs on it |
| `tenancy` | `shared`, `dedicated` | whether the hardware is shared with other customers |
| `model` | `centralized`, `p2p` | whether one operator runs the hardware, or peers do |

Absent axes are unstated, and a reader says so rather than filling them in.

## Peer-to-peer markets

A decentralised marketplace, such as Akash, Flux, Golem, Salad or Vast.ai, publishes one descriptor at its own origin. Its `provider` is the marketplace, and its `operator` points at the marketplace, not at any peer. Its `offers` are the market's current asks: one offer per listing, `kind: p2p`, `model: p2p`, with `stock` and `price` updated as often as the market moves and `updated` on each offer saying when. A peer that also wants to be found on its own serves its own descriptor at its own origin, with `model: p2p` on the offers it lists there, and a directory that meets the same peer both ways keeps both rows, because the market's price and the peer's price are two facts.

A market with thousands of asks may serve the current top of book rather than every ask, and say so in a key of its own. What it serves is what a reader lists.

The compute case in this family is [c0mpute](https://github.com/profullstack/logicsrc/blob/master/docs/openswarm/c0mpute.md), the house peer-to-peer compute marketplace: its nodes are peers, its market is the descriptor's `offers`, and settlement and proof of work done are [OpenSwarm](/openswarm)'s business, not this document's. The storage case is [OpenDisk](/docs/opendisk), a peer publishing disk capacity for rent; an OpenDisk descriptor maps onto an OpenServer offer with `kind: storage` and `model: p2p`, and may be listed as one.

## Discovery

A reader finds a descriptor three ways, in this order:

1. `/.well-known/openserver.json` on the provider's origin.
2. `<link rel="openserver" href="...">` in the HTML of the provider's home page, or a `Link: <...>; rel="openserver"` header on it, when the file lives somewhere else.
3. A URL handed to the reader directly.

A descriptor is **verified** when it was fetched from the same origin as `provider.web`, or from `/.well-known/` on the origin the reader was pointed at. One found by the third route on some other host is a claim about the provider by whoever hosts it, and a directory marks it so.

## Directories

A directory reading descriptors:

1. **Fetches on a schedule, daily at least**, and whenever it is told the file changed. Offers change price and stock; a directory that read a descriptor once has a snapshot, not a catalog.
2. **Dedupes on the provider's origin and the offer's `id`.** A re-read updates the row; it never adds a second. An offer that leaves the descriptor is marked gone, not deleted, so a reader can see it was sold once.
3. **Keeps the provider's words.** The offer's `name`, the region names, the extra keys. A directory normalises for search and displays what the provider wrote.
4. **Attributes the provider.** Every listed offer links to its `url`, and the directory says where the descriptor came from and when it was read.
5. **Reports absence as absence.** An unstated `stock` is unknown, not in stock. An unstated axis is unstated.

The first directory reading OpenServer is the hosting collection at [nichedb.dev](https://nichedb.dev/c/hosting), which lists providers and their offers as feeds, with RSS, JSON, an API and MCP over the same rows. [findhost.app](https://www.findhost.app), a curated register of web hosts published under CC BY 4.0, is the sibling from the other direction: it describes providers by hand, one attribute at a time, and could emit a descriptor per provider from what it already holds. A directory that reads both has the provider's own catalog and a curator's view of the provider, and shows which is which.

## What is deliberately absent

**No ordering.** The descriptor says what is for sale, not how to buy it. Every provider already has an order form or a provisioning API, and `url` on each offer leads to it.

**No reviews, no trust score.** `verified` means the file came from the provider's own origin. Whether a provider is good is the reader's judgement, with the operator's profile and the status page as the place to start.

**No benchmarks.** A descriptor says what an offer is specified as, in the provider's words. What it measures at is another document's business.

**No central registry.** Anyone may read any provider's file. A directory is one reader among many, and two directories reading the same file list the same offers.

## Serving one

By hand, from the same table the order form reads. A provider with a database has everything the file needs; the file is that table, exported, at a fixed URL. A static site can commit the file next to `robots.txt`.

## Related standards

- [OpenSwarm](/openswarm): the settlement and proof layer under a peer-to-peer offer; [c0mpute](https://github.com/profullstack/logicsrc/blob/master/docs/openswarm/c0mpute.md) is its compute marketplace and [OpenDisk](/docs/opendisk) its disk-for-rent peer, each listable here as an offer.
- [OpenCPU](/docs/opencpu), [OpenMemory](/docs/openmemory), [OpenGPU](/docs/opengpu), [OpenBandwidth](/docs/openbandwidth): the resource blocks. An offer's `compute` (cpu and memory), `compute.gpu` and `network` may carry those specs' fields when the provider has them, and each can stand alone as an offer of its own.
- [OpenProfile.md](/openprofile): the `operator` behind a provider.
- [OpenMCP](/openmcp): a directory that also serves its rows over MCP describes that door with an OpenMCP descriptor.
- [OpenAccess](/openaccess): how a buyer's agent carries the credential it needs at the provider's order form, if the provider honours one.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the descriptor, fifteen kinds, four axes, peer-to-peer markets, discovery, what a directory owes a provider. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
