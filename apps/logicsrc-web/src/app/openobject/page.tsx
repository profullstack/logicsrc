import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = specMetadata(
  "/openobject",
  "OpenObject is a bucket you can mount: keyed objects encrypted by their owner, placed on paid OpenDisk disks under a stated redundancy such as three replicas, verified every period, repaired when a disk fails, listed by prefix and read back by path. Reference store d1sks.com."
);

const DESCRIPTOR = `{
  "name": "d1sks.com",
  "operator": "https://profullstack.com/.well-known/openprofile.md",
  "key": "ed25519:7c02…0c3b",
  "api": "https://d1sks.com/openobject/v1",
  "hubs": ["https://d1sks.com/api/openswarm"],
  "disks": "https://d1sks.com/api/disks",
  "policies": [
    { "id": "3x", "mode": "replicas", "replicas": 3, "min_operators": 3, "min_countries": 2, "default": true },
    { "id": "rs-10-4", "mode": "erasure", "k": 10, "parity": 4, "min_operators": 14 }
  ],
  "price": { "currency": "USD", "per_gib_month": { "3x": 0.036, "rs-10-4": 0.017 }, "per_gib_transfer": 0.005 },
  "capacity": { "free_gib": 184000, "disks": 412 },
  "accepts": { "encryption": ["owner", "store"], "mounts": ["fuse", "nfs", "webdav", "s3"] },
  "proof": { "every_hours": 6, "repair_within_hours": 24 },
  "record": { "source": "https://d1sks.com/api/openswarm/pay2seed/requesters/ed25519:7c02…0c3b", "lost": 0 }
}`;

const OBJECT = `{
  "type": "openobject.object",
  "bucket": "ed25519:3a9f…4a6c",
  "key": "photos/2026/09/a.jpg",
  "rev": 3, "seq": 48211,
  "id": "sha256:d6c3…93ff",
  "size": 4194304,
  "swarm": { "infohashV2": "sha256:4b74…a342" },
  "policy": { "mode": "replicas", "replicas": 3 },
  "holders": [
    { "disk": "ed25519:a41e…7b0a", "lease": "sha256:5c02…", "provenAt": "2026-09-21T06:00:05Z" },
    { "disk": "ed25519:9d3c…11ef", "lease": "sha256:71aa…", "provenAt": "2026-09-21T06:00:09Z" },
    { "disk": "ed25519:02be…c8d0", "lease": "sha256:c3f0…", "provenAt": "2026-09-21T05:59:58Z" }
  ],
  "state": "healthy"
}`;

const LOOP: Array<[string, string]> = [
  ["1. Write", "PUT the bytes, or a record for a swarm already seeded. The client keeps its copy until the store says healthy."],
  ["2. Place", "One pay2seed offer per object with seeders.min = replicas, from the owner's escrow, onto distinct disks, operators and countries."],
  ["3. Prove", "Every holder answers paid2seed challenges each period; provenAt on the record is the last one the store saw."],
  ["4. Repair", "A failed holder is marked at once; a replacement is leased within repair_within_hours; the object is degraded, never silently short."],
  ["5. Read", "GET by key, Range honoured, verified against id before the last byte. LIST by prefix from the index, never from a disk."],
  ["6. Mount", "Keys are paths, the index is the metadata, the swarm is the data, writes are write-back, close-to-open by seq."]
];

const MAPPING: Array<[string, string]> = [
  ["offers[]", "one per policy: kind storage, model p2p, management managed"],
  ["offers[].price", "{ amount: per_gib_month[policy], currency, interval: month, unit: gib }"],
  ["offers[].stock", "in_stock while capacity.free_gib is above zero"],
  ["location", "the pool's countries, unchanged"]
];

const ABSENT: Array<[string, string]> = [
  ["No settlement of its own", "Every byte held is a pay2seed offer and a paid2seed lease. This document adds the index, the policy and the repair loop, nothing under them."],
  ["No plaintext at a disk", "With owner encryption a disk holds ciphertext it cannot read and a store holds an index it cannot decrypt."],
  ["No central registry", "A store is anyone with an index and a hub account. A bucket moves by handing a second store its record and its index."],
  ["No POSIX", "A mount is a bucket seen as paths. It promises close-to-open by seq and no locks, and no more."],
  ["No consensus", "One bucket key, one index, one clock. Two stores serving one bucket follow the same feed."]
];

export default function OpenObjectPage(): ReactNode {
  return (
    <SiteShell active="OpenObject">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenObject</h2>
          <p>
            A bucket you can mount: keyed objects, encrypted by their owner, kept on paid disks at a
            stated redundancy, verified every period, repaired when a disk fails, and read back by path
            from anywhere.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          <Link href="/openswarm">OpenSwarm</Link> says how one swarm is paid to be held and how a
          holder proves it still holds it. <Link href="/opendisk">OpenDisk</Link> says how a disk is
          found. What neither says is what an application needs: a bucket with a name, a thousand keys
          under it that change, a promise that each object is on three different machines in two
          countries, a list by prefix, a version history, and a mount so a process can open a path
          without knowing any of the above. OpenObject is that shape written down, so a bucket at one
          store is the same bucket at another.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. <a href="https://d1sks.com">d1sks.com</a> is the reference store, running every
          bucket at three replicas on three operators in two countries by default. Every store is also
          a storage offer in the <Link href="/openserver">OpenServer</Link> sense. An{" "}
          <Link href="/openslice">OpenSlice</Link> slice mounts a bucket as its disk.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The store descriptor</h2>
          <p>
            Served at <code style={mono}>/.well-known/openobject.json</code>. Only a name, an API and
            one policy are required.
          </p>
        </div>
        <pre style={pre}>{DESCRIPTOR}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>policies</code> is what the store will run: <code style={mono}>replicas</code>{" "}
          means every holder has the whole object, <code style={mono}>erasure</code> means every holder
          has one shard and any k rebuild it. <code style={mono}>min_operators</code> and{" "}
          <code style={mono}>min_countries</code> are floors on distinctness. <code style={mono}>disks</code>{" "}
          is the pool, as OpenDisk descriptors, so an owner reads it before trusting a promise of three
          operators. <code style={mono}>record.lost</code> is how many objects ever went below the read
          threshold, and a store that has lost one says so.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The object</h2>
          <p>One record per revision, appended to the bucket&apos;s index, an ipdb feed under the bucket key.</p>
        </div>
        <pre style={pre}>{OBJECT}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>key</code> is a path. <code style={mono}>seq</code> is the bucket&apos;s
          clock: the higher seq is the newer statement about a key. <code style={mono}>id</code> is
          the SHA-256 of the plaintext and the ETag. <code style={mono}>holders</code> are the disks
          under lease, one per replica or per shard. <code style={mono}>state</code> is healthy,
          degraded, lost or pending, and a read of a degraded object still succeeds.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The loop</h2>
          <p>Nothing on the swarm side changes. The store keeps the index and posts the offers.</p>
        </div>
        <table style={table}>
          <tbody>
            {LOOP.map(([step, what]) => (
              <tr key={step}>
                <td style={td}>
                  <strong>{step}</strong>
                </td>
                <td style={td}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "#41505d", marginTop: "1rem" }}>
          A store may also serve S3, because every tool already speaks it: ETag is the id, versions are
          revisions, multipart becomes one swarm. Owner-encrypted buckets are not reachable over S3,
          because S3 has nowhere to put the key.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>As an OpenServer offer</h2>
          <p>A store is a storage offer; its disks are listed separately as OpenDisk offers.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>OpenServer</th>
              <th style={th}>from OpenObject</th>
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
            <Link href="/docs/openobject">Specification</Link>: the store descriptor, the bucket, the
            object, placement, repair, the API, mounting, S3, the OpenServer mapping, c0mpute
          </li>
          <li>
            <a href="https://d1sks.com">d1sks.com</a>: the reference store, three replicas by default
          </li>
          <li>
            <Link href="/opendisk">OpenDisk</Link>: the disks a store places onto;{" "}
            <Link href="/openswarm">OpenSwarm</Link>: pay2seed and paid2seed for holding and proof,
            ipdb for the index
          </li>
          <li>
            <Link href="/openslice">OpenSlice</Link>: the container that mounts a bucket;{" "}
            <Link href="/openserver">OpenServer</Link>: the storage offer a store maps onto
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
