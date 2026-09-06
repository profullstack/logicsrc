import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "ASDLC · LogicSRC",
  description:
    "ASDLC is the Agentic Software Development Lifecycle: nine phases for building software when agents work in parallel and CI/CD is the only gate, with four conformance levels and a ratchet rule that makes testing in production defensible.",
  alternates: { canonical: "/asdlc" }
};

const PHASES: Array<[string, string]> = [
  ["Frame", "A human states intent; the agent restates scope and names what it is leaving out. The one phase where being wrong is expensive."],
  ["Fan out", "Split into concerns that do not share files. One agent each, one working tree each, running concurrently."],
  ["Gate locally", "The project's own checks run before anything is pushed. Not a duplicate of CI: it exists to keep the shared pipeline green."],
  ["Merge", "Merge to trunk. A pull request parked for review that is not coming is a change nothing real has tested."],
  ["Release", "Cut it in the same unit of work. Where users install artifacts, a merge to trunk reaches nobody."],
  ["Verify live", "Confirm the deployment is serving the change. A green pipeline proves a build succeeded, not that users got it."],
  ["Correct", "Production is the test environment. A failure returns to fan-out in minutes, and that speed is why the loop is allowed to be the test."],
  ["Ratchet", "Every escape becomes a permanent automated check, confirmed to fail when the bug is reintroduced. The load-bearing phase."],
  ["Promote", "Announce it. Work nobody hears about did not ship in any sense the business recognises."]
];

const COMPARISON: Array<[string, string, string]> = [
  ["Unit of work", "A ticket, worked serially", "A concern, worked in parallel by N agents"],
  ["Isolation", "A branch per developer", "A worktree per agent, on one checkout"],
  ["Gate", "Code review by a person", "A program: typecheck, tests, CI, release guards"],
  ["Test environment", "Staging, then prod", "Prod, because staging lies"],
  ["Done means", "Merged", "Verified live and announced"],
  ["After an escape", "A postmortem", "A permanent automated check"],
  ["Cost of a release", "High, so releases are batched", "Near zero, so releases are continuous"]
];

const LEVELS: Array<[string, string]> = [
  ["Level 0, serial", "Agents are used one at a time, and a human reviews and merges each change. Most teams calling themselves AI-assisted are here."],
  ["Level 1, isolated", "Agents work in parallel in isolated trees. The local gate is defined and runs before every push."],
  ["Level 2, continuous", "Trunk deploys automatically. Releases are cut per unit of work, and the release process itself refuses invalid states."],
  ["Level 3, ratcheted", "Every recent production escape has a corresponding automated check, each confirmed to fail when its bug returns. Promotion runs as the last phase."]
];

export default function AsdlcPage(): ReactNode {
  return (
    <SiteShell active="ASDLC">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>ASDLC</h2>
          <p>
            The Agentic Software Development Lifecycle: how software gets built when most of the
            work is done by agents running in parallel, and CI/CD is the only gate that matters.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          The traditional SDLC assumes the scarce resource is engineering time, so it spends process
          on deciding whether each change is worth building. When agents write the code, engineering
          time stops being scarce and two other things become scarce instead:{" "}
          <strong>human attention</strong> and <strong>trunk stability</strong>. ASDLC is what a
          lifecycle looks like when you optimise for those two.
        </p>
        <p style={{ color: "#5b6b7a", fontSize: "0.95rem" }}>
          Status: <strong>0.1</strong>. A description of a practice already in production, published
          so others can copy it, not a proposal.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What actually changes</h2>
          <p>The last row carries the most weight. Everything else follows from it.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th} />
              <th style={th}>SDLC</th>
              <th style={th}>ASDLC</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map(([label, before, after]) => (
              <tr key={label}>
                <td style={{ ...td, color: "#5b6b7a", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {label}
                </td>
                <td style={{ ...td, color: "#7a8794" }}>{before}</td>
                <td style={{ ...td, color: "#1d2a35" }}>{after}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "#41505d", marginTop: "1rem" }}>
          Make a release cheap enough that shipping four times in a day is unremarkable, and the
          rest of the table follows.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The nine phases</h2>
          <p>Correct returns to fan-out. The loop is the point.</p>
        </div>
        <pre style={pre}>{`Frame → Fan out → Gate locally → Merge → Release → Verify live → Correct → Ratchet → Promote
           ↑                                                        ↓
           └────────────────────────────────────────────────────────┘`}</pre>
        <ol style={{ color: "#41505d", lineHeight: 1.75, paddingLeft: "1.2rem", marginTop: "1rem" }}>
          {PHASES.map(([name, detail]) => (
            <li key={name} style={{ marginBottom: "0.55rem" }}>
              <strong>{name}.</strong> {detail}
            </li>
          ))}
        </ol>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The ratchet rule</h2>
          <p>What separates this from shipping carelessly and calling it a methodology.</p>
        </div>
        <p style={{ color: "#41505d" }}>
          Testing in production is only defensible if production failures are one-time events. So
          every escape becomes a permanent automated check before the incident is closed. Not a note
          in a document: a program that fails, in CI or in the local gate, when the bug comes back.
        </p>
        <p style={{ color: "#41505d" }}>
          And the check itself has to be checked. The test for a ratchet is whether it actually fails
          when you reintroduce the bug, which must be confirmed rather than assumed. A fix without a
          ratchet is how the same class of bug ships three times.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Invariants</h2>
          <p>Skip these and you do not have ASDLC, you have moving fast.</p>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.8, paddingLeft: "1.1rem" }}>
          <li>
            <strong>Isolation before parallelism.</strong> N agents on one checkout corrupt each
            other. N agents on N worktrees do not.
          </li>
          <li>
            <strong>The gate is a program, not a person.</strong> A rule nobody wrote down as a
            check is not enforced at agent throughput.
          </li>
          <li>
            <strong>The tooling refuses rather than warns.</strong> A release script that warns about
            a dirty tree gets ignored. One that exits non-zero cannot be.
          </li>
          <li>
            <strong>Prod is the only honest environment.</strong> Reproduce the real conditions or
            accept that the test proves nothing.
          </li>
          <li>
            <strong>Verified live, not merged, is done.</strong>
          </li>
          <li>
            <strong>Every escape ratchets.</strong>
          </li>
        </ul>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Conformance levels</h2>
          <p>Each level includes the ones below it.</p>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.8, paddingLeft: "1.1rem" }}>
          {LEVELS.map(([name, detail]) => (
            <li key={name} style={{ marginBottom: "0.5rem" }}>
              <strong>{name}.</strong> {detail}
            </li>
          ))}
        </ul>
        <p style={{ color: "#5b6b7a", marginTop: "0.9rem" }}>
          Level 3 is the claim that matters, and the only one that requires evidence rather than
          intent.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Worked example</h2>
          <p>DiskPush, an rsync desktop and CLI, on one working day. All of it public in the repo.</p>
        </div>
        <p style={{ color: "#41505d" }}>
          <strong>Horizontal scale.</strong> Eight agent worktrees open on one checkout at once,
          covering unrelated concerns: SSH auth discovery, symlink handling, fleet runs across
          servers, the desktop content security policy, file operations, connection defaults and
          file list sorting. None waited on another.
        </p>
        <p style={{ color: "#41505d" }}>
          <strong>Cadence.</strong> Four releases reached users between 08:53 and 14:56 UTC:{" "}
          <code style={mono}>v0.2.17</code>, <code style={mono}>v0.3.0</code>,{" "}
          <code style={mono}>v0.4.0</code> and <code style={mono}>v0.5.0</code>, each carrying one
          merged concern and shipping desktop and CLI artifacts.
        </p>
        <p style={{ color: "#41505d" }}>
          <strong>The gate refusing.</strong> The release script checks every precondition before it
          writes anything: a dirty tree, a branch that is not trunk, a tag that exists, a version
          that does not sort above the newest release, and any workspace package missing from its
          manifest list. That last guard exists because a package was added and silently left behind
          at an old version, release after release, with nothing failing.
        </p>
        <p style={{ color: "#41505d" }}>
          <strong>Test in prod, then ratchet.</strong> The desktop shipped a visibly broken window
          across three releases, and each layer was only visible in production. v0.2.0 rendered
          unstyled: the bundle loaded over <code style={mono}>file://</code> and every root-absolute
          asset resolved against the filesystem root and 404ed. v0.2.1 fixed the assets and rendered
          blank instead, because the export carries its payload in inline scripts and the window sent{" "}
          <code style={mono}>script-src &apos;self&apos;</code>, refusing all seven. That was
          invisible before only because nothing had run at all. v0.2.2 hashed the inline scripts into
          the policy.
        </p>
        <p style={{ color: "#41505d" }}>
          No local harness could have caught the first bug: a static server resolves absolute paths
          correctly by construction, so the bug only exists under <code style={mono}>file://</code>.
          The ratchet is one command that now guards all three layers, and each guard was confirmed
          to fail when its bug is reintroduced.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/docs/asdlc">Specification</Link>, with the phases, invariants, conformance
            levels, worked example and an adoption order
          </li>
          <li>
            <Link href="/openprd">OpenPRD</Link>, for the product decision that precedes a fan-out
          </li>
          <li>
            <Link href="/openontology">OpenOntology</Link>, for durable domain knowledge shared
            across agents
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
