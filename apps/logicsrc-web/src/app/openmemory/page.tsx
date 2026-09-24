import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { ResourceSpecPage, type ResourceSpec } from "@/components/resource-spec-page";

export const metadata: Metadata = specMetadata(
  "/openmemory",
  "OpenMemory is the memory block of an OpenServer offer: RAM in mebibytes, DDR generation and speed, ECC as three states, reserved or balloonable allocation, and a range that says how much more a buyer can add at checkout and for how much."
);

const SPEC: ResourceSpec = {
  name: "OpenMemory",
  slug: "openmemory",
  block: "memory",
  tagline:
    "The memory line of a server purchase, with the words fixed: how much, what kind, whether it is corrected, whether it is yours, and what a step more costs.",
  problem:
    "Memory is the resource most often bought in increments and least often described. A configurator offers 64, 128 or 256 GB at three prices and a scraper records the default. Eight gigabytes on a VPS may be reserved or may be reclaimed by the host under pressure. Whether the DIMMs are error-corrected decides whether a database belongs on the machine, and almost no listing says.",
  sample: `{
  "memory": {
    "ram_mb": 65536,
    "type": "DDR5",
    "ecc": true,
    "speed_mts": 4800,
    "channels": 8,
    "allocation": "reserved",
    "hugepages": true,
    "range": {
      "key": "ram_mb", "min": 32768, "max": 1048576, "step": 32768,
      "price": { "amount": 12, "currency": "USD", "interval": "month", "per": 32768 }
    }
  }
}`,
  smallest: `{ "memory": { "ram_mb": 8192 } }`,
  fields: [
    ["ram_mb", "integer mebibytes, required", "What the guest sees. 8 GiB is 8192, the same unit OpenServer uses. Wins over compute.ram_mb when both are present."],
    ["type, speed_mts, channels", "DDR4, DDR5, LPDDR5, HBM3; MT/s; integer", "The vendor's rating, stated not measured."],
    ["ecc", "true, false, absent", "Three states. A directory never shows absent as false."],
    ["allocation", "reserved, balloonable, shared", "Backed and never reclaimed, reclaimable under host pressure, or oversubscribed."],
    ["swap_mb, hugepages", "integer, boolean", "Swap the provider configures by default; whether huge pages are allowed."],
    ["range", "key, min, max, step, price", "Memory sold in steps: the example is 32 GiB steps at 12 USD a month each."]
  ],
  directory: [
    ["Mebibytes as the provider's unit", "Store ram_mb; display GiB or GB as the provider's page does, and say which."],
    ["ECC as three states", "Yes, no and unstated are three filters."],
    ["Price the range", "A configurator's three sizes are one offer with a range, shown as base plus step."],
    ["memory before compute.ram_mb", "Read the block first and never sum the two."]
  ],
  absent: [
    ["No bandwidth or latency", "speed_mts is the DIMM rating. Measured memory bandwidth is a benchmark."],
    ["No persistent-memory tier", "Persistent and CXL-attached memory sit under the provider's own key until there is a second provider to agree with."],
    ["No per-process limits", "cgroup limits on a container platform are the platform's terms, linked from the offer's url."]
  ]
};

export default function OpenMemoryPage(): ReactNode {
  return <ResourceSpecPage spec={SPEC} />;
}
