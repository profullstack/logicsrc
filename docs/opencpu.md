# OpenCPU

OpenCPU is the shape of one resource in a server purchase: the processor. It says how many cores or threads an offer has, what they are, whether they are yours alone or shared, and how many more a buyer may add at checkout and for how much. It is the `compute` block of an [OpenServer](/docs/openserver) offer, written down on its own so a provider that sells only compute, a configurator that sells it by the core and a directory that filters on it all mean the same thing by the same key. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. One of five resource specifications under OpenServer: OpenCPU, [OpenMemory](/docs/openmemory), [OpenDisk](/docs/opendisk), [OpenGPU](/docs/opengpu) and [OpenBandwidth](/docs/openbandwidth). Each describes one thing that is negotiable when a server is bought.

Slug: `opencpu`

## The problem

"4 vCPU" on one pricing page is four hyperthreads of a shared socket that will be throttled at 20% sustained load. On the next page it is four dedicated cores with the boost clock quoted. A comparison site collapses both into a column called CPU and sorts on the number, and the buyer who wanted the second pays for the first. A dedicated-server configurator lets a buyer choose between three processors and the price changes, but that choice lives in a form and nowhere a reader can see it. A buyer's agent asked for "8 dedicated cores, x86, under 40 a month" cannot answer from the number 8.

The processor is one line of a spec sheet, but it is the line with the most ways to say the same thing, so this document fixes the words.

## Terms

- The **compute block** is the `compute` object on an OpenServer offer, or the same object served on its own.
- A **thread** is what a hypervisor hands a guest; a **core** is what the silicon has. Providers sell either, and this document keeps them apart.
- An **allocation** is whether the threads sold are reserved for the buyer, shared with neighbours, or shared with a credit balance that allows bursts.
- A **range** is what the buyer may change at checkout, with the price of changing it.

## The compute block

```json
{
  "compute": {
    "vcpu": 4,
    "cores": 2,
    "threads_per_core": 2,
    "arch": "x86_64",
    "model": "AMD EPYC 9354",
    "vendor": "AMD",
    "base_ghz": 3.25,
    "boost_ghz": 3.75,
    "sockets": 1,
    "allocation": "dedicated",
    "range": {
      "key": "vcpu",
      "min": 2,
      "max": 32,
      "step": 2,
      "price": { "amount": 4, "currency": "USD", "interval": "month", "per": 1 }
    }
  }
}
```

The smallest valid block states one count:

```json
{ "compute": { "vcpu": 4 } }
```

The rules, and every one degrades:

1. **One of `vcpu` or `cores` is required.** `vcpu` is threads sold to the guest; `cores` is physical cores. A virtual offer states `vcpu`, a dedicated box states `cores`, and one may state both, with `threads_per_core` (1 or 2) saying how they relate. A reader never derives one from the other unless `threads_per_core` is stated.
2. **`arch`** is `x86_64`, `arm64`, `riscv64` or the provider's own word. Absent means unstated, not x86.
3. **`model`** is the processor as the vendor names it, unchanged, so a buyer can look it up. `vendor` is the maker (`AMD`, `Intel`, `Ampere`, `Apple`, `AWS` for Graviton). `base_ghz` and `boost_ghz` are the vendor's clock figures in gigahertz, not a measurement. `sockets` is how many packages a dedicated box has.
4. **`allocation`** is one of `dedicated`, `shared`, `burstable`. `dedicated` means the threads are reserved for this buyer. `shared` means they are oversubscribed with neighbours and sustained use may be limited. `burstable` means shared with a credit balance: `credits_per_hour` says how many CPU credits accrue and `baseline_pct` the sustained share the buyer is entitled to without spending them. Absent means unstated, and a directory that sorts by core count says so beside the number.
5. **`range`** is the negotiable part. `key` names the field the buyer changes (`vcpu` or `cores`), `min`, `max` and `step` bound it, and `price` is the cost per `per` units at the offer's interval, on top of the offer's base price. An offer with no `range` is sold as stated. A configurator with a choice of processors lists one offer per processor rather than a range over `model`, because a model is a name, not a number.
6. **`ram_mb` may sit here for compatibility** with OpenServer 0.1, and a reader accepts it. The memory block in [OpenMemory](/docs/openmemory) is where memory belongs; when both are present the memory block wins.
7. **Unknown keys are kept.** A provider may say more; a reader passes it through under the provider's key.

Units are fixed: counts are integers, clocks are gigahertz as decimals, percentages are integers 0 to 100.

## Compute as its own offer

A provider that sells compute without a server, a batch platform billing by the vCPU-hour, a peer on a marketplace renting its idle cores, a configurator selling core upgrades, lists it as an OpenServer offer whose `compute` block carries the goods and whose `price` says what a unit costs:

```json
{
  "id": "batch-vcpu-hour",
  "name": "Batch vCPU",
  "kind": "serverless",
  "compute": { "vcpu": 1, "arch": "x86_64", "allocation": "dedicated" },
  "price": { "amount": 0.021, "currency": "USD", "interval": "hour" }
}
```

A provider that sells only compute may serve its OpenServer descriptor at `/.well-known/opencpu.json` as well as, or instead of, `/.well-known/openserver.json`. The document is the same shape; the name says what a reader will find in it. A reader that only wants compute filters offers on the presence of a `compute` block.

## What a directory does with it

1. **Sorts on what was stated.** `vcpu` and `cores` are two columns, not one. A row with neither is listed and marked unstated.
2. **Shows allocation beside the count.** Four dedicated threads and four shared ones are different products at the same number, and the directory shows the word.
3. **Prices the range.** An offer with a `range` is shown at its base price with the per-unit price alongside, so a buyer can see that 8 vCPU costs the base plus four steps.
4. **Keeps the model string.** Normalise for search; display the vendor's name.

## What is deliberately absent

**No benchmarks.** Clock figures are the vendor's; a measured score is another document's business, and a directory that publishes one labels it as its own.

**No instruction-set flags.** AVX-512, SVE, virtualisation extensions: a buyer who needs one looks up `model`. A provider that wants to state them does so under its own key.

**No scheduling guarantees.** `allocation` says reserved, shared or burstable. Latency, NUMA placement and pinning are the provider's terms, linked from the offer's `url`.

## Related standards

- [OpenServer](/docs/openserver): the descriptor and the offer this block sits in.
- [OpenMemory](/docs/openmemory), [OpenDisk](/docs/opendisk), [OpenGPU](/docs/opengpu), [OpenBandwidth](/docs/openbandwidth): the other four resources of a purchase, each with the same `range` shape.
- [OpenSwarm](/openswarm) and c0mpute: a peer renting its cores lists them with this block and settles under OpenSwarm.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the compute block, threads against cores, three allocations, the range. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
