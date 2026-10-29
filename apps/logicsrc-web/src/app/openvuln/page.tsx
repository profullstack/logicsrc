import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = specMetadata(
  "/openvuln",
  "OpenVuln is one record per vulnerability that is also a valid OSV record: what is affected, whether it is fixed, whether it is exploited (CISA KEV, EPSS, AI agent benchmarks) and who said each fact, for packages, agents, services and campaigns. Never exploit code."
);

const RECORD = `{
  "schema_version": "1.6.0",
  "id": "NDB-2026-0002",
  "aliases": ["CVE-2026-12537", "GHSA-wpqr-6v78-jr5g"],
  "summary": "Gemini CLI runs commands from untrusted GitHub issue text in CI",
  "affected": [{ "package": { "ecosystem": "npm", "name": "@google/gemini-cli" },
                 "ranges": [{ "type": "SEMVER", "events": [{ "introduced": "0" }, { "fixed": "0.39.1" }] }] }],
  "database_specific": {
    "openvuln": {
      "version": "0.1.1",
      "subject": { "kind": "agent", "name": "Gemini CLI", "vendor": "Google" },
      "class": ["prompt-injection", "ci-cd"],
      "label": "critical",
      "fix": { "status": "fixed", "versions": ["0.39.1"] },
      "exploitation": {
        "status": "poc-public",
        "kev": null,
        "epss": { "score": 0.00212, "percentile": 0.11456, "date": "2026-10-28" },
        "ai": []
      },
      "sources": [{ "name": "OSV", "id": "GHSA-wpqr-6v78-jr5g", "fields": ["affected", "severity"] }],
      "deep_dive": { "url": "https://nichedb.dev/c/vulns/CVE-2026-12537", "made_by": "ai" }
    }
  }
}`;

const FACTS: Array<[string, string]> = [
  ["affected", "Which packages and versions, from OSV and GitHub, in OSV's own fields."],
  ["fix", "fixed, partial, mitigated, unfixed, wontfix or unknown, the first fixed versions and a workaround."],
  ["exploitation.kev", "CISA's Known Exploited Vulnerabilities entry: added, due, ransomware use. null when checked and absent."],
  ["exploitation.epss", "FIRST's thirty-day exploitation probability, with the date it was read."],
  ["exploitation.ssvc", "CISA's SSVC reading: exploitation none, proof of concept or active; automatable; technical impact."],
  ["exploitation.public", "Exploits a curated publisher released (Exploit-DB, Metasploit), linked, never copied."],
  ["exploitation.claims", "Unvetted proof-of-concept claims (GitHub repositories), shown as claims; they never raise the status."],
  ["exploitation.scanners", "Detection templates (Nuclei) that let anyone check for it at internet scale."],
  ["exploitation.ai", "Benchmarks where an AI agent was set to exploit it, such as ExploitGym, and whether it succeeded."],
  ["sources", "Who supplied each field and when it was read. A fact with no source is the publisher's own."]
];

const KINDS = "package, product, service, repository, model, agent, hardware, protocol, campaign";

const ABSENT: Array<[string, string]> = [
  ["No exploit code", "A record says an exploit exists and links it. The code, payload and steps are never in it."],
  ["No risk score of our own", "label reads CVSS, EPSS is FIRST's. Nothing invents a number that blends them."],
  ["No affected-host data", "A record is about a vulnerability, never about who runs a vulnerable copy."],
  ["No push", "A publisher serves files. A reader watches updated and changes."]
];

export default function OpenVulnPage(): ReactNode {
  return (
    <SiteShell active="OpenVuln">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenVuln</h2>
          <p>
            One record per vulnerability with the five facts a defender needs, each with its source.
            Every record is a valid OSV record.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          The facts about one vulnerability live in five places that do not point at each other:
          OSV for affected versions, the NVD for severity, CISA KEV for exploitation, FIRST EPSS for
          likelihood, and research teams for whether an AI agent can exploit it. And the flaws that
          matter most this year, prompt injection in coding agents and campaigns that hijack dozens
          of repositories, fit none of the formats. OpenVuln puts the five facts in OSV&apos;s own
          extension point, <code style={mono}>database_specific.openvuln</code>, with a subject that
          can be an agent, a service or a campaign.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1.1. The first publisher and directory is{" "}
          <a href="https://nichedb.dev/c/vulns">nichedb.dev/c/vulns</a>, which merges OSV, the NVD,
          KEV, EPSS and ExploitGym into one deep-dive page per vulnerability.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The record</h2>
          <p>
            Everything outside <code style={mono}>database_specific.openvuln</code> is OSV. A record
            without the block is plain OSV with every OpenVuln field unstated.
          </p>
        </div>
        <pre style={pre}>{RECORD}</pre>
        <p style={{ color: "#41505d" }}>
          <code style={mono}>subject.kind</code> is one of {KINDS}. A campaign lists its members and
          ties their own records together through OSV&apos;s <code style={mono}>related</code>.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What OpenVuln adds</h2>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>field</th>
              <th style={th}>what it holds</th>
            </tr>
          </thead>
          <tbody>
            {FACTS.map(([field, what]) => (
              <tr key={field}>
                <td style={td}>
                  <code style={mono}>{field}</code>
                </td>
                <td style={td}>{what}</td>
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
            <Link href="/docs/openvuln">Specification</Link>: the block, fifteen rules and the two
            that do not degrade, the publisher index at /.well-known/openvuln.json, reading rules
          </li>
          <li>
            <a href="https://nichedb.dev/c/vulns">nichedb.dev/c/vulns</a>: the first directory, with
            a deep-dive page, RSS, JSON, API and MCP over the same records
          </li>
          <li>
            <a href="https://ossf.github.io/osv-schema/">OSV</a>, the base format;{" "}
            <Link href="/openthreat">OpenThreat</Link>, what one tool found in the open
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
