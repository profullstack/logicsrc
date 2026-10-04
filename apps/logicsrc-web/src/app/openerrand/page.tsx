import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";
import { SENSITIVITY, SOURCES, STEPS } from "./data";

export const metadata: Metadata = specMetadata(
  "/openerrand",
  "OpenErrand is one JSON file that describes an errand on a website with no API: the inputs and where each comes from, the rules that fill each field, the human gates a runner must never automate (declarations, identity proofing, codes, letters, captchas), the outcomes, and a hand-off card that never carries a secret."
);

const EXCERPT = `"rules": [
  { "name": "first name", "id": "^FstName$", "do": { "text": "{{first_name}}" } },
  { "name": "net income", "label": "net income|income \\\\(loss\\\\)",
    "types": ["text", "tel", "number"], "do": { "text": "{{net_income}}" } },
  { "name": "declaration", "label": "perjury|i declare|under penalty",
    "types": ["checkbox"], "do": { "gate": "declaration" } }
],
"steps": [
  { "id": "declaration", "kind": "declare",
    "statement": "perjury|i declare|under penalty",
    "why": "Ticking this box is the representative stating, under penalty of perjury, that what was entered is true." }
]`;

const RULES: Array<[string, string]> = [
  ["Shows the errand first", "Title, publisher, every gate with its reason, every input with its sensitivity and source. A file whose hash changed is shown again before it runs."],
  ["Never guesses", "Fields are matched by id first and label second. A required field no rule fills stops the run."],
  ["Never performs a gate", "Declarations need the person's consent for this run. Identity proofing and letters are theirs, and so are captchas on any sensitive site. Codes come only through a declared relay."],
  ["One shared secret per run", "A figure from a return is submitted once. A rejection ends the run and lists the other candidates; a person picks the next one."],
  ["Keeps documents and values in place", "Extraction is local. Values go to the site's fields and the vault; logs hold fields, never values; cards hold steps, never secrets."]
];

export default function OpenErrandPage(): ReactNode {
  return (
    <SiteShell active="OpenErrand">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenErrand</h2>
          <p>
            One JSON file that describes an errand a person runs on a website that has no API:
            registering for a tax account, downloading a transcript, renewing a licence. A person
            reads it and knows every value it will send and every statement it will ask them to
            make. An agent runs the same file in a headless browser and stops exactly where a
            person is needed.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          People already automate these sites, with a script nobody else can read or an agent
          left to guess. The script hides what it sends. The agent ticks a penalty-of-perjury box
          because the form would not submit without it, and tries a second figure when the first
          is rejected. OpenErrand writes the errand down: the fields it fills and with what, the
          values that are secret, the steps that belong to a person, and the point where it stops.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. The reference runner is <code style={mono}>logicsrc errand run</code>, from{" "}
          <code style={mono}>@logicsrc/openerrand</code>: it reads an errand file and drives
          headless Chrome through it under the rules below. The worked example
          transcribes the rule table of <code style={mono}>ftb</code> in cli-tools, which registers
          and activates MyFTB accounts at the California Franchise Tax Board. An excerpt:
        </p>
        <pre style={pre}>{EXCERPT}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Steps and human gates</h2>
          <p>
            Five of the seven step kinds are gates: steps only a person can take. A runner hands
            them over and never performs them, and each carries a <code style={mono}>why</code> a
            person reads.
          </p>
        </div>
        <table style={table}>
          <tbody>
            {STEPS.map(([kind, what]) => (
              <tr key={kind}>
                <td style={td}>
                  <code style={mono}>{kind}</code>
                </td>
                <td style={td}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Inputs</h2>
          <p>Every input has a sensitivity class, which decides where its value may appear.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>class</th>
              <th style={th}>where it may appear</th>
            </tr>
          </thead>
          <tbody>
            {SENSITIVITY.map(([name, where]) => (
              <tr key={name}>
                <td style={td}>
                  <code style={mono}>{name}</code>
                </td>
                <td style={td}>{where}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "#41505d" }}>And an ordered list of sources, tried until one yields a value:</p>
        <table style={table}>
          <tbody>
            {SOURCES.map(([name, what]) => (
              <tr key={name}>
                <td style={td}>
                  <code style={mono}>{name}</code>
                </td>
                <td style={td}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What a runner promises</h2>
          <p>Thirteen rules in the specification; these are the ones that keep a person safe.</p>
        </div>
        <table style={table}>
          <tbody>
            {RULES.map(([rule, meaning]) => (
              <tr key={rule}>
                <td style={td}>
                  <strong>{rule}</strong>
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
          <p>
            A publisher lists its errands at <code style={mono}>/.well-known/openerrand.json</code>,
            each with the gates it will ask of a person. An errand is verified when it comes from
            that publisher&apos;s origin, and site-endorsed only when the site itself serves the
            index. This site publishes the worked example at{" "}
            <a href="/.well-known/openerrand.json">
              <code style={mono}>/.well-known/openerrand.json</code>
            </a>
            .
          </p>
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Not</h2>
        </div>
        <p style={{ color: "#41505d" }}>
          Not a way around a check: a runner may present a normal browser user agent and nothing more, with no fingerprint spoofing, no stealth plugins and no challenge solving.
          Not for someone else&apos;s account. Not an API: when a site has one, use{" "}
          <Link href="/openconnection">OpenConnection</Link>,{" "}
          <Link href="/openaccess">OpenAccess</Link> or <Link href="/opensaas">OpenSaaS</Link>. Not a
          scraper, not a test framework, not a credential store, not legal or tax advice.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/docs/openerrand">Specification</Link>: the file, inputs, field rules,
            steps, the five gates, outcomes and retry, outputs, hand-off cards, discovery, thirteen
            runner rules, and the MyFTB business registration as a worked example
          </li>
          <li>
            JSON Schemas <code style={mono}>@logicsrc/schemas/openerrand</code> and{" "}
            <code style={mono}>openerrand-index</code>, checked by{" "}
            <code style={mono}>@logicsrc/validators</code>
          </li>
          <li>
            <Link href="/opencreds">OpenCreds</Link>, the vault an errand writes logins to;{" "}
            <Link href="/openfleet">OpenFleet</Link>, the record an agent runs an errand under
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
