import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenSlice · LogicSRC",
  description:
    "OpenSlice is a container whose compute is rented from one market and whose disk is mounted from another: a host serves /.well-known/openslice.json, a slice is one signed file, the state lives in an OpenObject bucket, so the host is interchangeable. Reference marketplace slic3s.com.",
  alternates: { canonical: "/openslice" }
};

const DESCRIPTOR = `{
  "name": "rig-7b, Helsinki",
  "operator": "https://rig-7b.example/.well-known/openprofile.md",
  "key": "ed25519:b70c…9c2b",
  "hubs": ["https://slic3s.com/api/openswarm", "https://c0mpute.com/api/openswarm"],
  "runtime": { "engine": "crun", "oci": "1.1", "rootless": true, "arch": "x86_64", "gpu": "nvidia" },
  "capacity": { "vcpu_free": 20, "ram_mb_free": 81920, "scratch_gb_free": 800,
                "gpu": [{ "model": "NVIDIA RTX 4090", "count": 1, "vram_mb": 24576, "free": 1 }] },
  "price": { "currency": "USD", "per_vcpu_hour": 0.006, "per_gib_ram_hour": 0.002, "per_gpu_hour": 0.35 },
  "location": { "countries": ["FI"] },
  "network": { "bandwidth_mbps": 1000, "ipv4": 1, "ipv6": true, "ports": "any", "domains": true },
  "accepts": { "images": ["ghcr.io", "docker.io", "openobject"], "privileged": false, "mounts": ["openobject"] },
  "proof": { "kinds": ["presence", "probe"], "epoch_seconds": 3600 },
  "record": { "source": "https://slic3s.com/api/openswarm/openslice/hosts/ed25519:b70c…9c2b", "standing": 96, "evicted": 0 },
  "payout": { "payee": "ed25519:b70c…9c2b", "network": "eip155:8453" }
}`;

const SLICE = `{
  "type": "openslice.slice",
  "id": "ed25519:5e1d…1e6d",
  "name": "shop-api",
  "image": { "ref": "ghcr.io/ana/shop-api@sha256:1f0e…d9c2" },
  "compute": { "vcpu": 2, "ram_mb": 4096, "gpu": null, "scratch_gb": 10 },
  "mounts": [
    { "bucket": "ed25519:3a9f…4a6c", "prefix": "shop/", "path": "/data", "mode": "rw", "cache_gb": 4 }
  ],
  "env": [{ "name": "DATABASE_URL", "vault": "opencreds://ana.example/shop/database-url" }],
  "ports": [{ "container": 8080, "protocol": "tcp", "public": true, "domain": "api.shop.example" }],
  "health": { "http": "/healthz", "every_seconds": 30 },
  "placement": { "countries": ["FI", "DE", "NL"], "near": "ed25519:3a9f…4a6c", "min_standing": 80 },
  "lifetime": { "hours": 720, "renew": true, "restart": "always" },
  "price_cap": { "currency": "USD", "per_hour": 0.05 }
}`;

const RUN: Array<[string, string]> = [
  ["1. Read", "The host descriptor for accepts, capacity and price, and record.source at the hub for standing."],
  ["2. Reserve", "An openslice.reservation at one of the host's hubs: the spec, hours, an hourly price, the budget escrowed."],
  ["3. Take", "The host takes it on its next poll or when the hub pushes, and answers with an address per public port."],
  ["4. Start", "Pull by digest, resolve env from the vault, attach the mounts inside the slice's namespace, apply cgroup limits, run."],
  ["5. Prove", "One signed presence record per epoch, a probe of health from outside; a proven epoch is paid, a missed one is not."],
  ["6. Move", "Stop here, reserve there under the same id; the mounts reattach at the index's current seq. Nothing on the old host is needed."]
];

const MAPPING: Array<[string, string]> = [
  ["offers[].kind", "cloud, model p2p for a peer"],
  ["offers[].compute", "{ vcpu: vcpu_free, ram_mb: ram_mb_free, arch }"],
  ["offers[].gpu", "capacity.gpu[0] as an OpenGPU block, count its free"],
  ["offers[].price", "{ amount: per_vcpu_hour, currency, interval: hour, unit: vcpu }"],
  ["offers[].stock", "in_stock while threads and memory are free and slices_running is below slices_max"]
];

const ABSENT: Array<[string, string]> = [
  ["No orchestration", "One slice is one container on one host. No pods, no services, no autoscaling. Two slices find each other by domain."],
  ["No confidential compute", "A host can read what the container reads. What is promised is the other direction: nothing on the host is needed to get the slice back."],
  ["No persistent local disk", "Scratch is gone on a move. State that must survive is in a mount."],
  ["No network between slices", "Each slice has its own address on its own host. A private network across hosts is a different specification."],
  ["No settlement of its own", "The reservation is a lease, the epoch is a period, the presence record is a proof, payout is ippay."]
];

export default function OpenSlicePage(): ReactNode {
  return (
    <SiteShell active="OpenSlice">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenSlice</h2>
          <p>
            A container whose compute is rented from one market and whose disk is mounted from
            another, so the host is interchangeable: stop the slice here, start it there, the mount
            reattaches.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          A <a href="https://c0mpute.com">c0mpute</a> job ends; a service does not. A web app, a game
          server, an agent that listens for messages need a share of a machine for a while, not a job
          done. OpenSlice is that share written down: a host puts its free threads, memory, GPU, price,
          runtime and policy at <code style={mono}>/.well-known/openslice.json</code>, an owner writes
          one signed file that says image, resources, mounts, ports and lifetime, and a reservation at
          a hub matches them for a number of hours with proofs every epoch. The durable state is an{" "}
          <Link href="/openobject">OpenObject</Link> bucket kept at three replicas elsewhere, which is
          what makes a peer&apos;s machine tolerable to run on.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. <a href="https://slic3s.com">slic3s.com</a> is the reference marketplace: every
          host descriptor it has read, standing from the hubs each names, and a launcher that takes a
          slice spec. Compute from c0mpute.com, disk from d1sks.com, the pair from slic3s.com. The name
          is shared with ETSI&apos;s OpenSlice, an operations system for 5G network slicing; this
          document is about containers.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The host descriptor</h2>
          <p>
            Served at <code style={mono}>/.well-known/openslice.json</code>. Only a name, free threads,
            free memory and the two hourly prices are required.
          </p>
        </div>
        <pre style={pre}>{DESCRIPTOR}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>capacity</code> is in <Link href="/docs/opencpu">OpenCPU</Link>,{" "}
          <Link href="/docs/openmemory">OpenMemory</Link> and <Link href="/docs/opengpu">OpenGPU</Link>{" "}
          units, and <code style={mono}>*_free</code> is what a new slice can have now.{" "}
          <code style={mono}>runtime</code> is what runs the container. <code style={mono}>accepts</code>{" "}
          is policy stated up front. <code style={mono}>record.evicted</code> counts slices the host
          stopped before the owner did, and a marketplace ranks on the hub&apos;s number, not the
          file&apos;s.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The slice</h2>
          <p>One signed file. The id is the slice key and it keeps it across hosts, which is what makes a move a move.</p>
        </div>
        <pre style={pre}>{SLICE}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>image</code> is by digest, from a registry or from a bucket, so it
          outlives the registry. <code style={mono}>mounts</code> are OpenObject buckets seen as
          directories, the content key granted to the slice, not the host.{" "}
          <code style={mono}>env</code> resolves secrets from an <Link href="/opencreds">OpenCreds</Link>{" "}
          vault at start. <code style={mono}>placement.near</code> names a bucket so the marketplace
          prefers hosts on the same network as its holders.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Running one</h2>
          <p>The disk protocols were written first. A reservation is a lease, an epoch is a period, a presence record is a proof.</p>
        </div>
        <table style={table}>
          <tbody>
            {RUN.map(([step, what]) => (
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
          <p>A host is a hosting offer, and a directory that reads OpenServer lists it without a second parser.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>OpenServer</th>
              <th style={th}>from OpenSlice</th>
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
            <Link href="/docs/openslice">Specification</Link>: the host descriptor, the slice, running
            one, the reservation, the marketplace, the OpenServer mapping, c0mpute
          </li>
          <li>
            <a href="https://slic3s.com">slic3s.com</a>: the reference marketplace
          </li>
          <li>
            <Link href="/openobject">OpenObject</Link>: the bucket a slice mounts;{" "}
            <Link href="/opendisk">OpenDisk</Link>: the same shape for a disk
          </li>
          <li>
            <Link href="/openswarm">OpenSwarm</Link>: the reservation&apos;s shape and the payee;{" "}
            <Link href="/openserver">OpenServer</Link>: the hosting offer a host maps onto
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
