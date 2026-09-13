import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ResourceSpecPage, type ResourceSpec } from "@/components/resource-spec-page";

export const metadata: Metadata = {
  title: "OpenCPU · LogicSRC",
  description:
    "OpenCPU is the compute block of an OpenServer offer: threads against cores, the processor by its vendor name, dedicated, shared or burstable allocation, and a range that says how many more a buyer can add at checkout and for how much.",
  alternates: { canonical: "/opencpu" }
};

const SPEC: ResourceSpec = {
  name: "OpenCPU",
  slug: "opencpu",
  block: "compute",
  tagline:
    "The processor line of a server purchase, with the words fixed: threads or cores, whose they are, and what one more costs.",
  problem:
    "Four vCPU on one pricing page is four hyperthreads of a shared socket, throttled at a fifth of sustained load. On the next it is four dedicated cores with the boost clock quoted. A comparison site sorts both on the number four, and the buyer who wanted the second pays for the first. A configurator that offers three processors at three prices keeps that choice in a form where no reader can see it.",
  sample: `{
  "compute": {
    "vcpu": 4,
    "cores": 2,
    "threads_per_core": 2,
    "arch": "x86_64",
    "model": "AMD EPYC 9354",
    "vendor": "AMD",
    "base_ghz": 3.25,
    "boost_ghz": 3.75,
    "allocation": "dedicated",
    "range": {
      "key": "vcpu", "min": 2, "max": 32, "step": 2,
      "price": { "amount": 4, "currency": "USD", "interval": "month", "per": 1 }
    }
  }
}`,
  smallest: `{ "compute": { "vcpu": 4 } }`,
  fields: [
    ["vcpu / cores", "integer, one required", "Threads sold to the guest, or physical cores. threads_per_core relates them; a reader never derives one from the other without it."],
    ["arch", "x86_64, arm64, riscv64, or the provider's word", "Absent means unstated, not x86."],
    ["model, vendor", "the vendor's own name", "AMD EPYC 9354, Ampere Altra Max. Kept verbatim so a buyer can look it up."],
    ["base_ghz, boost_ghz, sockets", "decimal GHz, integer", "The vendor's figures, not a measurement."],
    ["allocation", "dedicated, shared, burstable", "Reserved for the buyer, oversubscribed, or shared with a credit balance (credits_per_hour, baseline_pct)."],
    ["range", "key, min, max, step, price", "What the buyer can dial at checkout and what each step costs on top of the base price."]
  ],
  directory: [
    ["Two columns", "vcpu and cores are sorted separately; a row with neither is listed and marked unstated."],
    ["Allocation beside the count", "Four dedicated threads and four shared ones are different products at the same number."],
    ["Price the range", "Base price plus the per-step price, so 8 vCPU reads as base plus four steps."],
    ["Keep the model string", "Normalise for search, display the vendor's spelling."]
  ],
  absent: [
    ["No benchmarks", "Clock figures are the vendor's. A measured score is another document's business."],
    ["No instruction-set flags", "AVX-512, SVE and the rest: look up model. A provider that wants them states them under its own key."],
    ["No scheduling guarantees", "Pinning, NUMA and latency are the provider's terms, linked from the offer's url."]
  ]
};

export default function OpenCpuPage(): ReactNode {
  return <ResourceSpecPage spec={SPEC} />;
}
