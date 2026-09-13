# OpenGPU

OpenGPU is the shape of one resource in a server purchase: the accelerator. It says which GPU an offer has, how many, how much memory each carries, how they are joined, whether the buyer gets the whole card or a slice of it, and how many more a buyer may add at checkout and for how much. It is the `gpu` block of an [OpenServer](/docs/openserver) offer, written down on its own so a cloud selling H100 hours, a peer renting a gaming card and a directory that filters on VRAM all mean the same thing by the same key. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. One of five resource specifications under OpenServer: [OpenCPU](/docs/opencpu), [OpenMemory](/docs/openmemory), [OpenDisk](/docs/opendisk), OpenGPU and [OpenBandwidth](/docs/openbandwidth). Each describes one thing that is negotiable when a server is bought.

Slug: `opengpu`

## The problem

GPU pricing is the most volatile and least comparable line in hosting. The same card is sold whole, as a MIG slice, as a time-shared vGPU and as a peer's idle desktop, at prices an order of magnitude apart, and a listing that says "1x A100" has said almost nothing: 40 GB or 80 GB, PCIe or SXM, NVLinked to its neighbours or not. The peer-to-peer markets move by the minute and publish their own schemas. A buyer's agent asked for "two 80 GB cards with NVLink, under 4 an hour, in stock" reads six catalogs six ways.

This document fixes the words, and it fixes them so a marketplace listing and a hyperscaler SKU can sit in one column.

## Terms

- The **gpu block** is the `gpu` object on an OpenServer offer, inside `compute` as OpenServer 0.1 places it, or beside it.
- **Access** is how the buyer reaches the silicon: the whole device, a hardware partition, a virtualised share, or a time-shared queue.
- An **interconnect** is how the cards in one offer talk to each other.
- A **range** is what the buyer may change at checkout, with the price of changing it.

## The gpu block

```json
{
  "gpu": {
    "model": "NVIDIA H100 SXM",
    "vendor": "NVIDIA",
    "count": 8,
    "vram_mb": 81920,
    "arch": "Hopper",
    "interconnect": "nvlink",
    "access": "passthrough",
    "fraction": 1,
    "driver": "550",
    "runtime": "CUDA 12.4",
    "range": {
      "key": "count",
      "min": 1,
      "max": 8,
      "step": 1,
      "price": { "amount": 2.49, "currency": "USD", "interval": "hour", "per": 1 }
    }
  }
}
```

The smallest valid block states the model:

```json
{ "gpu": { "model": "NVIDIA RTX 4090" } }
```

The rules, and every one degrades:

1. **`model` is required.** It is the card as the vendor names it, unchanged, including the form factor when the vendor distinguishes one (`NVIDIA H100 SXM`, `NVIDIA H100 PCIe`, `AMD Instinct MI300X`). `vendor` is the maker. `arch` is the vendor's architecture name.
2. **`count`** is how many devices the offer includes; absent means 1. **`vram_mb`** is the memory of one device in mebibytes, the same unit OpenServer uses. 80 GB is 81920. A reader multiplies by `count` for the total and never assumes the provider did.
3. **`interconnect`** is how the devices in the offer are joined: `nvlink`, `nvswitch`, `infinity-fabric`, `pcie`, or `none` when they are independent cards. It describes the offer, so a single card states nothing here.
4. **`access`** is one of `passthrough`, `mig`, `vgpu`, `shared`. `passthrough` is the whole device. `mig` is a hardware partition and `fraction` or `profile` says which: `profile` is the vendor's name (`1g.10gb`), `fraction` the share as a decimal (`0.125`). `vgpu` is a virtualised share with `fraction`. `shared` is time-sliced with neighbours and no fixed share. Absent means unstated, and a directory that sorts by VRAM says so beside the number.
5. **`driver`** and **`runtime`** are what the provider installs by default, as version strings; absent means the buyer installs their own. A bare-metal offer usually states nothing here.
6. **`range`** is the negotiable part. `key` is `count`, `min`, `max` and `step` bound it, and `price` is the cost per `per` devices at the offer's interval, on top of the base price. A provider that offers several cards lists one offer per `model`, because a model is a name, not a number.
7. **Position.** OpenServer 0.1 places `gpu` inside `compute`. A provider may also place it at the top level of the offer; a reader looks in both places and a block at the top level wins.
8. **Unknown keys are kept.** A provider may say more; a reader passes it through under the provider's key.

## GPU as its own offer

GPU is already an OpenServer `kind`, because the accelerator is what is sold and the host beside it is incidental. An offer of `kind: gpu` states the block and a price, and the `compute` and `memory` around it describe the host:

```json
{
  "id": "h100-1",
  "name": "H100 80GB x1",
  "kind": "gpu",
  "compute": { "vcpu": 26, "arch": "x86_64" },
  "memory": { "ram_mb": 229376 },
  "gpu": { "model": "NVIDIA H100 SXM", "count": 1, "vram_mb": 81920, "access": "passthrough" },
  "price": { "amount": 2.49, "currency": "USD", "interval": "hour" },
  "stock": "in_stock"
}
```

A peer-to-peer market lists each ask the same way with `model: p2p` on the offer, and the market's `updated` on the offer says how fresh the price is. A provider whose file is only accelerator offers may serve it at `/.well-known/opengpu.json`; the shape is OpenServer's and the name says what is in it. A reader that only wants accelerators filters on the presence of a `gpu` block or `kind: gpu`.

## What a directory does with it

1. **Keeps the model string and normalises beside it.** `NVIDIA H100 SXM` and `H100-SXM5-80GB` are the same card; the directory matches them for search and shows the provider's spelling.
2. **Shows access beside VRAM.** A MIG slice of an H100 and a whole H100 share a model and differ in everything else.
3. **Computes the per-device price** from `price` and `count`, so a row for 8 cards and a row for 1 sort together, and says it did.
4. **Reads stock with its timestamp.** GPU stock is the field that goes stale first, and a directory shows when each row was read.

## What is deliberately absent

**No benchmarks or TFLOPS.** Vendor throughput figures depend on precision, sparsity and clock, and no two vendors quote them alike. A provider that wants to state them does so under its own key; a directory that measures publishes its own numbers under its own name.

**No reservation calendar.** Whether a card is free next Tuesday is the provider's scheduler. `stock` says now.

**No spot or preemptible flag.** OpenServer's `price.commitment` and the offer's `url` carry the terms; a provider selling the same card at a spot price lists a second offer.

## Related standards

- [OpenServer](/docs/openserver): the descriptor, the `gpu` kind and the offer this block sits in.
- [OpenCPU](/docs/opencpu), [OpenMemory](/docs/openmemory), [OpenDisk](/docs/opendisk), [OpenBandwidth](/docs/openbandwidth): the other four resources of a purchase, each with the same `range` shape.
- [OpenSwarm](/openswarm) and c0mpute: a peer renting its card lists it with this block and settles under OpenSwarm.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the gpu block, four access modes, interconnects, the range, position inside or beside `compute`. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
