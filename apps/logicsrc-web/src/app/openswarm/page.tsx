import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { card, mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenSwarm · LogicSRC",
  description:
    "OpenSwarm is an open specification family for paid, encrypted, peer-to-peer distribution of files and media: BitTorrent plus payment plus encryption as extension messages, with audio, video, live streams and a replicated catalogue on top, and c0mpute.com nodes that seed, relay and index for money.",
  alternates: { canonical: "/openswarm" }
};

const PROTOCOLS: Array<[name: string, line: string]> = [
  ["ipfile", "Paid, encrypted file swarms as BitTorrent extension messages"],
  ["ippay", "Passes and vouchers over x402 and CoinPay: how a leecher pays and a seeder is paid"],
  ["ipdb", "A replicated, append-only catalogue of manifests and metadata, discoverable over the DHT"],
  ["ipaudio", "Audio releases and tracks on ipfile swarms: renditions, seek tables, gapless, royalties"],
  ["ipvideo", "Video on demand: CMAF renditions, segment index, subtitles, thumbnails, an HLS bridge"],
  ["iplive", "Live streams: segment fan-out over paid relays with backpressure"],
  ["ipname", "How a Moshpit name or a domain resolves to a publisher key and a catalogue"]
];

const ROLES: Array<[role: string, work: string, paid: string]> = [
  ["Storage", "Pin an ipfile swarm for a period and seed it", "Pin job plus vouchers per byte served"],
  ["Relay", "Fan out iplive segments to viewers", "Vouchers per byte served"],
  ["Transcode", "Produce ipaudio and ipvideo renditions as ipfile swarms", "Job price"],
  ["Index", "Replicate ipdb feeds, answer queries, serve a gateway", "Job price plus x402 per query"],
  ["Keeper", "Hold a content key and grant it to paying peers", "Share of each key grant"]
];

const DOCS: Array<[slug: string, title: string, blurb: string]> = [
  ["openswarm", "Overview", "What the family defines, how the pieces stack, and what already exists."],
  ["opencreds", "OpenCreds", "Where the publisher seed should live."]
];

export default function OpenSwarmPage(): ReactNode {
  return (
    <SiteShell active="OpenSwarm">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenSwarm</h2>
          <p>
            An open specification family for <strong>paid, encrypted, peer-to-peer distribution</strong>{" "}
            of files and media. It is an add-on to BitTorrent, not a new transport. A swarm carries
            ciphertext, the tracker and the DHT learn nothing about the content, every peer that
            serves a verified piece gets paid for it, and the same primitives carry files, audio,
            video, live streams and the catalogue that describes them.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          It exists because BitTorrent solved distribution and never solved the two things that
          keep it from being a product: nobody is paid to seed, and nothing in it is private. Every
          Profullstack media property has rebuilt the same paid-access layer on top of a central
          HTTP proxy because the swarm could not carry the payment.
        </p>
        <p style={{ color: "#5b6b7a", fontSize: "0.95rem" }}>
          Status: <strong>0.1 draft</strong>. No reference implementation yet. The full documents
          live in the repo under <code style={mono}>docs/openswarm/</code>.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The family</h2>
          <p>Seven protocols over one core. Reuse is the default posture: a primitive is specified once.</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Protocol</th>
                <th style={th}>One line</th>
              </tr>
            </thead>
            <tbody>
              {PROTOCOLS.map(([name, line]) => (
                <tr key={name}>
                  <td style={{ ...td, ...mono }}>{name}</td>
                  <td style={td}>{line}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <pre style={pre}>{`  +---------------------------------------------------------------+
  |  ipaudio      ipvideo      iplive         ipdb (catalogue)    |
  +---------------------------------------------------------------+
  |  ipfile: manifest, per-file key pair, encrypted pieces,       |
  |          key grants, credit window, vouchers per served piece |
  +-------------------------------+-------------------------------+
  |  ippay: passes and vouchers   |  ipname: Moshpit name -> key  |
  +-------------------------------+-------------------------------+
  |  BitTorrent wire (BEP 3) + extension protocol (BEP 10)        |
  |  DHT (BEP 5, 44, 46), trackers, WebRTC peers, webseeds,       |
  |  optional Moshpit MTP/1 tunnel                                |
  +---------------------------------------------------------------+`}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>One swarm shape, one key model, one payment loop</h2>
        </div>
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <div style={card}>
            <strong>The swarm carries ciphertext.</strong>
            <p style={{ margin: "0.35rem 0 0", color: "#41505d" }}>
              A hybrid BEP 52 torrent whose single file is AES-256-CTR ciphertext. The v1 infohash
              makes it reachable from WebTorrent in a browser, the v2 merkle tree makes every 16 KiB
              block verifiable, and the plaintext root in the signed manifest makes the decrypted
              result verifiable. A vanilla client can join and, if the publisher allows, download
              bytes it cannot read.
            </p>
          </div>
          <div style={card}>
            <strong>Adding a file mints a key pair for it.</strong>
            <p style={{ margin: "0.35rem 0 0", color: "#41505d" }}>
              Derived from one publisher seed by default, so there is one thing to back up. The
              public half is the file&rsquo;s identity and the BEP 46 key under which the latest
              manifest is published; the private half signs the manifest and authorises key grants
              and payout changes. A separate random content key encrypts the bytes and is sealed to
              paying peers.
            </p>
          </div>
          <div style={card}>
            <strong>Seeders are paid per verified piece.</strong>
            <p style={{ margin: "0.35rem 0 0", color: "#41505d" }}>
              A leecher buys a pass over x402 in USDC. A seeder serves inside a bounded credit
              window. After verifying each batch the leecher signs a cumulative voucher. The seeder
              redeems the latest voucher at a hub, which splits it between publisher, seeder and
              itself. Nobody pays for bytes they did not verify, and nobody serves more than the
              window unpaid.
            </p>
          </div>
        </div>
        <pre style={pre}>{`leecher                                   seeder
  |  hello                                  |
  |---------------------------------------->|
  |<------------------------------- hello   |
  |  pass                                   |
  |---------------------------------------->|   verifies hub signature, scope, cap
  |<----------------------------- unchoke   |
  |  request / piece ... (vanilla)          |
  |<=======================================>|   up to the credit window unpaid
  |<------------------------------ credit   |
  |  voucher (cumulative, signed)           |
  |---------------------------------------->|   unpaid resets
  |  key_req                                |
  |---------------------------------------->|
  |<------------------------------- grant   |   content key sealed to the leecher`}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>How c0mpute.com nodes take part</h2>
          <p>
            A node already advertises roles and takes work through a gossipsub auction. OpenSwarm
            adds workload types to bid on and a per-byte income that needs no auction at all.
          </p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Role</th>
                <th style={th}>Work</th>
                <th style={th}>Paid by</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map(([role, work, paid]) => (
                <tr key={role}>
                  <td style={td}>{role}</td>
                  <td style={td}>{work}</td>
                  <td style={td}>{paid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Using it (proposed CLI)</h2>
        </div>
        <pre style={pre}>{`# One publisher identity, reused for every file
ip init

# Add a file: derives the file key pair, encrypts, builds the hybrid torrent,
# signs the manifest, starts seeding
ip file add ./interview.flac --per-gib 0.01 --key-price 0.50

# Publish an audio release that references it
ip audio publish ./release.json

# Fetch as a paying peer (buys a pass, gets the key, verifies, decrypts)
ip file get ed25519:0d87e09c7fea3ad6ba6c2f3e027ea47f5b245452899910948470906704c5295d --out ./interview.flac

# Ask the catalogue
ip db query --type ipaudio.track --where 'record.artist == "Ada"' --limit 20`}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What already exists</h2>
        </div>
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <div style={card}>
            <strong>bittorrented.com</strong> runs the browser WebTorrent player, a hybrid seeder on
            wss trackers, and a DHT crawl. It speaks the vanilla wire this family extends.
          </div>
          <div style={card}>
            <strong>x402-gateway and CoinPay</strong> sell passes with the x402 v2 offer and verify
            and settle the proof. <code style={mono}>ippay</code> reuses that exchange unchanged.
          </div>
          <div style={card}>
            <strong>c0mpute</strong> has the blake3 chunk store, erasure coding, hardware transcode,
            a gateway, and a live-stream design that already swarms segments.
          </div>
          <div style={card}>
            <strong>moshpit-transport and the Moshpit registry</strong> provide the post-quantum
            tunnel and the name pins.
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "1rem" }}>
          {DOCS.map(([slug, title, blurb]) => (
            <a key={slug} href={`/docs/${slug}`} style={{ ...card, textDecoration: "none", color: "inherit", flex: "1 1 16rem" }}>
              <strong>{title}</strong>
              <p style={{ margin: "0.35rem 0 0", color: "#5b6b7a", fontSize: "0.9rem" }}>{blurb}</p>
            </a>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
