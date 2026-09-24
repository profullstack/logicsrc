import Link from "next/link";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import profile from "../../../public/examples/openagent.json";
import { mono, pre, table, td } from "../openontology/ui";

export const metadata: Metadata = specMetadata(
  "/openagent",
  "A portable agent profile: identity, owner, skills and requested permissions in one JSON file, with bindings to OpenProfile, OpenFleet and OpenRental."
);

const LINKS = [
  ["OpenProfile.md", "/openprofile", "The identity, accounts and topics people read. Link the JSON descriptor from the same profile page."],
  ["OpenFleet", "/openfleet", "The running sessions and their human sysop. A launcher maps one agent profile to many fleet members."],
  ["OpenRental", "/docs/openrental", "Agent listings and explicit rental offers. An openagent member points at this profile and matches its did."],
  ["OpenAccess", "/openaccess", "The delegated grant. Requested permissions in a profile do not grant access."],
  ["OpenCreds", "/opencreds", "The vault for credentials. The public profile contains no secrets."]
];

export default function OpenAgentPage() {
  return (
    <SiteShell active="OpenAgent">
      <section className="band">
        <div className="section-head">
          <p className="eyebrow">People and agents · specification 0.1</p>
          <h2>OpenAgent</h2>
          <p>One file says who an agent is, who owns it, what it can do and which permissions it requests.</p>
        </div>
        <p>A directory, a job board and a launcher can read the same JSON profile. The agent keeps its identity when its hosting or engine changes, and each running session can be tracked separately through OpenFleet.</p>
        <p>The format is the existing <code style={mono}>logicsrc.agent</code> contract. Its schema and offline validator already ship in LogicSRC; this publication adds discovery conventions and explains how the profile fits the other specifications.</p>
        <p><Link className="button-primary" href="/docs/openagent">Read the specification</Link>{" "}<a href="/examples/openagent.json">Download the example</a></p>
      </section>

      <section className="band">
        <div className="section-head">
          <h2>The profile</h2>
          <p>An illustrative research agent. Identity and ownership are claims for the consuming application to verify.</p>
        </div>
        <pre style={pre}>{JSON.stringify(profile, null, 2)}</pre>
        <p>Seven required fields: <code style={mono}>type</code>, <code style={mono}>version</code>, <code style={mono}>name</code>, <code style={mono}>did</code>, <code style={mono}>owner_did</code>, <code style={mono}>skills</code> and <code style={mono}>permissions_requested</code>. Skills must be nonempty. A permission request can be empty, and never authorizes execution by itself.</p>
      </section>

      <section className="band">
        <div className="section-head">
          <h2>Serve it, link it, validate it</h2>
        </div>
        <p>Serve one JSON profile over HTTPS. A domain for one agent can use <code style={mono}>/.well-known/openagent.json</code>; a host with several agents gives each its own URL. Link the descriptor from its profile page:</p>
        <pre style={pre}>{'<link rel="openagent" type="application/json" href="https://example.com/agents/research.json">'}</pre>
        <p>Try the existing validator on the downloadable example:</p>
        <pre style={pre}>{"curl -fsS https://logicsrc.com/examples/openagent.json -o agent.json\nnpx --yes --package @logicsrc/validators logicsrc-validate agent agent.json"}</pre>
        <p>Validation checks the shape. Ownership, grants, availability and settlement are checked by the application using the profile. The specification documents the current identity syntax and the SDK runtime-summary distinction.</p>
      </section>

      <section className="band">
        <div className="section-head"><h2>How the pieces fit</h2></div>
        <table style={table}>
          <tbody>{LINKS.map(([name, href, description]) => (
            <tr key={name}><td style={td}><Link href={href}>{name}</Link></td><td style={td}>{description}</td></tr>
          ))}</tbody>
        </table>
        <p><Link href="/openswarm">OpenSwarm</Link> describes peer-to-peer file distribution. An agent profile and a file swarm keep their own identities when they appear together in a rental listing.</p>
      </section>
    </SiteShell>
  );
}
