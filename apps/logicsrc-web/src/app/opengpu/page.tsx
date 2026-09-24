import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { ResourceSpecPage, type ResourceSpec } from "@/components/resource-spec-page";

export const metadata: Metadata = specMetadata(
  "/opengpu",
  "OpenGPU is the gpu block of an OpenServer offer: the card by its vendor name, count and VRAM per device, the interconnect between them, passthrough, MIG, vGPU or shared access, and a range that says how many more a buyer can add at checkout and for how much."
);

const SPEC: ResourceSpec = {
  name: "OpenGPU",
  slug: "opengpu",
  block: "gpu",
  tagline:
    "The accelerator line of a server purchase, with the words fixed: which card, how many, how much memory, how they are joined, whole or a slice, and what one more costs.",
  problem:
    "The same card is sold whole, as a MIG slice, as a time-shared vGPU and as a peer's idle desktop, at prices an order of magnitude apart, and a listing that says one A100 has said almost nothing: 40 or 80 GB, PCIe or SXM, NVLinked or not. The peer markets move by the minute and publish their own schemas. A buyer's agent asked for two 80 GB cards with NVLink under 4 an hour reads six catalogs six ways.",
  sample: `{
  "gpu": {
    "model": "NVIDIA H100 SXM",
    "vendor": "NVIDIA",
    "count": 8,
    "vram_mb": 81920,
    "arch": "Hopper",
    "interconnect": "nvlink",
    "access": "passthrough",
    "driver": "550",
    "runtime": "CUDA 12.4",
    "range": {
      "key": "count", "min": 1, "max": 8, "step": 1,
      "price": { "amount": 2.49, "currency": "USD", "interval": "hour", "per": 1 }
    }
  }
}`,
  smallest: `{ "gpu": { "model": "NVIDIA RTX 4090" } }`,
  fields: [
    ["model, vendor, arch", "the vendor's own name, required", "Including the form factor when the vendor distinguishes one: H100 SXM and H100 PCIe are two models."],
    ["count, vram_mb", "integer; mebibytes per device", "80 GB is 81920. A reader multiplies for the total and never assumes the provider did."],
    ["interconnect", "nvlink, nvswitch, infinity-fabric, pcie, none", "How the devices in one offer are joined. A single card states nothing."],
    ["access", "passthrough, mig, vgpu, shared", "The whole device, a hardware partition (profile or fraction), a virtualised share, or time-sliced with neighbours."],
    ["driver, runtime", "version strings", "What the provider installs by default; absent means the buyer installs their own."],
    ["range", "key count, min, max, step, price", "One offer per model; the range is over how many."]
  ],
  directory: [
    ["Keep the model, match beside it", "NVIDIA H100 SXM and H100-SXM5-80GB are one card for search and two spellings on the page."],
    ["Access beside VRAM", "A MIG slice and a whole card share a model and differ in everything else."],
    ["Per-device price", "Computed from price and count so a row of eight and a row of one sort together, and labelled as computed."],
    ["Stock with its timestamp", "GPU stock goes stale first; every row says when it was read."]
  ],
  absent: [
    ["No TFLOPS", "Vendor throughput depends on precision, sparsity and clock, and no two vendors quote it alike."],
    ["No reservation calendar", "Whether a card is free next Tuesday is the provider's scheduler. stock says now."],
    ["No spot flag", "A card at a spot price is a second offer; price.commitment and the url carry the terms."]
  ]
};

export default function OpenGpuPage(): ReactNode {
  return <ResourceSpecPage spec={SPEC} />;
}
