import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td } from "../openontology/ui";
import { EXIT_CODES, TARGETS } from "./data";

export const metadata: Metadata = specMetadata(
  "/openpkg",
  "OpenPkg is the open format behind W3BS Package Manager: publisher-qualified package names, a TUF repository profile with first-use trust by root fingerprint, signed release manifests and channels, a catalog of curl installers, and the rules a client follows when it installs, updates, rolls back and removes."
);

const USAGE = `w3bs repo add tools https://tools.example/repository/
w3bs install tools.example/atlas
w3bs update                 # everything, within each installed major
w3bs rollback atlas         # previous version, pinned; files only`;

const LAYOUT = `<base>/metadata/1.root.json      first root: its SHA-256 is the fingerprint
<base>/metadata/root.json        latest root
<base>/metadata/targets.json     signs every target's length and SHA-256
<base>/metadata/snapshot.json
<base>/metadata/timestamp.json   written last
<base>/targets/...               the documents and artifacts`;

const RULES: Array<[string, string]> = [
  ["The host is a label", "tools.example/atlas keeps two publishers' names apart. Authority comes from the root the user trusted, never from the domain in the name."],
  ["Versions are immutable", "A version and platform bind to one digest. A publisher tool refuses to change them and a client refuses a manifest that does."],
  ["Compatible by default", "Updates stay within the installed major, or the minor for 0.x. --allow-major widens that, never past a pin, never to a lower version."],
  ["Atomic per package", "A journal per package, then staging, version directory, current link, command links, commit, receipt. An interrupted run ends at the old version or the new one."],
  ["Rollback is files", "The previous version comes back and is pinned. Configuration, data and migrations are never claimed to roll back."],
  ["Owned files only", "Removal deletes what the client wrote. A command link it did not write is a conflict, not an overwrite."]
];

export default function OpenPkgPage(): ReactNode {
  return (
    <SiteShell active="OpenPkg">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenPkg</h2>
          <p>
            The format a command-line tool is installed and kept current from. A publisher signs a
            static directory with TUF and serves it over HTTPS; a client trusts its root once, then
            verifies every manifest and artifact against it on every install and update.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          Most tools ship as a curl installer. That gets a tool once and leaves nothing that knows
          what is installed, what is current or how to put the last version back. OpenPkg fixes the
          names, the files a repository serves, the rule for listing curl-only tools without
          pretending to verify them, and what a client promises about the machine it changes.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 1.0 Draft. The reference implementation is{" "}
          <a href="https://w3bs.org/docs/package-manager.md">W3BS Package Manager</a>, whose source
          is <code style={mono}>package-manager/</code> in profullstack/w3bs.org. Anyone may
          implement it without permission.
        </p>
        <pre style={pre}>{USAGE}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The repository</h2>
          <p>
            TUF 1.0, four roles, one key per role allowed, <code style={mono}>consistent_snapshot</code>{" "}
            false. Publishers write targets before metadata and the timestamp last.
          </p>
        </div>
        <pre style={pre}>{LAYOUT}</pre>
        <table style={table}>
          <tbody>
            {TARGETS.map(([path, what]) => (
              <tr key={path}>
                <td style={td}>
                  <code style={mono}>{path}</code>
                </td>
                <td style={td}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What a client owes the machine</h2>
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
          <h2>Exit codes</h2>
          <p>
            With <code style={mono}>--json</code>, one result object on stdout: the operation, an
            overall result, a transaction id and one status per package.
          </p>
        </div>
        <table style={table}>
          <tbody>
            {EXIT_CODES.map(([code, meaning]) => (
              <tr key={code}>
                <td style={td}>
                  <code style={mono}>{code}</code>
                </td>
                <td style={td}>{meaning}</td>
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
            <Link href="/docs/openpkg">Specification</Link>: identity grammar, the repository
            profile, the four documents with examples, the catalog listing rule, lifecycle rules,
            receipts, the result object, security considerations and conformance
          </li>
          <li>
            <a href="https://w3bs.org/packages">The W3BS package catalog</a> and{" "}
            <a href="https://w3bs.org/docs/package-manager.md">the user and publisher guide</a>
          </li>
          <li>
            <Link href="/openinstall">OpenInstall</Link>, the script that puts a server application
            into service on its box; OpenPkg is for the tools on a person&apos;s own machine
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
