import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenServer · LogicSRC",
  description:
    "OpenServer is one file a hosting provider serves about what it sells: every server, instance, rack, function and peer-market listing, with specs, price, location and stock, at /.well-known/openserver.json. Cloud, VPS, dedicated, bare metal, colocation, on-prem, managed, unmanaged, PaaS, serverless, storage, GPU, edge and p2p.",
  alternates: { canonical: "/openserver" }
};

const DESCRIPTOR = `{
  "provider": {
    "name": "Northwind Hosting",
    "web": "https://northwind.example",
    "operator": "https://northwind.example/.well-known/openprofile.md",
    "country": "NL",
    "status": "https://status.northwind.example"
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
      "stock": "in_stock"
    }
  ]
}`;

const MINIMAL = `{ "provider": { "name": "Northwind Hosting" }, "offers": [{ "name": "ARM 4" }] }`;

const KINDS: Array<[string, string]> = [
  ["cloud", "a virtual machine on a cloud platform, billed by the hour or the second, with an API"],
  ["vps", "a virtual private server, billed by the month"],
  ["dedicated", "a whole physical server rented from the provider's rack"],
  ["bare-metal", "a whole physical server with cloud-style provisioning and hourly billing"],
  ["colocation", "rack space, power and network for a server the buyer owns"],
  ["on-prem", "hardware or an appliance sold or leased to run on the buyer's premises"],
  ["shared", "a slice of a server the provider administers, typically web hosting with a control panel"],
  ["managed", "a server the provider runs for the buyer, sold as the service rather than the box"],
  ["paas", "a platform that takes code and runs it, with no server the buyer sees"],
  ["serverless", "functions or containers billed by invocation or by the second of use"],
  ["storage", "object, block or file storage sold on its own"],
  ["gpu", "compute sold for the accelerator, whatever runs beside it"],
  ["edge", "compute placed near users at many small points of presence"],
  ["p2p", "a listing on a decentralised marketplace where the seller is a peer, not the operator"],
  ["hybrid", "a bundle that spans premises, such as an appliance with a cloud control plane"]
];

const AXES: Array<[string, string, string]> = [
  ["premises", "on-prem, off-prem, hybrid", "where the hardware physically is"],
  ["management", "managed, unmanaged, co-managed", "who administers the operating system and what runs on it"],
  ["tenancy", "shared, dedicated", "whether the hardware is shared with other customers"],
  ["model", "centralized, p2p", "whether one operator runs the hardware, or peers do"]
];

const DIRECTORY: Array<[string, string]> = [
  ["Fetch daily at least", "Offers change price and stock. A descriptor read once is a snapshot, not a catalog. The descriptor's updated says whether the rest can be skipped."],
  ["Dedupe on origin + id", "A re-read updates the row and never adds a second. An offer that leaves the file is marked gone, not deleted."],
  ["Keep the provider's words", "The name, the region names, the extra keys. Normalise for search, display what the provider wrote."],
  ["Attribute the provider", "Every offer links to its url, and the directory says where the file came from and when it was read."],
  ["Report absence as absence", "An unstated stock is unknown, not in stock. An unstated axis is unstated."]
];

const ABSENT: Array<[string, string]> = [
  ["No ordering", "The file says what is for sale, not how to buy it. Every provider has an order form or a provisioning API, and url on each offer leads to it."],
  ["No reviews, no trust score", "verified means the file came from the provider's own origin. Whether a provider is good is the reader's judgement."],
  ["No benchmarks", "A descriptor says what an offer is specified as, in the provider's words. What it measures at is another document's business."],
  ["No central registry", "Anyone may read any provider's file. A directory is one reader among many, and two directories reading the same file list the same offers."]
];

export default function OpenServerPage(): ReactNode {
  return (
    <SiteShell active="OpenServer">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenServer</h2>
          <p>
            One file a hosting provider serves about what it sells. A directory reads the
            provider instead of scraping a page, and the provider stays the author of its own
            catalog.
          </p>
          <div className="cta-row">
            <Link className="button-primary" href="/docs/openserver">Read the OpenServer spec</Link>
            <a className="button-secondary" href="https://nichedb.dev/c/hosting">
              Explore the NicheDB reference implementation
            </a>
          </div>
        </div>
        <p style={{ color: "#41505d" }}>
          Every provider publishes its catalog as a web page, every comparison site scrapes those
          pages, and the comparison site&apos;s terms then forbid anyone from scraping the scrape.
          The provider, who wanted its offers seen, has no say in how they appear. A buyer&apos;s
          agent that wants a 4 vCPU ARM box in Europe under 10 a month, in stock, reads twenty
          pricing pages twenty different ways. OpenServer puts the table the order form already
          reads at <code style={mono}>/.well-known/openserver.json</code>, in one shape every
          reader agrees on, so an offer can be found instead of scraped.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.2. It covers cloud, VPS, dedicated and bare-metal servers, colocation,
          hardware for your own premises, shared and managed hosting, platforms, functions,
          storage, GPU, edge and peer-to-peer markets. Since 0.2 the provider also says how a
          developer drives it: the official CLI with its install commands as the vendor's own guide
          prints them, the API docs, the Terraform provider and the GitHub organisation.{" "}
          <a href="https://nichedb.dev/c/hosting">NicheDB&apos;s hosting directory</a> is a reference
          implementation that reads OpenServer catalogs. Explore its{" "}
          <a href="https://nichedb.dev/f/hosting-cli">hosting providers with a CLI</a> to see that
          metadata in use. Any provider can publish the spec, and any directory can read it.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The descriptor</h2>
          <p>
            Served at <code style={mono}>/.well-known/openserver.json</code>. Only{" "}
            <code style={mono}>provider.name</code> and each offer&apos;s{" "}
            <code style={mono}>name</code> are required.
          </p>
        </div>
        <pre style={pre}>{DESCRIPTOR}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>id</code> is the dedupe key: the same origin and id tomorrow is the
          same row. <code style={mono}>compute</code>, <code style={mono}>storage</code> and{" "}
          <code style={mono}>network</code> use fixed units, mebibytes for memory, gigabytes for
          disks, megabits for bandwidth. <code style={mono}>price</code> is one amount, an ISO
          currency and an interval of hour, month, year or once. <code style={mono}>stock</code> is
          in_stock, out_of_stock, preorder or unknown. <code style={mono}>operator</code> is the
          person answerable, as an <Link href="/openprofile">OpenProfile.md</Link>. Unknown keys are
          kept. The smallest valid file is one line:
        </p>
        <pre style={pre}>{MINIMAL}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Fifteen kinds, four axes</h2>
          <p>
            <code style={mono}>kind</code> says what is sold. The axes cut across every kind and are
            stated, not inferred, because a managed VPS and an unmanaged one are the same kind and
            different offers.
          </p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>kind</th>
              <th style={th}>what is sold</th>
            </tr>
          </thead>
          <tbody>
            {KINDS.map(([kind, what]) => (
              <tr key={kind}>
                <td style={td}>
                  <code style={mono}>{kind}</code>
                </td>
                <td style={td}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table style={{ ...table, marginTop: "1rem" }}>
          <thead>
            <tr>
              <th style={th}>axis</th>
              <th style={th}>values</th>
              <th style={th}>meaning</th>
            </tr>
          </thead>
          <tbody>
            {AXES.map(([axis, values, meaning]) => (
              <tr key={axis}>
                <td style={td}>
                  <code style={mono}>{axis}</code>
                </td>
                <td style={td}>
                  <code style={mono}>{values}</code>
                </td>
                <td style={td}>{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "#41505d", marginTop: "1rem" }}>
          A peer-to-peer marketplace such as Akash, Flux, Golem, Salad or Vast.ai publishes one
          descriptor whose offers are the market&apos;s current asks, one per listing with{" "}
          <code style={mono}>kind: p2p</code> and <code style={mono}>model: p2p</code>, stock and
          price updated as often as the market moves, and <code style={mono}>operator</code>{" "}
          pointing at the marketplace, not the peer. In this family,{" "}
          <a href="https://github.com/profullstack/logicsrc/blob/master/docs/openswarm/c0mpute.md">c0mpute</a>{" "}
          is the compute marketplace, <Link href="/docs/opendisk">OpenDisk</Link> the disk-for-rent
          peer, listable as an offer with <code style={mono}>kind: storage</code>, and{" "}
          <Link href="/openswarm">OpenSwarm</Link> the settlement and proof layer under both.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What a directory owes a provider</h2>
        </div>
        <table style={table}>
          <tbody>
            {DIRECTORY.map(([what, how]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "#41505d", marginTop: "1rem" }}>
          A descriptor is verified when it was fetched from the provider&apos;s own origin. Found
          through <code style={mono}>rel=&quot;openserver&quot;</code> or a URL handed to the
          reader on some other host, it is a claim about the provider by whoever hosts it, and a
          directory marks it so.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What is deliberately absent</h2>
        </div>
        <table style={table}>
          <tbody>
            {ABSENT.map(([what, why]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/docs/openserver">Specification</Link>: the descriptor, fifteen kinds, four
            axes, peer-to-peer markets, discovery, what a directory owes a provider
          </li>
          <li>
            <a href="https://nichedb.dev/c/hosting">NicheDB hosting directory</a>: a reference
            implementation of OpenServer, with providers and offers available through RSS,
            JSON, an API and MCP
          </li>
          <li>
            <a href="https://www.findhost.app">findhost.app</a>: a curated register of web hosts under
            CC BY 4.0, the sibling from the other direction
          </li>
          <li>
            <Link href="/openprofile">OpenProfile.md</Link>, the operator behind a provider;{" "}
            <Link href="/openmcp">OpenMCP</Link>, how a directory describes its own MCP door
          </li>
          <li>
            <Link href="/docs/opencpu">OpenCPU</Link>, <Link href="/docs/openmemory">OpenMemory</Link>,{" "}
            <Link href="/docs/opengpu">OpenGPU</Link> and{" "}
            <Link href="/docs/openbandwidth">OpenBandwidth</Link>: the resource blocks an offer&apos;s{" "}
            <code style={mono}>compute</code>, <code style={mono}>compute.gpu</code> and{" "}
            <code style={mono}>network</code> may carry, each also an offer on its own
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
