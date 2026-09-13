# OpenBandwidth

OpenBandwidth is the shape of one resource in a server purchase: the network. It says how fast the port is, how much traffic is included and how it is metered, what overage costs, how many addresses come with the box and what more of them cost, and whether traffic is scrubbed. It is the `network` block of an [OpenServer](/docs/openserver) offer, written down on its own so a VPS host with a transfer cap, a colocation facility billing at the 95th percentile, an IPv4 lessor and a directory that filters on any of them all mean the same thing by the same key. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. One of five resource specifications under OpenServer: [OpenCPU](/docs/opencpu), [OpenMemory](/docs/openmemory), [OpenDisk](/docs/opendisk), [OpenGPU](/docs/opengpu) and OpenBandwidth. Each describes one thing that is negotiable when a server is bought.

Slug: `openbandwidth`

## The problem

"Unmetered 1 Gbps" and "1 Gbps, 20 TB" and "1 Gbps at 95th percentile, 100 Mbps committed" are three different products that every comparison site shows as 1 Gbps. The surprise on the invoice is always in the network line: overage at 0.01 a gigabyte on one host and 0.09 on another, ingress free here and billed there, a second IPv4 address at 2 a month or unavailable at any price. IPv4 addresses are now a market of their own, leased by the /24, and no catalog format has a place for them. A buyer's agent asked for "10 TB a month, egress under 0.02 a gigabyte over, with a /29" cannot answer from the number 1000.

This document fixes the words for the port, the meter, the overage and the addresses.

## Terms

- The **network block** is the `network` object on an OpenServer offer, or the same object served on its own.
- The **port** is the link speed the buyer is connected at. The **meter** is how traffic on it is counted for billing. **Overage** is the price of traffic past what is included.
- **Addresses** are the IPv4 and IPv6 assignments included, and the price of more.
- A **range** is what the buyer may change at checkout, with the price of changing it.

## The network block

```json
{
  "network": {
    "bandwidth_mbps": 1000,
    "metering": "transfer",
    "transfer_gb": 20000,
    "counts": "egress",
    "overage": { "amount": 0.01, "currency": "USD", "per_gb": 1 },
    "ipv4": 1,
    "ipv4_price": { "amount": 2, "currency": "USD", "interval": "month", "per": 1 },
    "ipv4_max": 8,
    "ipv6": "/64",
    "ddos": "always-on",
    "private_network": true,
    "uplinks": 2,
    "range": {
      "key": "bandwidth_mbps",
      "min": 1000,
      "max": 10000,
      "step": 1000,
      "price": { "amount": 15, "currency": "USD", "interval": "month", "per": 1000 }
    }
  }
}
```

The smallest valid block states the port:

```json
{ "network": { "bandwidth_mbps": 1000 } }
```

The rules, and every one degrades:

1. **`bandwidth_mbps` is required.** It is the port speed in megabits per second, the same unit OpenServer uses. A shaped link states the shaped rate, not the physical port.
2. **`metering`** is one of `transfer`, `unmetered`, `percentile`, `flat`. `transfer` counts gigabytes per interval against `transfer_gb`. `unmetered` has no cap and `transfer_gb` is absent. `percentile` bills on the 95th percentile of utilisation, and `commit_mbps` is the committed rate included in the price. `flat` is a fixed price for the port, whatever passes. Absent with `transfer_gb` present means `transfer`; absent otherwise means unstated.
3. **`transfer_gb`** is included traffic per the offer's price interval, in gigabytes. **`counts`** says which direction is counted: `egress`, `ingress`, `both`, or `max` for the larger of the two. Absent means unstated, and a directory does not assume egress.
4. **`overage`** is the price of traffic past `transfer_gb`, as an `amount` in `currency` per `per_gb` gigabytes. Absent with a cap means the provider throttles or stops rather than bills, and `over_cap` may say which: `bill`, `throttle`, `suspend`.
5. **`ipv4`** is how many IPv4 addresses are included, an integer, as OpenServer states it. **`ipv4_price`** is the price of each additional address at the offer's interval, and **`ipv4_max`** the most the provider will assign. `0` included with a price means addresses are sold separately. **`ipv6`** is a boolean, as OpenServer states it, or the prefix length assigned as a string (`/64`, `/56`), which a reader treats as true.
6. **`ddos`** is `always-on`, `on-demand`, `none`, or absent for unstated. It states that mitigation exists, not what it withstands; the provider's terms say that. **`private_network`** is whether the offer has a private LAN to other servers of the same buyer. **`uplinks`** is the count of physical links on a dedicated box.
7. **`range`** is the negotiable part. `key` is `bandwidth_mbps`, `transfer_gb` or `ipv4`, `min`, `max` and `step` bound it, and `price` is the cost per `per` units at the offer's interval, on top of the base price. A block may carry more than one range as a list under `ranges` when two fields are negotiable; `range` alone is the common case.
8. **Unknown keys are kept.** A provider may say more; a reader passes it through under the provider's key.

## Network as its own offer

Bandwidth and addresses are sold without a server more often than any other resource: IP transit at the 95th percentile, a CDN's egress by the gigabyte, a leased IPv4 block, a cross-connect in a colocation facility. Each is an OpenServer offer with a `network` block and a `price`:

```json
{
  "id": "transit-1g",
  "name": "IP transit 1 Gbps",
  "kind": "colocation",
  "network": { "bandwidth_mbps": 1000, "metering": "percentile", "commit_mbps": 100, "overage": { "amount": 0.35, "currency": "USD", "per_mbps": 1 } },
  "price": { "amount": 35, "currency": "USD", "interval": "month" }
}
```

```json
{
  "id": "ipv4-24",
  "name": "IPv4 /24 lease",
  "kind": "colocation",
  "network": { "bandwidth_mbps": 0, "ipv4": 256, "ipv4_prefix": "/24" },
  "price": { "amount": 130, "currency": "USD", "interval": "month", "commitment": "12 months" }
}
```

A percentile overage is priced per megabit, so `overage` carries `per_mbps` in place of `per_gb`. An address lease states `bandwidth_mbps: 0`, because the rule wants a port and there is none, and `ipv4_prefix` says the block size. A provider whose file is only network offers may serve it at `/.well-known/openbandwidth.json`; the shape is OpenServer's and the name says what is in it. A reader that only wants network filters offers on the presence of a `network` block.

## What a directory does with it

1. **Shows the meter beside the port.** 1 Gbps unmetered and 1 Gbps with 20 TB are two rows with two words, not one number.
2. **Prices a month of traffic.** For a `transfer` offer a directory can show what a stated volume would cost, base plus overage, and says which volume it assumed.
3. **Lists addresses as a resource.** Included count, price of more, ceiling. A row with `ipv4: 0` and no price is marked unstated, not free.
4. **Never assumes direction.** A cap with no `counts` is shown as a cap, with the direction unstated.

## What is deliberately absent

**No speed test.** `bandwidth_mbps` is the port the provider sells. Achieved throughput to any destination is a measurement and another document's business.

**No carrier list or peering.** Which transit providers and exchanges sit behind the port is the provider's network page, linked from the offer's `url`. A provider that wants to state ASN or upstreams does so under its own key.

**No latency or geography beyond OpenServer's `location`.** Where the box is comes from the offer. Round-trip times to anywhere are a measurement.

**No SLA.** Uptime percentages and credits are the provider's terms.

## Related standards

- [OpenServer](/docs/openserver): the descriptor and the offer this block sits in.
- [OpenCPU](/docs/opencpu), [OpenMemory](/docs/openmemory), [OpenDisk](/docs/opendisk), [OpenGPU](/docs/opengpu): the other four resources of a purchase, each with the same `range` shape.
- [OpenStream](/docs/openstream): the relay envelope a byte stream crosses a network in; unrelated to how the network is sold.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the network block, four meters, overage, addresses as a priced resource, the range. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
