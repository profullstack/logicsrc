import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenDisk · LogicSRC",
  description:
    "OpenDisk is one file a machine serves about the disk it will rent: free GiB, price per GiB-month, location, policy, proof cadence and hub standing, at /.well-known/opendisk.json. What a peer-to-peer storage market is made of. Reference marketplace d1sks.com.",
  alternates: { canonical: "/opendisk" }
};

const DESCRIPTOR = `{
  "name": "seeder-a41e, Falkenstein",
  "operator": "https://seeder-a41e.example/.well-known/openprofile.md",
  "key": "ed25519:a41e…7b0a",
  "hubs": ["https://bittorrented.com/api/openswarm", "https://d1sks.com/api/openswarm"],
  "capacity": { "total_gib": 3726, "free_gib": 2210 },
  "price": { "currency": "USD", "per_gib_month": 0.12, "per_gib_transfer": 0.004, "max_gib": 2000, "max_days": 365 },
  "location": { "regions": ["fsn1"], "countries": ["DE"] },
  "network": { "bandwidth_mbps": 1000, "transfer_gb": 20000 },
  "accepts": { "visibility": ["private", "public"], "encrypted_only": false, "max_file_gib": 500 },
  "proof": { "kinds": ["challenge", "probe"], "every_hours_min": 6 },
  "record": { "source": "https://bittorrented.com/api/openswarm/pay2seed/seeders/ed25519:a41e…7b0a", "standing": 412 },
  "payout": { "payee": "ed25519:a41e…7b0a", "network": "eip155:8453" }
}`;

const MINIMAL = `{ "name": "spare drive, Lisbon", "capacity": { "free_gib": 900 },
  "price": { "currency": "USD", "per_gib_month": 0.08 } }`;

const RENT: Array<[string, string]> = [
  ["1. Read", "The descriptor for policy and price, and record.source at the hub for standing."],
  ["2. Attest", "The consent record pay2seed requires, with README.md at the root of the swarm."],
  ["3. Offer", "A pay2seed offer at one of the disk's hubs, at or above per_gib_month, with the budget escrowed."],
  ["4. Lease", "The disk's seeder client takes it on its next poll, or at once when the hub pushes to proof.webhook."],
  ["5. Prove", "Challenges and probes every period, receipts per proven period, payout to the payee. All paid2seed, unchanged."]
];

const MAPPING: Array<[string, string]> = [
  ["offers[].kind", "storage"],
  ["offers[].model", "p2p for a peer, centralized for a provider; the disk may say"],
  ["offers[].price", "{ amount: per_gib_month, currency, interval: month, unit: gib }"],
  ["offers[].stock", "in_stock while free_gib covers min_gib"],
  ["location, network, storage", "the same keys, the same units"]
];

const ABSENT: Array<[string, string]> = [
  ["No lease in this file", "The descriptor is the ask, the offer is the bid, the lease is the match, made at the hub as paid2seed says."],
  ["No escrow at the disk", "Money sits at a hub. A disk never holds a requester's funds."],
  ["No reputation of its own", "record is a copy of what a hub signed. A marketplace reads the hub, and lists the hub's number."],
  ["No plaintext", "By default a disk holds ipfile ciphertext it cannot read, and a personal swarm's existence is not in its public list."],
  ["No central registry", "Anyone may serve a descriptor and anyone may read it. Two marketplaces reading the same file list the same disk."]
];

export default function OpenDiskPage(): ReactNode {
  return (
    <SiteShell active="OpenDisk">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenDisk</h2>
          <p>
            One file a machine serves about the disk it will rent, so a disk can be found instead of
            waited for, and a peer with a spare terabyte is on the market by putting a file at a URL.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          <Link href="/openswarm">OpenSwarm</Link> already says how a seeder is paid to hold a swarm:
          an offer with money escrowed, a lease, a storage proof every period, a payout per
          GiB-month. What it does not say is how a requester finds a seeder before posting. The
          market is one-sided: offers are listed and seeders poll them. OpenDisk is the other side.
          A disk puts its free space, price, location, policy, proof cadence and hub standing at{" "}
          <code style={mono}>/.well-known/opendisk.json</code>, and a requester reads the disk
          before it posts.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. <a href="https://d1sks.com">d1sks.com</a> is the reference marketplace: every
          descriptor it has read, standing pulled from the hubs each disk names, and an offer form that
          posts to the disk&apos;s hub. Every disk is also a hosting offer in the{" "}
          <Link href="/openserver">OpenServer</Link> sense, listed as one at nichedb.dev.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The descriptor</h2>
          <p>
            Served at <code style={mono}>/.well-known/opendisk.json</code>. Only a name, the free
            space and a price are required.
          </p>
        </div>
        <pre style={pre}>{DESCRIPTOR}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>key</code> is the seeder identity that signs proofs and is paid;{" "}
          <code style={mono}>hubs</code> is where it takes leases. <code style={mono}>accepts</code>{" "}
          is the operator&apos;s policy stated up front, so nobody posts an offer this disk would never
          take. <code style={mono}>record.source</code> is the hub&apos;s own page for this seeder,
          and a marketplace reads the hub, not the file, for anything it ranks on. The smallest valid
          descriptor:
        </p>
        <pre style={pre}>{MINIMAL}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Renting a disk</h2>
          <p>Nothing on the swarm side changes. The descriptor only moves the first step to a URL.</p>
        </div>
        <table style={table}>
          <tbody>
            {RENT.map(([step, what]) => (
              <tr key={step}>
                <td style={td}>
                  <strong>{step}</strong>
                </td>
                <td style={td}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>As an OpenServer offer</h2>
          <p>A disk is a hosting offer, and a directory that reads OpenServer lists it without a second parser.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>OpenServer</th>
              <th style={th}>from OpenDisk</th>
            </tr>
          </thead>
          <tbody>
            {MAPPING.map(([key, from]) => (
              <tr key={key}>
                <td style={td}>
                  <code style={mono}>{key}</code>
                </td>
                <td style={td}>{from}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "#41505d", marginTop: "1rem" }}>
          A provider that sells storage plans and rents disk to swarms serves both files. A peer with
          one drive serves only this one, and is listed in both places.
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
            <Link href="/docs/opendisk">Specification</Link>: the descriptor, holding, renting a disk,
            marketplaces, the OpenServer mapping
          </li>
          <li>
            <a href="https://d1sks.com">d1sks.com</a>: the reference marketplace
          </li>
          <li>
            <Link href="/openswarm">OpenSwarm</Link>: pay2seed for the offer, paid2seed for leases and
            proofs, ippay for the payee, ipfile for what is held
          </li>
          <li>
            <Link href="/openfile">OpenFile</Link>, the publisher&apos;s side and the holders list a disk
            appears in; <Link href="/openserver">OpenServer</Link>, the hosting offer a disk maps onto
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
