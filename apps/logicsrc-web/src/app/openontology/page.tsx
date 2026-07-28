import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "OpenOntology · LogicSRC",
  description:
    "LogicSRC OpenOntology is an open contract for durable, source-backed domain knowledge shared by humans and AI agents: typed entities, claims with provenance and time, portable queries, and governed change sets.",
  alternates: { canonical: "/openontology" },
};

const card = {
  border: "1px solid #e3e6e0",
  borderRadius: "0.6rem",
  padding: "1rem 1.15rem",
  background: "#fff",
} as const;

const mono = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.85rem",
} as const;

const pre = {
  ...mono,
  background: "#101418",
  color: "#e8eef5",
  padding: "1rem 1.1rem",
  borderRadius: "0.6rem",
  overflowX: "auto" as const,
  lineHeight: 1.6,
  margin: 0,
};

const NOUNS: Array<[string, string, string]> = [
  ["Type", "What kind of thing something is", "Person, Project, Codebase"],
  ["Entity", "A specific thing with a stable id", "eth:person:avery-lindqvist"],
  ["Claim", "A typed statement about an entity, or between two", "Avery —worksOn→ ZK Prover"],
  ["Source", "Where the claim came from", "a commit, a page, an API response"],
  ["Change set", "A reviewable proposal to add, correct, merge, or retract", "“Add Alice to ZK Prover”"],
];

const LAYERS: Array<[string, string]> = [
  [
    "Ontology schema",
    "The types, properties, relationships, constraints, and saved queries that describe a domain. Fetchable on its own, with no data in it.",
  ],
  [
    "Knowledge graph",
    "The populated entities, claims, sources, and evidence. Append-only: corrections add history rather than overwriting it.",
  ],
  [
    "Storage engine",
    "Where those objects happen to live — SQLite, Turso/libSQL, Postgres, an RDF store. Swappable behind one adapter interface.",
  ],
  [
    "Vector search",
    "Optional, rebuildable, derived data that improves discovery. Never authoritative, never the only representation of a fact.",
  ],
  [
    "Agent runtime",
    "The thing that reads, queries, and proposes. It holds scopes, not privileges: it proposes; a human applies.",
  ],
];

export default function OpenOntologyPage(): ReactNode {
  return (
    <SiteShell active="OpenOntology">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenOntology</h2>
          <p>
            An open contract for durable, source-backed domain knowledge shared by humans and AI
            agents. Define the things in a domain, connect them with typed claims, preserve where
            each fact came from, and let agents query or propose changes through governed
            interfaces.
          </p>
        </div>

        <p style={{ color: "#41505d" }}>
          OpenOntology is a <strong>standard</strong>, not a hosted graph product. The normative
          contracts are JSON Schemas; <code style={mono}>@logicsrc/openontology</code> is a
          reference implementation of them, not the definition. It is storage-agnostic,
          model-provider-neutral, and works with no account, no API key, and no network.
        </p>
        <p style={{ color: "#5b6b7a", fontSize: "0.95rem" }}>
          Status: <strong>0.1 Draft</strong>. Ontologies are decades-old work and OpenOntology did
          not invent them — it is one open, agent-shaped contract among several, and it maps to
          JSON-LD and PROV-O rather than replacing them.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Five nouns</h2>
          <p>Learn these and you can read any package.</p>
        </div>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {NOUNS.map(([noun, what, example]) => (
            <div key={noun} style={card}>
              <strong style={{ color: "#101418" }}>{noun}</strong>
              <div style={{ color: "#41505d", margin: "0.2rem 0" }}>{what}</div>
              <code style={{ ...mono, color: "#5b6b7a" }}>{example}</code>
            </div>
          ))}
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>A map of an ecosystem</h2>
          <p>
            People, organizations, projects, codebases, and the research topics they serve —
            connected by typed, queryable relationships instead of prose.
          </p>
        </div>
        <pre style={pre}>{`   Person ──worksAt──▶ Organization ──maintains──▶ Codebase
     │                    │                          │
  worksOn              builds                   implements
     │                    │                          │
     ▼                    ▼                          ▼
  Project ──investigates──▶ ResearchTopic        Protocol
     ▲
   funds
     │
FundingProgram`}</pre>
        <p style={{ color: "#41505d", marginTop: "1rem" }}>
          Ask it a three-hop question — <em>which organizations maintain the codebases the
          applications on this network depend on?</em> — and get back rows you can trace to
          evidence.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Every claim carries its receipts</h2>
          <p>Status, confidence, both clocks, and the sources it rests on.</p>
        </div>
        <pre style={pre}>{`openontology: "0.1"
kind: Claim
subject: "eth:person:avery-lindqvist"
predicate: worksOn
object:
  entity: "eth:project:zk-prover"
status: asserted           # asserted | proposed | disputed
                           # retracted | superseded | derived
confidence: 0.94           # metadata, never permission
validTime:                 # when it was true in the world
  from: 2026-04-01T00:00:00Z
  to: null
assertedAt: 2026-07-25T19:43:12Z   # when we recorded it
assertedBy: "agent:research-mapper"
runId: "run_01J3EXAMPLE"
sources: ["eth:source:commit-a41f"]
evidence: ["eth:evidence:007"]`}</pre>
        <p style={{ color: "#41505d", marginTop: "1rem" }}>
          We say <strong>claim</strong>, not <em>fact</em>. A clean graph makes uncertain things
          look definitive, so status, confidence, source count, valid time, and dispute history
          stay visible everywhere — in query results, in the CLI, and in the UI.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Five things people conflate</h2>
          <p>OpenOntology is the first two. The rest are implementation choices.</p>
        </div>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {LAYERS.map(([name, detail]) => (
            <div key={name} style={card}>
              <strong style={{ color: "#101418" }}>{name}</strong>
              <div style={{ color: "#41505d" }}>{detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Agents propose. Humans apply.</h2>
          <p>The safety model in one line, and what enforces it.</p>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.8, paddingLeft: "1.1rem" }}>
          <li>Agent-created change sets default to <code style={mono}>proposed</code>.</li>
          <li>
            An agent holding <em>every</em> scope still cannot apply — the denial keys on actor
            type, not on privileges.
          </li>
          <li>Confidence is metadata, never permission.</li>
          <li>
            <code style={mono}>--yolo</code> and unattended mode cannot bypass a required approval.
          </li>
          <li>
            Source text is data: an instruction inside an imported document cannot widen scopes or
            move tool boundaries.
          </li>
          <li>Merges, bulk retractions, and breaking migrations require explicit approval.</li>
          <li>Model chain-of-thought is never stored; evidence and policy decisions are.</li>
        </ul>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Five minutes, offline</h2>
          <p>No login, no hosted database, no model key.</p>
        </div>
        <pre style={pre}>{`logicsrc ontology init my-ecosystem
logicsrc ontology validate my-ecosystem --strict
logicsrc ontology query run contributors --dir my-ecosystem
logicsrc ontology query explain contributors --dir my-ecosystem --row 0`}</pre>
        <pre style={{ ...pre, marginTop: "1rem" }}>{`  ✓ 3 entity types
  ✓ 4 relationship types
  ✓ 8 entities
  ✓ 14 claims
  ✓ 2 sources
  ✓ 1 constraints
OpenOntology package is valid.`}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/openontology/explore">Explorer</Link> — browse the example package: types,
            entities, claims with provenance, and the history behind each one
          </li>
          <li>
            <a href="/api/ontologies/openapi">REST API</a> — OpenAPI description of the reference
            service, with SSE events
          </li>
          <li>
            <Link href="/docs/openontology">Specification</Link> — the model, packages, claims,
            queries, validation, CLI, SDK, conformance
          </li>
          <li>
            <Link href="/docs/openontology-governance">Governance</Link> — review, approval,
            scopes, merges, conflicts, rollback, audit, signatures
          </li>
          <li>
            <Link href="/docs/openontology-interoperability">Interoperability</Link> — JSON-LD,
            RDF, SHACL, PROV-O, external ids, compatibility matrix
          </li>
          <li>
            <a
              href="https://github.com/profullstack/logicsrc/tree/master/packages/schemas/schemas"
              rel="noreferrer"
            >
              JSON Schemas
            </a>{" "}
            — 16 normative object contracts under{" "}
            <code style={mono}>logicsrc-openontology-*.schema.json</code>
          </li>
          <li>
            <a
              href="https://github.com/profullstack/logicsrc/tree/master/packages/schemas/fixtures/openontology"
              rel="noreferrer"
            >
              Conformance bundle
            </a>{" "}
            — valid and invalid fixtures a third party can run with no LogicSRC code
          </li>
          <li>
            <a
              href="https://github.com/profullstack/logicsrc/tree/master/examples/openontology/ethereum-ecosystem"
              rel="noreferrer"
            >
              Ethereum ecosystem example
            </a>{" "}
            — 63 entities, 169 claims, 25 sources, all fictional
          </li>
          <li>
            <a
              href="https://github.com/profullstack/logicsrc/blob/master/prd/0001-add-logicsrc-openontology-spec.md"
              rel="noreferrer"
            >
              OpenPRD 0001
            </a>{" "}
            — the proposal, its decisions, and its open questions
          </li>
          <li>
            <a href="https://github.com/profullstack/logicsrc" rel="noreferrer">
              Source on GitHub
            </a>
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
