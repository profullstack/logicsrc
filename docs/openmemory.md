# OpenMemory

OpenMemory is the shape of one resource in a server purchase: the memory. It says how much RAM an offer has, what kind, whether it is error-corrected, whether it is reserved for the buyer or balloonable, and how much more a buyer may add at checkout and for how much. It is the `memory` block of an [OpenServer](/docs/openserver) offer, written down on its own so a configurator that sells RAM by the gigabyte, a provider that sells memory-optimised instances and a directory that filters on it all mean the same thing by the same key. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. One of five resource specifications under OpenServer: [OpenCPU](/docs/opencpu), OpenMemory, [OpenDisk](/docs/opendisk), [OpenGPU](/docs/opengpu) and [OpenBandwidth](/docs/openbandwidth). Each describes one thing that is negotiable when a server is bought.

Slug: `openmemory`

## The problem

Memory is the resource most often bought in increments and least often described. A dedicated-server configurator offers 64, 128 or 256 GB at three prices, and the difference between them is the whole reason to pick the box, but a scraper sees the default and a directory lists one number. "8 GB" on a VPS may be 8 GiB reserved, or 8 GB of which the host reclaims half under pressure. Whether the DIMMs are error-corrected decides whether a database belongs on the machine, and almost no listing says.

The memory line of a spec sheet is short. This document makes it say what it means.

## Terms

- The **memory block** is the `memory` object on an OpenServer offer, or the same object served on its own.
- **Reserved** memory is backed by physical memory the host will not reclaim. **Balloonable** memory may be reclaimed by the host under pressure. **Shared** memory is oversubscribed with neighbours.
- A **range** is what the buyer may change at checkout, with the price of changing it.

## The memory block

```json
{
  "memory": {
    "ram_mb": 65536,
    "type": "DDR5",
    "ecc": true,
    "speed_mts": 4800,
    "channels": 8,
    "allocation": "reserved",
    "swap_mb": 0,
    "hugepages": true,
    "range": {
      "key": "ram_mb",
      "min": 32768,
      "max": 1048576,
      "step": 32768,
      "price": { "amount": 12, "currency": "USD", "interval": "month", "per": 32768 }
    }
  }
}
```

The smallest valid block states the size:

```json
{ "memory": { "ram_mb": 8192 } }
```

The rules, and every one degrades:

1. **`ram_mb` is required.** It is the memory the guest sees, in mebibytes, the same unit OpenServer uses in `compute.ram_mb`. 8 GiB is 8192. A provider that sells in decimal gigabytes converts once when it writes the file, so every reader adds the same numbers.
2. **`type`** is the memory technology as the vendor names it: `DDR4`, `DDR5`, `LPDDR5`, `HBM3`, or the provider's own word. `speed_mts` is the rated transfer rate in megatransfers per second. `channels` is the populated channel count on a dedicated box. All three are stated, not measured.
3. **`ecc`** is a boolean. Absent means unstated, and a directory that lets a buyer filter on ECC shows unstated rows as unstated, never as false.
4. **`allocation`** is one of `reserved`, `balloonable`, `shared`. Absent means unstated. A dedicated server is `reserved` by nature and may say so.
5. **`swap_mb`** is swap the provider configures by default, in mebibytes; `0` means none and absent means unstated. **`hugepages`** is whether the buyer may use huge pages, a boolean.
6. **`range`** is the negotiable part. `key` is `ram_mb`, `min`, `max` and `step` bound it in mebibytes, and `price` is the cost per `per` mebibytes at the offer's interval, on top of the base price. The example above says memory is sold in 32 GiB steps at 12 USD a month each. An offer with no `range` is sold as stated.
7. **This block wins over `compute.ram_mb`.** OpenServer 0.1 puts `ram_mb` inside `compute`. A provider may keep it there for readers that predate this document; when a `memory` block is present, its `ram_mb` is the one a reader uses.
8. **Unknown keys are kept.** A provider may say more; a reader passes it through under the provider's key.

## Memory as its own offer

Memory is rarely sold alone, but it is sold as an increment, and the increment is an offer: a RAM upgrade on a configurator, a memory-optimised tier that differs from the base tier only here, a reservation of memory on a platform that bills it separately from compute. Each is an OpenServer offer with a `memory` block and a `price`:

```json
{
  "id": "ram-32",
  "name": "32 GB RAM upgrade",
  "kind": "dedicated",
  "memory": { "ram_mb": 32768, "type": "DDR5", "ecc": true },
  "price": { "amount": 12, "currency": "USD", "interval": "month" }
}
```

A provider whose file is only memory offers may serve it at `/.well-known/openmemory.json`; the shape is OpenServer's and the name says what is in it. A reader that only wants memory filters offers on the presence of a `memory` block.

## What a directory does with it

1. **Shows mebibytes as the provider's unit.** Store `ram_mb`; display 8 GiB or 8 GB as the provider's page does, and say which.
2. **Filters on ECC as three states**, yes, no and unstated.
3. **Prices the range.** A configurator's 64, 128 and 256 GB choices are one offer with a range, and a directory shows the base and the step price rather than three rows.
4. **Reads `memory` before `compute.ram_mb`** and never sums the two.

## What is deliberately absent

**No bandwidth or latency figures.** `speed_mts` is the DIMM rating. Measured memory bandwidth is a benchmark, and benchmarks are another document's business.

**No persistent memory tier.** Optane-style persistent memory and CXL-attached memory are storage or memory depending on the provider; a provider states them under its own key until there is a second one to agree with.

**No per-process limits.** cgroup memory limits on a container platform are the platform's terms, linked from the offer's `url`.

## Related standards

- [OpenServer](/docs/openserver): the descriptor and the offer this block sits in.
- [OpenCPU](/docs/opencpu), [OpenDisk](/docs/opendisk), [OpenGPU](/docs/opengpu), [OpenBandwidth](/docs/openbandwidth): the other four resources of a purchase, each with the same `range` shape.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the memory block, ECC as three states, three allocations, the range, precedence over `compute.ram_mb`. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
