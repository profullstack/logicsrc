import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = specMetadata(
  "/openthreat",
  "OpenThreat is one file a security tool serves about what it found in the open, at /.well-known/openthreat.json: findings in public repositories, attacks on the reporter's own infrastructure, indicators and advisories, with severity, rule, subject and status. Private subjects are never in it and secrets are never located while open."
);

const DESCRIPTOR = `{
  "openthreat": "0.1",
  "reporter": { "name": "ThreatCrush", "web": "https://threatcrush.com", "tool": "threatcrush",
                "policy": "https://threatcrush.com/discovery#policy" },
  "updated": "2026-09-13T06:00:00Z",
  "threats": [
    { "id": "3f9a1c2b", "kind": "finding", "title": "SQL assembled by concatenation",
      "severity": "high", "rule": "js-sql-string-building", "cwe": "CWE-89", "category": "code",
      "subject": { "name": "northwind/api", "url": "https://github.com/northwind/api", "ref": "main" },
      "location": { "file": "src/db/users.ts", "line": 42 },
      "status": "open", "last_seen": "2026-09-13T05:40:00Z" },
    { "id": "b71e0d44", "kind": "finding", "title": "Hardcoded credential",
      "severity": "critical", "rule": "secret-generic-credential", "cwe": "CWE-798", "category": "secret",
      "subject": { "name": "northwind/api", "url": "https://github.com/northwind/api" },
      "status": "open" },
    { "id": "ssh-91.232.105.3", "kind": "attack", "title": "SSH brute force", "severity": "medium",
      "source": { "ip": "91.232.105.3", "country": "RU" }, "target": { "port": 22, "service": "ssh" },
      "indicators": [{ "type": "ip", "value": "91.232.105.3" }],
      "status": "blocked", "count": 47, "last_seen": "2026-09-13T04:52:00Z" }
  ]
}`;

const KINDS: Array<[string, string]> = [
  ["finding", "Something in a public subject's code or configuration: a rule, a CWE, a location."],
  ["attack", "Traffic observed against the reporter's own infrastructure: source, target, count."],
  ["indicator", "A value worth blocking or watching on its own: ip, cidr, domain, url, hash, ua."],
  ["advisory", "A statement about a vulnerability, with the document in refs."]
];

const HARD: Array<[string, string]> = [
  ["A subject is public or it is not in the file", "A private repository, a customer's server, a paying user's scan: none of it is a threat in the open, it is someone's private security posture. A reporter that scans private things keeps two tables and serves one."],
  ["A secret is never located while it is open", "A secret finding is published with rule, severity, subject and status only. No location, no message, no excerpt. The credential is already exposed; the file must not be the map to it."]
];

const ABSENT: Array<[string, string]> = [
  ["No private subjects", "Stated in the rules and worth stating twice."],
  ["No exploit detail", "message says what was found; consequence what it means. How to use it is nobody's business here."],
  ["No scoring across reporters", "severity is the reporter's. A directory that normalises labels the result as its own."],
  ["No push", "A reporter serves a file. A directory watches updated."]
];

export default function OpenThreatPage(): ReactNode {
  return (
    <SiteShell active="OpenThreat">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenThreat</h2>
          <p>
            One file a security tool serves about what it found in the open. A directory reads the
            reporter instead of a vendor feed, and the reporter decides what it discloses.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Every security tool finds things, and every one keeps what it found behind its own login.
          A scanner that runs on a thousand public repositories knows which rules fire and where,
          and says nothing, because saying it would mean a feed, a schema, an API key and a sales
          call. The threat feeds that exist are products with terms that forbid redistribution.
          OpenThreat is the small file a tool can serve in an afternoon at{" "}
          <code style={mono}>/.well-known/openthreat.json</code>, with a rule for what may go in
          it.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. The first reporter is{" "}
          <a href="https://threatcrush.com/discovery">threatcrush.com/discovery</a>, built from the
          scans its GitHub App ran on public repositories; the first directory is{" "}
          <a href="https://nichedb.dev/c/threats">nichedb.dev/c/threats</a>.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The descriptor</h2>
          <p>
            Only <code style={mono}>reporter.name</code> and a threat&apos;s{" "}
            <code style={mono}>title</code> are required. Everything at{" "}
            <code style={mono}>/.well-known/</code> is TLP:CLEAR by definition.
          </p>
        </div>
        <pre style={pre}>{DESCRIPTOR}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>rule</code> is the same string a SARIF ruleId carries;{" "}
          <code style={mono}>subject</code> is what the threat is about and is public by
          definition; <code style={mono}>status</code> is open, fixed, mitigated, blocked or
          withdrawn, and a withdrawn threat stays in the file a while so directories retract it.
          The second threat above is a secret: no location, no message, by rule.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Four kinds</h2>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>kind</th>
              <th style={th}>what it is</th>
            </tr>
          </thead>
          <tbody>
            {KINDS.map(([kind, what]) => (
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
          <h2>Two rules that do not degrade</h2>
          <p>Every other rule degrades. These two are the reason the file can exist at all.</p>
        </div>
        <table style={table}>
          <tbody>
            {HARD.map(([what, why]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "#41505d" }}>
          A subject that was scanned did not ask to be listed. Announcing is on by default, because
          a finding in a public repository is public already, and opting out is one switch in the
          tool&apos;s own settings. A subject that opts out leaves the file on the next build, and
          is served once more as <code style={mono}>withdrawn</code> so directories retract it.
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
            <Link href="/docs/openthreat">Specification</Link>: the descriptor, twelve rules and the
            two that do not degrade, announcing and opting out, discovery, SARIF, STIX and CSAF
          </li>
          <li>
            <a href="https://threatcrush.com/discovery">threatcrush.com/discovery</a>: the first
            reporter, and its policy page
          </li>
          <li>
            <a href="https://nichedb.dev/c/threats">nichedb.dev/c/threats</a>: the first directory,
            with RSS, JSON, API and MCP over the same rows
          </li>
          <li>
            <Link href="/openprofile">OpenProfile.md</Link>, the operator behind a reporter;{" "}
            <Link href="/openserver">OpenServer</Link> and <Link href="/opencoupon">OpenCoupon</Link>
            , the same serve-your-own-file shape for other niches
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
