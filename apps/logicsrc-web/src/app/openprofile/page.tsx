import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenProfile.md · LogicSRC",
  description:
    "OpenProfile.md is one Markdown file that says who you are and where you are, for people and agents alike: an identity block, your accounts, your topics, the terms on which you reshare, and the operator behind an agent. Served at /.well-known/openprofile.md, linked with rel=\"openprofile\", verified by linking back.",
  alternates: { canonical: "/openprofile" }
};

const EXAMPLE = `# Ada Lovelace

- **Kind**: person
- **Handle**: @ada
- **Web**: https://ada.example
- **Pay**: eip155:8453:0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf
- **Resume**: https://agenticjobs.work/candidates/ada/resume.md

Writes about machines that do not exist yet.

## Accounts

- [Bluesky](https://bsky.app/profile/ada.example)
- [Mastodon](https://mathstodon.xyz/@ada)
- [GitHub](https://github.com/ada)

## Topics

- computing, mathematics, poetry, #babbage

## Reshare

- **Networks**: bluesky, mastodon
- **Rate**: $0.05/reshare
- **Limit**: 3/day
- **Not**: gambling, politics`;

const AGENT = `# Athena

- **Kind**: agent
- **Handle**: @athena

Ships small fixes to open source projects, nightly.

## Operator

- **Name**: Ada Lovelace
- **Profile**: https://ada.example/.well-known/openprofile.md`;

const RULES: Array<[string, string]> = [
  ["One # heading", "It is the name. More than one and the first wins; none and the reader says it has no name."],
  ["The identity block", "The bullet list under the name. Kind, Handle, Web, Email, Avatar, Pay, Resume are understood; unknown keys are kept as written."],
  ["The headline", "One prose line between the block and the first ##. It is the bio a directory shows next to the name."],
  ["## opens a section", "Kept verbatim and normalised for matching: accounts, topics, reshare, operator, links, about, projects, services, contact. Unknown sections are kept."],
  ["Accounts", "One bullet per account and the URL is the identity. The network is derived from the host. An account is a claim until the page links back."],
  ["Topics", "The words you would use to find yourself. Readers lowercase, strip #, and match loosely. No taxonomy at write time."],
  ["Reshare", "What you will amplify for others and what it costs: Networks, Topics, Not, Rate, Limit. No section means no offer."],
  ["Operator", "For an agent: the person answerable for it, by Name and Profile or Email. Chains are followed a few hops and reported."]
];

const DISCOVERY: Array<[string, string, string]> = [
  ["Well-known", "/.well-known/openprofile.md", "A domain that is a person or an agent. The canonical location for a personal site."],
  ["Link relation", "<link rel=\"openprofile\" href=\"...\">", "Any HTML page, or a Link header on anything else. A platform points each profile page at its owner's file."],
  ["Platform path", "/candidates/ada/openprofile.md", "A platform serving many people serves the file next to each profile page and links it from the page."]
];

const ABSENT: Array<[string, string]> = [
  ["No required fields", "A name and one line of prose is a valid file."],
  ["No schema version", "Readers ignore what they do not recognise, so a file written today reads in five years."],
  ["No signatures", "Verification is bidirectional linking, which every platform already supports in some form."],
  ["No JSON", "A reader may derive a structured view and must regenerate it from the Markdown on every read. The Markdown is the canonical copy."]
];

export default function OpenProfilePage(): ReactNode {
  return (
    <SiteShell active="OpenProfile">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenProfile.md</h2>
          <p>
            One Markdown file that says who you are and where you are, for people and agents alike.
            Meta tags for a profile: served by any site, linked from any platform, readable by
            anything.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Every platform has a profile page, and every profile page is a dead end. Your Bluesky bio
          cannot tell a job board what you write about. Your GitHub page cannot tell a resharing
          network which topics you will boost and what that costs. An agent has it worse: a handle on
          six networks, an operator somewhere behind it, and nowhere all of that is written down
          together. OpenProfile.md is that place. It ties a name to its accounts, its topics, its
          terms and, for an agent, the person answerable for it, in a form that survives being
          copied between tools.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. A convention already in use by{" "}
          <a href="https://mynaposter.com">myna</a> and{" "}
          <a href="https://agenticjobs.work">agenticjobs</a>, published so others can serve and read
          the same file.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The shape</h2>
          <p>A person, and the one section an agent adds.</p>
        </div>
        <pre style={pre}>{EXAMPLE}</pre>
        <pre style={pre}>{AGENT}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The eight rules</h2>
          <p>Every one of them degrades rather than fails.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Rule</th>
              <th style={th}>What it means</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map(([rule, meaning], index) => (
              <tr key={rule}>
                <td style={td}>
                  <strong>
                    {index + 1}. {rule}
                  </strong>
                </td>
                <td style={td}>{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Discovery</h2>
          <p>The file is served, not registered. A reader tries all three.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Where</th>
              <th style={th}>How</th>
              <th style={th}>When</th>
            </tr>
          </thead>
          <tbody>
            {DISCOVERY.map(([where, how, when]) => (
              <tr key={where}>
                <td style={td}>
                  <strong>{where}</strong>
                </td>
                <td style={td}>
                  <code style={mono}>{how}</code>
                </td>
                <td style={td}>{when}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "#41505d", marginTop: "1rem" }}>
          Serve it as <code style={mono}>text/markdown; charset=utf-8</code>. A reader fetching the
          well-known location is reading, not saving, so no attachment disposition there.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Verification</h2>
          <p>An account is a claim until the page links back.</p>
        </div>
        <p style={{ color: "#41505d" }}>
          A listed account is verified when its platform page carries{" "}
          <code style={mono}>rel=&quot;openprofile&quot;</code> or{" "}
          <code style={mono}>rel=&quot;me&quot;</code> back to the file, or when the bio, website
          field or pinned post contains the file&apos;s URL in plain text. A reader shows verified and
          claimed accounts differently and hides neither, because most accounts are unverified for a
          while and a claim is still information. An agent that names its operator, and an operator
          whose file lists the agent under Accounts, are one trust chain: either link alone is a
          claim, both together are a verification.
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
          <h2>Writing and reading one</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            By hand, in any editor, in five minutes. Then serve it at{" "}
            <code style={mono}>/.well-known/openprofile.md</code>.
          </li>
          <li>
            <code style={mono}>myna profile write</code> builds one from the accounts myna is logged
            into and the topics in its settings. <code style={mono}>myna reshare join</code>{" "}
            publishes the Reshare section to the myna reshare network, which matches authors and
            sharers by topic and settles the rate through CoinPay when there is one.
          </li>
          <li>
            agenticjobs serves one for every public candidate at{" "}
            <code style={mono}>/candidates/&lt;slug&gt;/openprofile.md</code>, derived from the
            candidate&apos;s OpenResume.md, and links it from the profile page.
          </li>
        </ul>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/docs/openprofile">Specification</Link>, with the eight rules, discovery,
            verification and the version history
          </li>
          <li>
            <Link href="/docs/openresume">OpenResume.md</Link>, what you have done, in the same
            spirit; a profile links to a resume and a resume to a profile
          </li>
          <li>
            <Link href="/docs/openjob">OpenJob</Link>, what the work is
          </li>
          <li>
            <Link href="/opencreds">OpenCreds</Link>, where the tokens behind the accounts are kept;
            a profile never contains a credential
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
