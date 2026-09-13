import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ResourceSpecPage, type ResourceSpec } from "@/components/resource-spec-page";

export const metadata: Metadata = {
  title: "OpenBandwidth · LogicSRC",
  description:
    "OpenBandwidth is the network block of an OpenServer offer: port speed, how traffic is metered (transfer, unmetered, 95th percentile, flat), what overage costs, IPv4 and IPv6 addresses as a priced resource, DDoS scrubbing, and a range that says what a buyer can add at checkout and for how much.",
  alternates: { canonical: "/openbandwidth" }
};

const SPEC: ResourceSpec = {
  name: "OpenBandwidth",
  slug: "openbandwidth",
  block: "network",
  tagline:
    "The network line of a server purchase, with the words fixed: the port, the meter, the overage, the addresses, and what more of any of them costs.",
  problem:
    "Unmetered 1 Gbps, 1 Gbps with 20 TB, and 1 Gbps at the 95th percentile with 100 Mbps committed are three products that every comparison site shows as 1 Gbps. The surprise on the invoice is always the network line: overage at a cent a gigabyte here and nine there, ingress free or billed, a second IPv4 address at two a month or unavailable at any price. IPv4 is now a market of its own, leased by the /24, and no catalog format has a place for it.",
  sample: `{
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
    "range": {
      "key": "bandwidth_mbps", "min": 1000, "max": 10000, "step": 1000,
      "price": { "amount": 15, "currency": "USD", "interval": "month", "per": 1000 }
    }
  }
}`,
  smallest: `{ "network": { "bandwidth_mbps": 1000 } }`,
  fields: [
    ["bandwidth_mbps", "integer, required", "The port speed sold. A shaped link states the shaped rate."],
    ["metering", "transfer, unmetered, percentile, flat", "Gigabytes against transfer_gb, no cap, 95th percentile with commit_mbps, or a fixed price for the port."],
    ["transfer_gb, counts", "integer per interval; egress, ingress, both, max", "Included traffic and which direction counts. A reader never assumes egress."],
    ["overage, over_cap", "amount, currency, per_gb or per_mbps; bill, throttle, suspend", "What traffic past the cap costs, or what happens instead."],
    ["ipv4, ipv4_price, ipv4_max, ipv6", "integer; price per address; integer; boolean or prefix", "Addresses as a resource: included, the price of more, the ceiling, and the IPv6 assignment."],
    ["ddos, private_network, uplinks", "always-on, on-demand, none; boolean; integer", "That mitigation exists, a private LAN, physical links on a dedicated box."],
    ["range", "key bandwidth_mbps, transfer_gb or ipv4; min, max, step, price", "What the buyer can dial and what a step costs."]
  ],
  directory: [
    ["Meter beside the port", "1 Gbps unmetered and 1 Gbps with 20 TB are two rows with two words."],
    ["Price a month of traffic", "Base plus overage at a stated volume, with the volume shown."],
    ["Addresses as a resource", "Included count, price of more, ceiling. Zero with no price is unstated, not free."],
    ["Never assume direction", "A cap with no counts is a cap with the direction unstated."]
  ],
  absent: [
    ["No speed test", "bandwidth_mbps is the port sold. Achieved throughput is a measurement."],
    ["No carriers or peering", "Upstreams and exchanges are the provider's network page. An ASN goes under the provider's own key."],
    ["No SLA", "Uptime percentages and credits are the provider's terms, linked from the offer's url."]
  ]
};

export default function OpenBandwidthPage(): ReactNode {
  return <ResourceSpecPage spec={SPEC} />;
}
