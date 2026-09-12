import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenMCP · LogicSRC",
  description:
    "OpenMCP is an open catalog protocol for MCP relays: a relay serves /.well-known/openmcp.json, a catalog probes it and lists only what it found, and a client reaches every relay through the catalog's REST, its own MCP endpoint, or signed webhooks. Reference implementation at github.com/logicsrc/openmcp.",
  alternates: { canonical: "/openmcp" }
};

const DESCRIPTOR = `{
  "openmcp": "0.1",
  "mcp": "https://agenticjobs.work/api/mcp",
  "name": "Agentic Jobs",
  "description": "A job board where agents apply to agents.",
  "auth": { "kind": "bearer", "open": ["search_jobs", "get_job"] },
  "tags": ["jobs", "hiring", "agents"],
  "operator": "https://profullstack.com/.well-known/openprofile.md",
  "tools": ["search_jobs", "get_job", "apply_to_job", "post_update"]
}`;

const CLI = `npx @logicsrc/openmcp serve --url https://catalog.example     # run a catalog
openmcp add https://agenticjobs.work                          # register by any URL on the relay
openmcp find "post an update"                                 # search every relay's tools
openmcp call agenticjobs.work post_update '{"body":"Shipped."}' --relay-token <t>
openmcp webhook add https://me.example/hooks --events relay.offline,relay.online
openmcp --transport mcp relays                                # the same, over MCP`;

const PROBE: Array<[string, string, string]> = [
  ["1. The descriptor", "GET /.well-known/openmcp.json on the relay's origin", "Parses: the record is verified. The descriptor is the relay's own word, not the registrant's."],
  ["2. The handshake", "initialize, then tools/list at the MCP endpoint", "Answers: the record is online and the tools are what the relay reported, schemas included."],
  ["Neither", "", "Not listed. A catalog never lists a relay it could neither verify nor reach."]
];

const DOORS: Array<[string, string, string, string]> = [
  ["List relays", "GET /v1/relays?q=&tag=&online=1", "list_relays", ""],
  ["One relay, its tools", "GET /v1/relays/:id", "get_relay", ""],
  ["Register, refresh", "POST /v1/relays {url}", "register_relay", "relay.registered, relay.updated"],
  ["Find a tool anywhere", "GET /v1/tools?q=", "find_tool", ""],
  ["Call a relay's tool", "POST /v1/relays/:id/call", "call_tool", ""],
  ["Up, down", "POST /v1/relays/:id/refresh", "refresh_relay", "relay.online, relay.offline"],
  ["Subscribe", "POST /v1/webhooks", "subscribe", "a signed POST per event"],
  ["Peers", "GET/POST /v1/peers, /sync", "list_peers", ""]
];

const ABSENT: Array<[string, string]> = [
  ["No registry of names", "A relay's id is derived from its endpoint. Nobody owns a name; two catalogs derive the same id."],
  ["No trust score", "verified and online are facts a catalog checked. Whether a relay is good is the reader's judgement, with the operator's profile as the place to start."],
  ["No credentials in the catalog", "Not for probing, not for forwarding. A caller's credential for a relay travels with the call and is never kept."],
  ["No new transport", "Relays are Streamable HTTP MCP, as MCP defines it. The catalog adds discovery, not protocol."]
];

export default function OpenMcpPage(): ReactNode {
  return (
    <SiteShell active="OpenMCP">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenMCP</h2>
          <p>
            An open catalog of MCP relays. A relay says what it is in one file, a catalog lists
            only what it has reached, and a client gets one door to all of them.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Every product that speaks MCP is a relay: an endpoint an agent can call. There are
          thousands, each found by hand from a README and wired into a client&apos;s configuration
          by a person. Nothing says what a relay is, nothing says whether it answered yesterday, and
          nothing lets an agent reach a relay it was not told about. OpenMCP puts the pieces that
          already exist, the MCP handshake, <code style={mono}>/.well-known/</code> and webhooks,
          together so a relay can be discovered instead of configured.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. Reference implementation at{" "}
          <a href="https://github.com/logicsrc/openmcp">github.com/logicsrc/openmcp</a>: a catalog
          server on Node 24 with one SQLite file, and a client and CLI that speak REST, MCP and
          webhooks.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The descriptor</h2>
          <p>
            Served at <code style={mono}>/.well-known/openmcp.json</code>. Only{" "}
            <code style={mono}>mcp</code> is required.
          </p>
        </div>
        <pre style={pre}>{DESCRIPTOR}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>auth</code> says how a caller authenticates and which tools are open
          without a credential. <code style={mono}>operator</code> is the person answerable, as an{" "}
          <Link href="/openprofile">OpenProfile.md</Link>. <code style={mono}>tools</code> names them
          so a catalog can index a relay it cannot reach; what <code style={mono}>tools/list</code>{" "}
          says wins whenever both exist. The descriptor is a claim; the probe is the verification.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The probe</h2>
          <p>Two questions, in order, of any URL a catalog is handed.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Question</th>
              <th style={th}>How</th>
              <th style={th}>Then</th>
            </tr>
          </thead>
          <tbody>
            {PROBE.map(([question, how, then]) => (
              <tr key={question}>
                <td style={td}>
                  <strong>{question}</strong>
                </td>
                <td style={td}>{how ? <code style={mono}>{how}</code> : ""}</td>
                <td style={td}>{then}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "#41505d", marginTop: "1rem" }}>
          The probe is unauthenticated and repeats on a schedule. A change in online, descriptor or
          tools is an event. Registration is open, because nothing a registrant types is listed:
          the probe is.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Three doors to the same records</h2>
          <p>A catalog is itself a relay, and an agent that reaches one reaches everything in it.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}></th>
              <th style={th}>REST</th>
              <th style={th}>MCP tool</th>
              <th style={th}>Webhook</th>
            </tr>
          </thead>
          <tbody>
            {DOORS.map(([what, rest, tool, hook]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>
                  <code style={mono}>{rest}</code>
                </td>
                <td style={td}>
                  <code style={mono}>{tool}</code>
                </td>
                <td style={td}>{hook}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "#41505d", marginTop: "1rem" }}>
          <code style={mono}>call_tool</code> forwards a call to a relay with the caller&apos;s own
          credential, never kept. Every webhook delivery carries{" "}
          <code style={mono}>X-OpenMCP-Signature: sha256=&lt;HMAC of the raw body&gt;</code>. Catalogs
          peer, and a relay learned from a peer is still probed here before it is listed.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>From a terminal</h2>
        </div>
        <pre style={pre}>{CLI}</pre>
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
            <Link href="/docs/openmcp">Specification</Link>: the descriptor, the probe, the record,
            the three doors, webhooks, peering
          </li>
          <li>
            <a href="https://github.com/logicsrc/openmcp">github.com/logicsrc/openmcp</a>: the
            reference catalog and client, <code style={mono}>npx @logicsrc/openmcp</code>
          </li>
          <li>
            <Link href="/openprofile">OpenProfile.md</Link>, the operator behind a relay;{" "}
            <Link href="/opencreds">OpenCreds</Link>, where a caller&apos;s credential is kept
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
