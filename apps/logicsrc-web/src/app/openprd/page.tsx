import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { card, mono, pre } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenPRD · LogicSRC",
  description:
    "OpenPRD is a lightweight open standard for product requirements documents: a numbered, committed collection under prd/, one Markdown file each, with front-matter, eight fixed sections, and an enforced lifecycle.",
  alternates: { canonical: "/openprd" }
};

const SECTIONS: Array<[string, string]> = [
  ["Problem", "The user or business problem, and why it matters now."],
  ["Goals", "What success looks like, as outcomes rather than features."],
  ["Non-Goals", "Explicitly out of scope, to bound the work."],
  ["Users", "Who this is for; personas or segments."],
  ["Requirements", "Numbered R1, R2, … each tagged [P0], [P1], or [P2]."],
  ["UX Notes", "Flows, states, and constraints that shape the experience."],
  ["Success Metrics", "How the goals will be measured."],
  ["Risks & Open Questions", "Known risks and the decisions still owed."]
];

export default function OpenPrdPage(): ReactNode {
  return (
    <SiteShell active="OpenPRD">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenPRD</h2>
          <p>
            A lightweight open standard for product requirements documents authored by humans or AI
            agents. A repo keeps a numbered, committed collection under <code style={mono}>prd/</code>
            — one Markdown file per decision, readable a year later.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          It borrows the shape of a BIP/EIP/DIP process. Where OpenSpec models a <em>change</em> as a
          multi-file bundle, OpenPRD models a <em>product decision</em> as one numbered file you can
          read to recover the <em>why</em>.
        </p>
        <p style={{ color: "#5b6b7a", fontSize: "0.95rem" }}>
          Status: <strong>0.2</strong>. A PRD is just a file — it needs no service, and no tooling, to
          be valid.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The shape</h2>
          <p>Front-matter, then eight sections in a fixed order. All of them required.</p>
        </div>
        <pre style={pre}>{`---
openprd: "0.2"
id: "0001"                  # four digits, matches the filename
title: Expand the parked-domain service
status: Draft               # Draft|Review|Accepted|Final|Rejected|Withdrawn|Superseded
authors:
  - anthony@profullstack.com
created: 2026-07-12
updated: 2026-07-12
tags: [growth]
---

## Problem
## Goals
## Non-Goals
## Users
## Requirements

- R1 [P0] First required capability.
- R2 [P1] Next capability.

## UX Notes
## Success Metrics
## Risks & Open Questions`}</pre>
        <div style={{ display: "grid", gap: "0.6rem", marginTop: "1rem" }}>
          {SECTIONS.map(([name, detail], index) => (
            <div key={name} style={card}>
              <strong style={{ color: "#101418" }}>
                {index + 1}. {name}
              </strong>
              <div style={{ color: "#41505d" }}>{detail}</div>
            </div>
          ))}
        </div>
        <p style={{ color: "#5b6b7a", marginTop: "1rem" }}>
          A section may be a single line such as <code style={mono}>_None._</code> — but it may not be
          missing. That is what keeps every PRD skimmable and diffable.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Lifecycle, enforced</h2>
          <p>Status lives in the front-matter and is the source of truth.</p>
        </div>
        <pre style={pre}>{`Draft  →  Review  →  Accepted  →  Final
                  ↘  Rejected
                  ↘  Withdrawn
                  ↘  Superseded by NNNN`}</pre>
        <ul style={{ color: "#41505d", lineHeight: 1.8, paddingLeft: "1.1rem", marginTop: "1rem" }}>
          <li>
            <code style={mono}>Draft</code> cannot jump to <code style={mono}>Final</code> — the tool
            refuses the transition rather than trusting the author to remember.
          </li>
          <li>
            <code style={mono}>Rejected</code>, <code style={mono}>Withdrawn</code>, and{" "}
            <code style={mono}>Superseded</code> are terminal. They stay on disk, because the{" "}
            <em>why not</em> is part of the record.
          </li>
          <li>
            Moving to <code style={mono}>Superseded</code> requires naming the PRD that replaces it.
          </li>
          <li>Ids are four digits, monotonically increasing, with no gaps. 0000 is the template.</li>
        </ul>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Conformance is four rules</h2>
          <p>Everything else the tooling reports is lint, and says so.</p>
        </div>
        <ol style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.2rem" }}>
          <li>
            It lives at <code style={mono}>prd/&lt;id&gt;-&lt;slug&gt;.md</code> with a four-digit id.
          </li>
          <li>
            Its front-matter validates against <code style={mono}>openprd-prd.schema.json</code>.
          </li>
          <li>The id equals the filename&apos;s numeric prefix.</li>
          <li>All eight body sections are present, in order.</li>
        </ol>
        <p style={{ color: "#41505d" }}>
          Conformance failures are errors. An empty section, a requirement missing its priority tag,
          numbering that skips, a stale index, a one-sided supersession link — those are warnings, and{" "}
          <code style={mono}>--strict</code> promotes them. Every finding carries a stable code, the
          file, the line, and a remediation hint.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Tooling</h2>
          <p>
            <code style={mono}>@logicsrc/openprd</code> implements the standard; the CLI drives it.
          </p>
        </div>
        <pre style={pre}>{`logicsrc prd init                      # template + generated index
logicsrc prd new "Expand the service"  # next free number, eight stub sections
logicsrc prd list                      # id, title, status, tags, requirements
logicsrc prd validate --strict         # conformance + lint, exit 1 on error
logicsrc prd index --write             # regenerate prd/README.md
logicsrc prd status 0001 Review        # refuses illegal transitions
logicsrc prd tasks 0001 --priority P0  # the optional LogicSRC task bridge`}</pre>
        <p style={{ color: "#41505d", marginTop: "1rem" }}>
          Exit codes are stable for CI: <code style={mono}>0</code> ok, <code style={mono}>1</code>{" "}
          invalid, <code style={mono}>2</code> usage, <code style={mono}>3</code> not found.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The optional task bridge</h2>
          <p>Requirements map onto LogicSRC tasks — in tooling, not in the standard.</p>
        </div>
        <p style={{ color: "#41505d" }}>
          Each <code style={mono}>R#</code> becomes one <code style={mono}>logicsrc.task</code>{" "}
          document, validated against its schema before it is emitted. The board defaults to{" "}
          <code style={mono}>/prd/&lt;id&gt;</code>, <code style={mono}>repo</code> carries over, and the
          creator DID is derived from the first author (
          <code style={mono}>anthony@profullstack.com</code> →{" "}
          <code style={mono}>anthony.profullstack</code>).
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Nothing requires you to use it. A PRD with no LogicSRC anywhere near it is still a PRD.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/docs/openprd">Specification</Link> — layout, front-matter, sections,
            lifecycle, conformance, implementation
          </li>
          <li>
            <a
              href="https://github.com/profullstack/logicsrc/blob/master/packages/schemas/schemas/openprd-prd.schema.json"
              rel="noreferrer"
            >
              Front-matter JSON Schema
            </a>
          </li>
          <li>
            <a
              href="https://github.com/profullstack/logicsrc/tree/master/packages/schemas/fixtures/openprd"
              rel="noreferrer"
            >
              Conformance bundle
            </a>{" "}
            — documents that must validate, and documents that must fail with a named code
          </li>
          <li>
            <a href="https://github.com/profullstack/logicsrc/tree/master/prd" rel="noreferrer">
              This repo&apos;s own collection
            </a>{" "}
            — dogfooded: it validates with zero errors and zero warnings
          </li>
          <li>
            <Link href="/openontology">OpenOntology</Link> — the companion standard for durable,
            source-backed domain knowledge
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
