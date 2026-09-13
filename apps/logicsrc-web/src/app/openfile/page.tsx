import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenFile · LogicSRC",
  description:
    "OpenFile is one file a publisher serves about the files it has published: content hash, swarm and HTTP fetch routes, verification, consent basis, price, and who holds it now, at /.well-known/openfile.json. The web door onto an OpenSwarm ipfile swarm.",
  alternates: { canonical: "/openfile" }
};

const DESCRIPTOR = `{
  "publisher": {
    "name": "Dartmoor Field Recordings",
    "operator": "https://dartmoor.example/.well-known/openprofile.md",
    "key": "ed25519:5d29…d59e",
    "hubs": ["https://bittorrented.com/api/openswarm"]
  },
  "files": [{
    "id": "sha256:d6c3…93ff",
    "name": "interview-2026-09-05.flac",
    "size": 734003200,
    "swarm": { "file": "ed25519:0d87…295d", "infohashV2": "sha256:4b74…a342" },
    "encryption": "ipfile",
    "fetch": [
      { "kind": "ipfile", "url": "magnet:?xs=urn:btpk:0d87…295d&s=ipfile" },
      { "kind": "http", "url": "https://gw.c0mpute.com/file/d6c3…93ff" },
      { "kind": "hls", "url": "https://gw.c0mpute.com/file/d6c3…93ff/index.m3u8" }
    ],
    "attestation": { "basis": "own", "license": "CC-BY-4.0" },
    "price": { "amount": 0.5, "currency": "USD", "per": "key", "offer": "https://keys.dartmoor.example/…" },
    "holders": "https://bittorrented.com/api/openswarm/files/d6c3…93ff/holders"
  }]
}`;

const MINIMAL = `{ "publisher": { "name": "Dartmoor Field Recordings" },
  "files": [{ "id": "sha256:d6c3…93ff", "name": "interview-2026-09-05.flac" }] }`;

const FETCH: Array<[string, string, string]> = [
  ["ipfile", "a magnet for an OpenSwarm client", "encrypted pieces, paid per piece, the key on a pass"],
  ["magnet", "a vanilla magnet", "the ciphertext, for a client that cannot pay"],
  ["webseed", "BEP 19, ciphertext by range", "a gateway standing in for peers"],
  ["http", "the plaintext by range from a gateway", "a browser with nothing installed, behind a pass when there is a price"],
  ["hls", "a media file as a standard playlist", "any player, sealed when there is a price"]
];

const REUSED: Array<[string, string]> = [
  ["The swarm and the manifest", "ipfile: the file key, both infohashes, plainRoot as the content hash, the plaintext piece layer"],
  ["Consent and the README", "pay2seed: the attestation record, its basis and licence, the notice endpoint, README.md at the root"],
  ["Who holds it", "paid2seed: leases and the proofs behind provenAt"],
  ["Payment", "ippay: a pass bought over x402, presented as a bearer token on the gateway"],
  ["The feed", "ipdb: the same catalogue, replicated between peers, for a reader that speaks the swarm"]
];

const ABSENT: Array<[string, string]> = [
  ["No new swarm format", "The swarm is ipfile, the consent is pay2seed's, the payment is ippay's. This is a JSON door onto records that already exist."],
  ["No search", "A descriptor lists one publisher's files. Finding a file across publishers is a directory's job."],
  ["No trust score", "verified says where the file came from and who signed the manifest. basis is what the publisher claimed. The rest is the reader's judgement."],
  ["No DRM", "A pass holder gets the key and the bytes, as ipfile says."]
];

export default function OpenFilePage(): ReactNode {
  return (
    <SiteShell active="OpenFile">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenFile</h2>
          <p>
            One file a publisher serves about the files it has published, so a file can be found
            instead of crawled, and fetched by a browser that has never heard of a swarm.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          A file on a swarm is findable by its infohash and by nothing else. <Link href="/openswarm">OpenSwarm</Link>{" "}
          fixed the inside of the swarm: a signed manifest, encrypted pieces, consent at upload, a
          replicated catalogue. What none of that gives a person with a browser, a search engine or a
          directory is a URL to start from. OpenFile puts a publisher&apos;s catalogue at{" "}
          <code style={mono}>/.well-known/openfile.json</code>, with a content hash to verify
          against, every way to fetch the bytes, the basis it was published on, the price, and who is
          holding it right now.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. The reference reader is bittorrented.com, which lists consented swarms beside
          the bare infohashes of its DHT crawl, with the README as the page. A product for it is
          planned under a name not yet chosen.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The descriptor</h2>
          <p>
            Served at <code style={mono}>/.well-known/openfile.json</code>. Only the publisher&apos;s
            name and each file&apos;s content hash and name are required.
          </p>
        </div>
        <pre style={pre}>{DESCRIPTOR}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>id</code> is the SHA-256 of the plaintext, which for an ipfile swarm is
          the manifest&apos;s <code style={mono}>plainRoot</code>: the same root the decrypted file
          verifies against. Two publishers serving the same bytes list the same id, and a directory
          has one file with two listings. <code style={mono}>encryption</code> is ipfile unless the
          publisher says <code style={mono}>none</code> as an explicit act. The smallest valid
          descriptor:
        </p>
        <pre style={pre}>{MINIMAL}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Five ways to fetch</h2>
          <p>Listed in the publisher&apos;s order of preference. A reader picks the first kind it speaks.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>kind</th>
              <th style={th}>What it is</th>
              <th style={th}>Who uses it</th>
            </tr>
          </thead>
          <tbody>
            {FETCH.map(([kind, what, who]) => (
              <tr key={kind}>
                <td style={td}>
                  <code style={mono}>{kind}</code>
                </td>
                <td style={td}>{what}</td>
                <td style={td}>{who}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "#41505d", marginTop: "1rem" }}>
          Over any of them the bytes verify the same way: each piece against the plaintext piece
          layer, or the whole against <code style={mono}>id</code>. A reader refuses bytes that fail
          and says which holder served them.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Holders</h2>
          <p>A file is only as available as the machines holding it.</p>
        </div>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>holders</code> answers with who has the bytes now: a{" "}
          <code style={mono}>seeder</code> with a lease and the time it last passed a proof, a{" "}
          <code style={mono}>gateway</code> serving it over HTTP, a <code style={mono}>peer</code>{" "}
          merely seen. Each carries its age, and a seeder&apos;s lease can be checked at the hub.
          A holder that rents disk links its own <Link href="/opendisk">OpenDisk</Link> descriptor, so a
          publisher that likes a holder can buy more of it.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What is reused</h2>
          <p>Every record OpenFile points at already has a name in the OpenSwarm family.</p>
        </div>
        <table style={table}>
          <tbody>
            {REUSED.map(([what, from]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
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
            <Link href="/docs/openfile">Specification</Link>: the descriptor, the per-file descriptor,
            holders, discovery, fetching and verifying, what a directory owes a publisher
          </li>
          <li>
            <Link href="/openswarm">OpenSwarm</Link>: ipfile, pay2seed, paid2seed, ippay and ipdb,
            the records this file is a door onto
          </li>
          <li>
            <Link href="/opendisk">OpenDisk</Link>, what a holder serves about the disk it rents;{" "}
            <Link href="/openserver">OpenServer</Link>, how a gateway or seeder is listed as hosting
          </li>
          <li>
            <Link href="/openprofile">OpenProfile.md</Link>, the operator behind a publisher
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
