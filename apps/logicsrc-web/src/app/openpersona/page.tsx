import Link from "next/link";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td } from "../openontology/ui";

export const metadata: Metadata = specMetadata(
  "/openpersona",
  "OpenPersona.md is a public Markdown companion to OpenAgent for an agent's role, spoken voice and conversational style. It points back to one OpenAgent descriptor and does not contain permissions or executable prompts."
);

const EXAMPLE = `# RiotCoder

- **OpenAgent**: https://profullstack.com/agents/riotcoder.json
- **DID**: riotcoder.profullstack
- **Disclosure**: AI agent operated by Profullstack, Inc.

I build and ship software for the Profullstack fleet. I am direct, practical and
clear about what I know and what I have verified.

## Voice

- **Description**: Natural US English, concise and even-paced.
- **Provider**: ElevenLabs
- **Voice ID**: iP95p4xoKVk53GoZ742B

## Conversation

- **Style**: Direct, specific and conversational.
- **Turn-taking**: Answer when addressed; wait while another person is speaking.

## Boundaries

- **Limits**: Never claim work shipped or checked unless it happened.`;

const PIECES = [
  ["OpenAgent", "/openagent", "Identity, owner, skills and requested permissions. The persona points back to this JSON descriptor."],
  ["OpenProfile.md", "/openprofile", "Human-readable identity, accounts and topics. Link OpenPersona from the agent's profile page."],
  ["OpenFleet", "/openfleet", "A running session and the human sysop responsible for it."],
  ["OpenCreds", "/opencreds", "Credentials stay in a vault; OpenPersona publishes no secrets."],
];

export default function OpenPersonaPage() {
  return (
    <SiteShell active="OpenPersona.md">
      <section className="band">
        <div className="section-head">
          <p className="eyebrow">People and agents · specification 0.1</p>
          <h2>OpenPersona.md</h2>
          <p>One Markdown file for an agent's public role, spoken voice and conversational style.</p>
        </div>
        <p>OpenPersona.md accompanies <Link href="/openagent">OpenAgent</Link>. It describes how an agent presents itself to people; OpenAgent keeps the agent's identity, owner, skills and requested permissions.</p>
        <p>The persona names the exact OpenAgent descriptor it describes. A profile page links both files. OpenPersona is descriptive public content, not an executable system prompt, tool list or permission grant.</p>
        <p><Link className="button-primary" href="/docs/openpersona">Read the specification</Link>{" "}<a href="/examples/openpersona.md">Download the Markdown example</a></p>
      </section>

      <section className="band">
        <div className="section-head">
          <h2>The file</h2>
          <p>The OpenAgent field binds this persona to one JSON descriptor. Voice provider details are optional descriptive metadata.</p>
        </div>
        <pre style={pre}>{EXAMPLE}</pre>
      </section>

      <section className="band">
        <div className="section-head"><h2>Publish and link</h2></div>
        <p>Serve one agent's file at <code style={mono}>/.well-known/openpersona.md</code>, or serve it beside the agent page on a multi-agent host. The profile page links it with:</p>
        <pre style={pre}>{'<link rel="openpersona" type="text/markdown" href="https://example.com/agents/research/openpersona.md">'}</pre>
        <p>Keep OpenAgent's existing JSON schema unchanged. Its own profile page advertises both descriptors, and the persona points back to the OpenAgent URL.</p>
      </section>

      <section className="band">
        <div className="section-head"><h2>How the pieces fit</h2></div>
        <table style={table}>
          <tbody>{PIECES.map(([name, href, description]) => (
            <tr key={name}><td style={td}><Link href={href}>{name}</Link></td><td style={td}>{description}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </SiteShell>
  );
}
