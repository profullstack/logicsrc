#!/usr/bin/env node
/**
 * Generate the Ethereum ecosystem example package.
 *
 * Every person, organization, project, and source in here is FICTIONAL (R192).
 * The example demonstrates the shape of an ecosystem map — people, orgs,
 * codebases, protocols, L2s, research topics, funding — without depending on
 * live public profiles or implying anything about real projects.
 *
 * Run:  node tools/generate.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify as toYaml } from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const V = "0.1";
const NOW = "2026-07-26T00:00:00Z";
const PREFIX = "eth";
const CURATOR = "mailto:curator@example.org";
const MAPPER = "agent:research-mapper";
const RUN = "run_01J3EXAMPLE";

const yaml = (relPath, value) => {
  mkdirSync(dirname(join(ROOT, relPath)), { recursive: true });
  writeFileSync(join(ROOT, relPath), toYaml(value, { lineWidth: 110 }), "utf8");
};
const ndjson = (relPath, rows) => {
  mkdirSync(dirname(join(ROOT, relPath)), { recursive: true });
  writeFileSync(join(ROOT, relPath), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`, "utf8");
};

/* ── schema ─────────────────────────────────────────────────────────────── */

const entityType = (id, description, extra = {}) => ({
  openontology: V,
  kind: "EntityType",
  id,
  label: id.replace(/([a-z])([A-Z0-9])/g, "$1 $2"),
  description,
  ...extra
});

const entityTypes = [
  entityType("Person", "A human participant in the ecosystem.", {
    keyProperties: ["canonicalName"],
    properties: {
      focus: { type: "string", description: "Primary area of work." },
      startedIn: { type: "integer", description: "Year they began working in the ecosystem." }
    }
  }),
  entityType("Organization", "A company, foundation, DAO, collective, or working group.", {
    properties: { homepage: { type: "url" }, kind: { type: "enum", enum: ["company", "foundation", "dao", "collective"] } }
  }),
  entityType("Project", "A named body of work people and organizations contribute to.", {
    properties: { homepage: { type: "url" }, startedOn: { type: "date" } }
  }),
  entityType("Codebase", "A specific repository or source tree.", {
    properties: { language: { type: "string" }, license: { type: "string" }, repository: { type: "url" } }
  }),
  entityType("ResearchTopic", "A research direction the ecosystem is actively working on."),
  entityType("Protocol", "A specified protocol or standard.", { properties: { specification: { type: "url" } } }),
  entityType("Network", "A live chain or network.", { properties: { chainId: { type: "integer" } } }),
  entityType("Layer2", "A layer-2 network settling to a base layer.", {
    properties: { proofSystem: { type: "enum", enum: ["validity", "fraud", "hybrid"] } }
  }),
  entityType("Application", "A user-facing application deployed on a network."),
  entityType("FundingProgram", "A grants program, fund, or funding round.", {
    properties: { budgetUsd: { type: "number" } }
  }),
  entityType("Publication", "A paper, spec, or long-form writeup.", { properties: { published: { type: "date" } } }),
  entityType("Event", "A conference, workshop, or summit.", { properties: { held: { type: "date" } } })
];

const rel = (id, label, description, from, to, extra = {}) => ({
  openontology: V,
  kind: "RelationshipType",
  id,
  label,
  description,
  from,
  to,
  cardinality: "many-to-many",
  ...extra
});

const relationships = [
  rel("worksAt", "works at", "A person is affiliated with an organization.", ["Person"], ["Organization"], { temporal: true }),
  rel("memberOf", "member of", "An organization belongs to a larger body.", ["Organization"], ["Organization"], { temporal: true }),
  rel("worksOn", "works on", "A person actively contributes work to a project.", ["Person"], ["Project"], {
    temporal: true,
    inverse: "hasContributor"
  }),
  rel("hasContributor", "has contributor", "Inverse of worksOn.", ["Project"], ["Person"]),
  rel("contributesTo", "contributes to", "A person contributes to a codebase.", ["Person"], ["Codebase"], { temporal: true }),
  rel("maintains", "maintains", "An organization is responsible for a codebase.", ["Organization"], ["Codebase"]),
  rel("builds", "builds", "An organization builds a project.", ["Organization"], ["Project"], { temporal: true }),
  rel("funds", "funds", "A funding program supports a project or research topic.", ["FundingProgram"], ["Project", "ResearchTopic"], { temporal: true }),
  rel("investigates", "investigates", "A project or person investigates a research topic.", ["Project", "Person", "Organization"], ["ResearchTopic"], { temporal: true }),
  rel("implements", "implements", "A codebase implements a protocol.", ["Codebase"], ["Protocol"]),
  rel("uses", "uses", "A project or application uses a protocol or codebase.", ["Project", "Application"], ["Protocol", "Codebase"]),
  rel("runsOn", "runs on", "An application runs on a network or layer 2.", ["Application"], ["Network", "Layer2"]),
  rel("deployedOn", "deployed on", "A layer 2 settles to a base network.", ["Layer2"], ["Network"]),
  rel("dependsOn", "depends on", "A codebase depends on another codebase.", ["Codebase"], ["Codebase"]),
  rel("authored", "authored", "A person authored a publication.", ["Person"], ["Publication"]),
  rel("collaboratesWith", "collaborates with", "Two people work together.", ["Person"], ["Person"], { symmetric: true }),
  rel("forkedFrom", "forked from", "A codebase was forked from another.", ["Codebase"], ["Codebase"])
];

const properties = [
  ["focus", "string", "A person's primary area of work."],
  ["startedIn", "integer", "Year a person began working in the ecosystem."],
  ["homepage", "url", "Canonical URL."],
  ["kind", "string", "Organization kind."],
  ["startedOn", "date", "Date a project began."],
  ["language", "string", "Primary implementation language of a codebase."],
  ["license", "string", "SPDX license of a codebase."],
  ["repository", "url", "Repository URL."],
  ["specification", "url", "Specification URL."],
  ["chainId", "integer", "Network chain id."],
  ["proofSystem", "string", "Layer-2 proof system."],
  ["budgetUsd", "number", "Program budget in USD."],
  ["published", "date", "Publication date."],
  ["held", "date", "Event date."]
].map(([id, type, description]) => ({
  openontology: V,
  kind: "Property",
  id,
  label: id,
  description,
  type
}));

/* ── entities ───────────────────────────────────────────────────────────── */

const entities = [];
const entity = (type, slug, canonicalName, extra = {}) => {
  const record = {
    openontology: V,
    kind: "Entity",
    id: `${PREFIX}:${slugType(type)}:${slug}`,
    type,
    canonicalName,
    createdAt: NOW,
    createdBy: CURATOR,
    ...extra
  };
  entities.push(record);
  return record.id;
};

function slugType(type) {
  return {
    Person: "person",
    Organization: "org",
    Project: "project",
    Codebase: "code",
    ResearchTopic: "topic",
    Protocol: "protocol",
    Network: "network",
    Layer2: "l2",
    Application: "app",
    FundingProgram: "fund",
    Publication: "pub",
    Event: "event"
  }[type];
}

const P = {};
const people = [
  ["avery-lindqvist", "Avery Lindqvist", { aliases: ["avery.eth"], externalIds: { github: "averyl" } }],
  ["marisol-tan", "Marisol Tan", { externalIds: { github: "mtan" } }],
  ["dev-okafor", "Dev Okafor", { aliases: ["devo"] }],
  ["ingrid-halvorsen", "Ingrid Halvorsen", {}],
  ["rafael-benitez", "Rafael Benitez", { externalIds: { github: "rbenitez" } }],
  ["yuki-shimada", "Yuki Shimada", { aliases: ["yuki.eth"] }],
  ["nadia-farouk", "Nadia Farouk", {}],
  ["tomas-vrba", "Tomas Vrba", {}],
  ["priya-raghavan", "Priya Raghavan", { externalIds: { github: "praghavan" } }],
  ["kwame-mensah", "Kwame Mensah", {}],
  ["lena-brandt", "Lena Brandt", {}],
  ["oscar-delgado", "Oscar Delgado", {}],
  ["hana-kovacs", "Hana Kovacs", {}],
  ["samir-haddad", "Samir Haddad", { aliases: ["samir.eth"] }],
  // Deliberate near-duplicate: the merge proposal in changesets/ resolves it.
  ["s-haddad", "S. Haddad", { aliases: ["shaddad"] }]
];
for (const [slug, name, extra] of people) P[slug] = entity("Person", slug, name, extra);

const O = {};
for (const [slug, name] of [
  ["northwind-labs", "Northwind Labs"],
  ["bluebird-foundation", "Bluebird Foundation"],
  ["cinder-collective", "Cinder Collective"],
  ["harbor-research", "Harbor Research"],
  ["tessellate-dao", "Tessellate DAO"],
  ["quill-systems", "Quill Systems"]
]) O[slug] = entity("Organization", slug, name);

const PR = {};
for (const [slug, name] of [
  ["zk-prover", "ZK Prover"],
  ["ledger-indexer", "Ledger Indexer"],
  ["state-sync", "State Sync"],
  ["rollup-bridge", "Rollup Bridge"],
  ["account-toolkit", "Account Toolkit"],
  ["mempool-observatory", "Mempool Observatory"],
  ["docs-portal", "Docs Portal"],
  ["light-client", "Light Client"]
]) PR[slug] = entity("Project", slug, name);

const C = {};
for (const [slug, name, language] of [
  ["zk-prover-core", "zk-prover-core", "Rust"],
  ["zk-prover-cli", "zk-prover-cli", "Rust"],
  ["indexer-node", "indexer-node", "Go"],
  ["indexer-schema", "indexer-schema", "TypeScript"],
  ["sync-engine", "sync-engine", "Rust"],
  ["bridge-contracts", "bridge-contracts", "Solidity"],
  ["account-sdk", "account-sdk", "TypeScript"],
  ["light-client-rs", "light-client-rs", "Rust"]
]) C[slug] = entity("Codebase", slug, name, { extensions: { "eth:language": language } });

const T = {};
for (const [slug, name] of [
  ["zero-knowledge", "Zero Knowledge Proofs"],
  ["account-abstraction", "Account Abstraction"],
  ["data-availability", "Data Availability"],
  ["consensus-safety", "Consensus Safety"],
  ["mev-mitigation", "MEV Mitigation"]
]) T[slug] = entity("ResearchTopic", slug, name);

const PROTO = {};
for (const [slug, name] of [
  ["proof-envelope", "Proof Envelope Protocol"],
  ["account-ops", "Account Operations Protocol"],
  ["blob-commit", "Blob Commitment Protocol"],
  ["light-sync", "Light Sync Protocol"]
]) PROTO[slug] = entity("Protocol", slug, name);

const N = {};
for (const [slug, name, chainId] of [
  ["mainnet-sim", "Mainnet Simulation", 9001],
  ["testnet-sim", "Testnet Simulation", 9002]
]) N[slug] = entity("Network", slug, name, { extensions: { "eth:chainId": chainId } });

const L2 = {};
for (const [slug, name] of [
  ["tessera", "Tessera"],
  ["cascade", "Cascade"],
  ["lattice", "Lattice"]
]) L2[slug] = entity("Layer2", slug, name);

const A = {};
for (const [slug, name] of [
  ["swap-desk", "Swap Desk"],
  ["lend-pool", "Lend Pool"],
  ["name-registry", "Name Registry"],
  ["vault-manager", "Vault Manager"]
]) A[slug] = entity("Application", slug, name);

const F = {};
for (const [slug, name] of [
  ["open-proofs-fund", "Open Proofs Fund"],
  ["public-goods-round", "Public Goods Round"],
  ["research-stipends", "Research Stipends"]
]) F[slug] = entity("FundingProgram", slug, name);

const PUB = {};
for (const [slug, name] of [
  ["recursive-proofs-paper", "Recursive Proofs at Scale"],
  ["aa-survey", "A Survey of Account Abstraction Designs"],
  ["da-sampling-note", "Notes on Data Availability Sampling"]
]) PUB[slug] = entity("Publication", slug, name);

const E = {};
for (const [slug, name] of [
  ["proof-summit", "Proof Summit"],
  ["rollup-workshop", "Rollup Workshop"]
]) E[slug] = entity("Event", slug, name);

/* ── sources and evidence ───────────────────────────────────────────────── */

const sources = [];
const evidence = [];
const source = (slug, sourceType, uri, title, license = "CC-BY-4.0") => {
  const id = `${PREFIX}:source:${slug}`;
  sources.push({
    openontology: V,
    kind: "Source",
    id,
    sourceType,
    uri,
    title,
    publisher: "example.org",
    retrievedAt: NOW,
    mediaType: sourceType === "git-commit" ? "text/plain" : "text/html",
    license
  });
  return id;
};

const S = {};
for (const [slug, kind, path, title] of [
  ["northwind-team", "web-page", "team", "Northwind Labs team page"],
  ["bluebird-team", "web-page", "bluebird/team", "Bluebird Foundation team page"],
  ["cinder-team", "web-page", "cinder/team", "Cinder Collective contributors"],
  ["harbor-team", "web-page", "harbor/people", "Harbor Research people"],
  ["tessellate-members", "web-page", "tessellate/members", "Tessellate DAO members"],
  ["quill-about", "web-page", "quill/about", "Quill Systems about page"],
  ["zk-prover-readme", "markdown", "repo/zk-prover/README.md", "zk-prover README"],
  ["indexer-readme", "markdown", "repo/indexer/README.md", "indexer README"],
  ["sync-readme", "markdown", "repo/sync/README.md", "sync-engine README"],
  ["bridge-readme", "markdown", "repo/bridge/README.md", "bridge-contracts README"],
  ["account-readme", "markdown", "repo/account/README.md", "account-sdk README"],
  ["light-readme", "markdown", "repo/light/README.md", "light-client README"],
  ["commit-a41f", "git-commit", "repo/zk-prover/commit/a41f", "zk-prover commit a41f"],
  ["commit-b72c", "git-commit", "repo/indexer/commit/b72c", "indexer commit b72c"],
  ["commit-c93d", "git-commit", "repo/sync/commit/c93d", "sync-engine commit c93d"],
  ["commit-d10e", "git-commit", "repo/bridge/commit/d10e", "bridge commit d10e"],
  ["grants-ledger", "api-response", "api/grants", "Grants ledger API"],
  ["roadmap-2026", "web-page", "roadmap/2026", "2026 ecosystem roadmap"],
  ["proof-summit-program", "web-page", "events/proof-summit", "Proof Summit program"],
  ["rollup-workshop-notes", "web-page", "events/rollup-workshop", "Rollup Workshop notes"],
  ["l2-registry", "api-response", "api/l2s", "Layer-2 registry"],
  ["app-registry", "api-response", "api/apps", "Application registry"],
  ["spec-index", "web-page", "specs", "Protocol specification index"],
  ["paper-index", "web-page", "papers", "Publication index"],
  ["dependency-manifest", "csv", "data/dependencies.csv", "Dependency manifest export"]
]) S[slug] = source(slug, kind, `https://example.org/${path}`, title);

// One source is deliberately stale, to exercise the staleness warning path.
sources.find((s) => s.id === S["roadmap-2026"]).stale = true;
sources.find((s) => s.id === S["roadmap-2026"]).lastCheckedAt = NOW;

let evSeq = 0;
const withEvidence = (sourceId, selector, excerpt) => {
  const id = `${PREFIX}:evidence:${String(++evSeq).padStart(3, "0")}`;
  evidence.push({
    openontology: V,
    kind: "Evidence",
    id,
    source: sourceId,
    selector,
    ...(excerpt ? { excerpt } : {})
  });
  return id;
};

/* ── claims ─────────────────────────────────────────────────────────────── */

const claims = [];
let claimSeq = 0;
const nextClaim = () => `${PREFIX}:claim:${String(++claimSeq).padStart(4, "0")}`;

const link = (subject, predicate, object, options = {}) => {
  const record = {
    openontology: V,
    kind: "Claim",
    id: nextClaim(),
    ontology: "ethereum-ecosystem@0.1.0",
    subject,
    predicate,
    object: { entity: object },
    status: options.status ?? "asserted",
    confidence: options.confidence ?? 0.9,
    assertedAt: NOW,
    assertedBy: options.assertedBy ?? CURATOR,
    sources: options.sources ?? [S["roadmap-2026"]],
    ...(options.validFrom ? { validTime: { from: options.validFrom, to: options.validTo ?? null } } : {}),
    ...(options.evidence ? { evidence: options.evidence } : {}),
    ...(options.runId ? { runId: options.runId } : {}),
    ...(options.extra ?? {})
  };
  claims.push(record);
  return record.id;
};

const attr = (subject, predicate, value) => {
  const record = {
    openontology: V,
    kind: "Claim",
    id: nextClaim(),
    ontology: "ethereum-ecosystem@0.1.0",
    subject,
    predicate,
    object: { value },
    status: "asserted",
    assertedAt: NOW,
    assertedBy: CURATOR,
    firstParty: true
  };
  claims.push(record);
  return record.id;
};

const Y = (year, month = 1) => `${year}-${String(month).padStart(2, "0")}-01T00:00:00Z`;

// employment
const employment = [
  ["avery-lindqvist", "northwind-labs", 2023],
  ["marisol-tan", "northwind-labs", 2024],
  ["dev-okafor", "northwind-labs", 2022],
  ["ingrid-halvorsen", "bluebird-foundation", 2021],
  ["rafael-benitez", "bluebird-foundation", 2024],
  ["yuki-shimada", "cinder-collective", 2023],
  ["nadia-farouk", "cinder-collective", 2025],
  ["tomas-vrba", "harbor-research", 2022],
  ["priya-raghavan", "harbor-research", 2023],
  ["kwame-mensah", "tessellate-dao", 2024],
  ["lena-brandt", "tessellate-dao", 2025],
  ["oscar-delgado", "quill-systems", 2023],
  ["hana-kovacs", "quill-systems", 2024],
  ["samir-haddad", "quill-systems", 2022]
];
for (const [person, org, year] of employment) {
  link(P[person], "worksAt", O[org], {
    validFrom: Y(year),
    sources: [S[`${org.split("-")[0]}-team`] ?? S["northwind-team"]]
  });
}

link(O["cinder-collective"], "memberOf", O["tessellate-dao"], { validFrom: Y(2024), sources: [S["tessellate-members"]] });
link(O["quill-systems"], "memberOf", O["tessellate-dao"], { validFrom: Y(2025), sources: [S["tessellate-members"]] });

// project work
const projectWork = [
  ["avery-lindqvist", "zk-prover", 2024],
  ["marisol-tan", "zk-prover", 2025],
  ["dev-okafor", "ledger-indexer", 2023],
  ["ingrid-halvorsen", "state-sync", 2022],
  ["rafael-benitez", "rollup-bridge", 2025],
  ["yuki-shimada", "account-toolkit", 2024],
  ["nadia-farouk", "mempool-observatory", 2025],
  ["tomas-vrba", "light-client", 2023],
  ["priya-raghavan", "zk-prover", 2025],
  ["kwame-mensah", "rollup-bridge", 2024],
  ["lena-brandt", "docs-portal", 2025],
  ["oscar-delgado", "state-sync", 2024],
  ["hana-kovacs", "account-toolkit", 2025],
  ["samir-haddad", "light-client", 2023],
  ["avery-lindqvist", "light-client", 2026],
  ["dev-okafor", "mempool-observatory", 2026],
  ["priya-raghavan", "docs-portal", 2026],
  ["yuki-shimada", "rollup-bridge", 2026]
];
for (const [person, project, year] of projectWork) {
  link(P[person], "worksOn", PR[project], {
    validFrom: Y(year),
    sources: [S["roadmap-2026"]],
    evidence: [withEvidence(S["roadmap-2026"], { type: "line-range", start: 10 + claimSeq, end: 12 + claimSeq })]
  });
}

// codebase contributions
const contributions = [
  ["avery-lindqvist", "zk-prover-core", "commit-a41f"],
  ["marisol-tan", "zk-prover-core", "commit-a41f"],
  ["priya-raghavan", "zk-prover-cli", "commit-a41f"],
  ["dev-okafor", "indexer-node", "commit-b72c"],
  ["dev-okafor", "indexer-schema", "commit-b72c"],
  ["ingrid-halvorsen", "sync-engine", "commit-c93d"],
  ["oscar-delgado", "sync-engine", "commit-c93d"],
  ["rafael-benitez", "bridge-contracts", "commit-d10e"],
  ["kwame-mensah", "bridge-contracts", "commit-d10e"],
  ["yuki-shimada", "account-sdk", "commit-a41f"],
  ["hana-kovacs", "account-sdk", "commit-a41f"],
  ["tomas-vrba", "light-client-rs", "commit-c93d"],
  ["samir-haddad", "light-client-rs", "commit-c93d"]
];
for (const [person, code, commit] of contributions) {
  link(P[person], "contributesTo", C[code], {
    validFrom: Y(2025),
    sources: [S[commit]],
    evidence: [withEvidence(S[commit], { type: "commit-path", path: `src/${code}.rs`, commit: commit.slice(-4) })]
  });
}

// maintenance and builds
const maintenance = [
  ["northwind-labs", "zk-prover-core"],
  ["northwind-labs", "zk-prover-cli"],
  ["northwind-labs", "indexer-node"],
  ["bluebird-foundation", "indexer-schema"],
  ["bluebird-foundation", "sync-engine"],
  ["cinder-collective", "bridge-contracts"],
  ["quill-systems", "account-sdk"],
  ["harbor-research", "light-client-rs"]
];
for (const [org, code] of maintenance) link(O[org], "maintains", C[code], { sources: [S[`${code.split("-")[0]}-readme`] ?? S["zk-prover-readme"]] });

const builds = [
  ["northwind-labs", "zk-prover", 2024],
  ["northwind-labs", "ledger-indexer", 2023],
  ["bluebird-foundation", "state-sync", 2022],
  ["cinder-collective", "rollup-bridge", 2024],
  ["quill-systems", "account-toolkit", 2024],
  ["harbor-research", "light-client", 2023],
  ["tessellate-dao", "docs-portal", 2025],
  ["cinder-collective", "mempool-observatory", 2025]
];
for (const [org, project, year] of builds) link(O[org], "builds", PR[project], { validFrom: Y(year), sources: [S["roadmap-2026"]] });

// research
const research = [
  [PR["zk-prover"], "zero-knowledge"],
  [PR["rollup-bridge"], "data-availability"],
  [PR["account-toolkit"], "account-abstraction"],
  [PR["mempool-observatory"], "mev-mitigation"],
  [PR["light-client"], "consensus-safety"],
  [PR["state-sync"], "consensus-safety"],
  [P["avery-lindqvist"], "zero-knowledge"],
  [P["priya-raghavan"], "zero-knowledge"],
  [P["yuki-shimada"], "account-abstraction"],
  [P["nadia-farouk"], "mev-mitigation"],
  [P["tomas-vrba"], "consensus-safety"],
  [O["harbor-research"], "data-availability"]
];
for (const [subject, topic] of research) link(subject, "investigates", T[topic], { validFrom: Y(2025), sources: [S["paper-index"]] });

// protocols and implementations
for (const [code, protocol] of [
  ["zk-prover-core", "proof-envelope"],
  ["zk-prover-cli", "proof-envelope"],
  ["account-sdk", "account-ops"],
  ["bridge-contracts", "blob-commit"],
  ["light-client-rs", "light-sync"],
  ["sync-engine", "light-sync"],
  ["indexer-node", "blob-commit"],
  ["indexer-schema", "blob-commit"]
]) link(C[code], "implements", PROTO[protocol], { sources: [S["spec-index"]] });

for (const [subject, object] of [
  [PR["zk-prover"], PROTO["proof-envelope"]],
  [PR["rollup-bridge"], PROTO["blob-commit"]],
  [PR["account-toolkit"], PROTO["account-ops"]],
  [PR["light-client"], PROTO["light-sync"]],
  [A["swap-desk"], C["account-sdk"]],
  [A["lend-pool"], C["account-sdk"]],
  [A["name-registry"], PROTO["account-ops"]],
  [A["vault-manager"], C["bridge-contracts"]],
  [PR["ledger-indexer"], C["indexer-schema"]],
  [PR["state-sync"], PROTO["light-sync"]]
]) link(subject, "uses", object, { sources: [S["dependency-manifest"]] });

// networks and deployments
for (const [l2, network] of [
  ["tessera", "mainnet-sim"],
  ["cascade", "mainnet-sim"],
  ["lattice", "testnet-sim"]
]) link(L2[l2], "deployedOn", N[network], { sources: [S["l2-registry"]] });

for (const [app, target] of [
  ["swap-desk", L2["tessera"]],
  ["lend-pool", L2["tessera"]],
  ["name-registry", L2["cascade"]],
  ["vault-manager", N["mainnet-sim"]],
  ["swap-desk", L2["lattice"]]
]) link(A[app], "runsOn", target, { sources: [S["app-registry"]] });

// dependencies and forks
for (const [from, to] of [
  ["zk-prover-cli", "zk-prover-core"],
  ["indexer-schema", "indexer-node"],
  ["bridge-contracts", "zk-prover-core"],
  ["account-sdk", "indexer-schema"],
  ["light-client-rs", "sync-engine"],
  ["sync-engine", "zk-prover-core"],
  ["indexer-node", "sync-engine"],
  ["account-sdk", "bridge-contracts"]
]) link(C[from], "dependsOn", C[to], { sources: [S["dependency-manifest"]] });

for (const [from, to] of [
  ["zk-prover-cli", "zk-prover-core"],
  ["light-client-rs", "sync-engine"],
  ["indexer-schema", "indexer-node"]
]) link(C[from], "forkedFrom", C[to], { sources: [S["dependency-manifest"]], confidence: 0.75 });

// publications, events, collaboration
for (const [person, pub] of [
  ["avery-lindqvist", "recursive-proofs-paper"],
  ["priya-raghavan", "recursive-proofs-paper"],
  ["yuki-shimada", "aa-survey"],
  ["hana-kovacs", "aa-survey"],
  ["tomas-vrba", "da-sampling-note"],
  ["ingrid-halvorsen", "da-sampling-note"]
]) link(P[person], "authored", PUB[pub], { sources: [S["paper-index"]] });

for (const [a, b] of [
  ["avery-lindqvist", "priya-raghavan"],
  ["yuki-shimada", "hana-kovacs"],
  ["tomas-vrba", "ingrid-halvorsen"],
  ["dev-okafor", "nadia-farouk"],
  ["rafael-benitez", "kwame-mensah"],
  ["marisol-tan", "avery-lindqvist"]
]) link(P[a], "collaboratesWith", P[b], { sources: [S["proof-summit-program"]], confidence: 0.8 });

// funding
for (const [fund, target, year] of [
  ["open-proofs-fund", PR["zk-prover"], 2025],
  ["open-proofs-fund", T["zero-knowledge"], 2025],
  ["public-goods-round", PR["docs-portal"], 2026],
  ["public-goods-round", PR["light-client"], 2025],
  ["research-stipends", T["data-availability"], 2026],
  ["research-stipends", T["consensus-safety"], 2025]
]) link(F[fund], "funds", target, { validFrom: Y(year), sources: [S["grants-ledger"]] });

// scalar attributes
attr(P["avery-lindqvist"], "focus", "Recursive proof systems");
attr(P["avery-lindqvist"], "startedIn", 2019);
attr(P["yuki-shimada"], "focus", "Wallet and account UX");
attr(P["tomas-vrba"], "focus", "Light client security");
attr(O["northwind-labs"], "homepage", "https://example.org/northwind");
attr(O["bluebird-foundation"], "homepage", "https://example.org/bluebird");
attr(O["northwind-labs"], "kind", "company");
attr(O["bluebird-foundation"], "kind", "foundation");
attr(O["tessellate-dao"], "kind", "dao");
attr(PR["zk-prover"], "homepage", "https://example.org/zk-prover");
attr(PR["zk-prover"], "startedOn", "2024-03-01");
attr(PR["ledger-indexer"], "homepage", "https://example.org/ledger-indexer");
attr(PR["light-client"], "homepage", "https://example.org/light-client");
attr(C["zk-prover-core"], "language", "Rust");
attr(C["indexer-node"], "language", "Go");
attr(C["account-sdk"], "language", "TypeScript");
attr(C["bridge-contracts"], "language", "Solidity");
attr(C["zk-prover-core"], "license", "Apache-2.0");
attr(C["account-sdk"], "license", "MIT");
attr(C["zk-prover-core"], "repository", "https://example.org/repo/zk-prover");
attr(PROTO["proof-envelope"], "specification", "https://example.org/specs/proof-envelope");
attr(N["mainnet-sim"], "chainId", 9001);
attr(N["testnet-sim"], "chainId", 9002);
attr(L2["tessera"], "proofSystem", "validity");
attr(L2["cascade"], "proofSystem", "fraud");
attr(L2["lattice"], "proofSystem", "hybrid");
attr(F["open-proofs-fund"], "budgetUsd", 250000);
attr(F["public-goods-round"], "budgetUsd", 90000);
attr(PUB["recursive-proofs-paper"], "published", "2025-11-04");
attr(PUB["aa-survey"], "published", "2026-02-17");
attr(E["proof-summit"], "held", "2026-05-12");
attr(E["rollup-workshop"], "held", "2026-06-23");

/* ── the four lifecycle demonstrations ──────────────────────────────────── */

// 1. An agent proposal that has not been accepted yet.
const proposed = link(P["lena-brandt"], "worksOn", PR["mempool-observatory"], {
  status: "proposed",
  assertedBy: MAPPER,
  runId: RUN,
  confidence: 0.61,
  validFrom: Y(2026, 7),
  sources: [S["roadmap-2026"]],
  extra: {
    model: {
      provider: "example-provider",
      model: "example-extractor-1",
      promptVersion: "map-sources-to-claims@3",
      extractedAt: NOW,
      rationale: "Roadmap lists Lena under the observatory workstream; no commit activity yet."
    }
  }
});

// 2. A disputed claim, plus the counter-claim that disputes it.
const disputedClaim = link(P["kwame-mensah"], "worksOn", PR["state-sync"], {
  status: "disputed",
  confidence: 0.55,
  validFrom: Y(2025),
  sources: [S["roadmap-2026"]]
});
link(P["kwame-mensah"], "worksOn", PR["rollup-bridge"], {
  confidence: 0.93,
  validFrom: Y(2025),
  sources: [S["commit-d10e"]],
  extra: { disputes: disputedClaim }
});

// 3. A retracted claim: it stays on the record, out of the current view.
link(P["oscar-delgado"], "worksOn", PR["docs-portal"], {
  status: "retracted",
  confidence: 0.4,
  validFrom: Y(2024),
  sources: [S["roadmap-2026"]],
  extra: { retractionReason: "Confused with a same-named contributor on another project." }
});

// 4. A supersession: the old affiliation ended, the new one replaced it.
const supersededClaim = link(P["marisol-tan"], "worksAt", O["bluebird-foundation"], {
  status: "superseded",
  validFrom: Y(2022),
  validTo: Y(2024),
  sources: [S["bluebird-team"]]
});
link(P["marisol-tan"], "worksAt", O["northwind-labs"], {
  validFrom: Y(2024),
  sources: [S["northwind-team"]],
  extra: { supersedes: supersededClaim }
});

// 5. A derived claim, showing its inputs.
const derivedInputs = claims
  .filter((c) => c.predicate === "contributesTo" && c.subject === P["avery-lindqvist"])
  .map((c) => c.id);
claims.push({
  openontology: V,
  kind: "Claim",
  id: nextClaim(),
  ontology: "ethereum-ecosystem@0.1.0",
  subject: O["northwind-labs"],
  predicate: "investigates",
  object: { entity: T["zero-knowledge"] },
  status: "derived",
  confidence: 0.7,
  observedAt: NOW,
  assertedAt: NOW,
  assertedBy: "service:rule-engine",
  derivedFrom: {
    rule: "org-investigates-topic-of-its-contributors",
    inputs: derivedInputs
  }
});

/* ── saved queries and constraints ──────────────────────────────────────── */

const savedQuery = (id, label, description, query, parameters) => ({
  openontology: V,
  kind: "SavedQuery",
  id,
  label,
  description,
  ...(parameters ? { parameters } : {}),
  query
});

const queries = [
  savedQuery(
    "people-working-on-topic",
    "People and organizations working on a research topic",
    "Every person working on a project that investigates the given research topic.",
    {
      match: [
        { subject: "?person", predicate: "worksOn", object: "?project" },
        { subject: "?project", predicate: "investigates", object: "$topic" }
      ],
      select: ["?person", "?project"],
      include: { claimStatus: ["asserted"], labels: true },
      orderBy: [{ variable: "?person", direction: "asc" }]
    },
    { topic: { type: "string", required: true, default: `${PREFIX}:topic:zero-knowledge` } }
  ),
  savedQuery(
    "codebases-implementing-protocol",
    "Codebases implementing a protocol",
    "Which codebases implement the given protocol, and who maintains them.",
    {
      match: [
        { subject: "?codebase", predicate: "implements", object: "$protocol" },
        { subject: "?org", predicate: "maintains", object: "?codebase" }
      ],
      select: ["?codebase", "?org"],
      include: { claimStatus: ["asserted"], labels: true }
    },
    { protocol: { type: "string", required: true, default: `${PREFIX}:protocol:proof-envelope` } }
  ),
  savedQuery(
    "orgs-behind-a-network",
    "Organizations behind the codebases a network depends on",
    "Three hops: layer 2 → application → codebase → maintaining organization.",
    {
      match: [
        { subject: "?l2", predicate: "deployedOn", object: "?network" },
        { subject: "?app", predicate: "runsOn", object: "?l2" },
        { subject: "?app", predicate: "uses", object: "?codebase" },
        { subject: "?org", predicate: "maintains", object: "?codebase" }
      ],
      select: ["?network", "?l2", "?app", "?org"],
      include: { claimStatus: ["asserted"], labels: true },
      distinct: true
    }
  ),
  savedQuery(
    "funded-work",
    "Funded projects and research directions",
    "Which funding programs support which projects or research topics.",
    {
      match: [{ subject: "?fund", predicate: "funds", object: "?target" }],
      select: ["?fund", "?target"],
      include: { claimStatus: ["asserted"], labels: true },
      orderBy: [{ variable: "?fund", direction: "asc" }]
    }
  ),
  savedQuery(
    "claims-needing-review",
    "Claims that still need a human decision",
    "Proposed and disputed claims, which a curator should accept, reject, or resolve.",
    {
      match: [{ subject: "?subject", predicate: "?predicate", object: "?object", bindClaim: "?claim" }],
      select: ["?claim", "?subject", "?predicate", "?object"],
      include: { claimStatus: ["proposed", "disputed"] }
    }
  )
];

const constraints = [
  {
    openontology: V,
    kind: "Constraint",
    id: "codebase-has-language",
    description: "Every codebase should record its primary implementation language.",
    severity: "info",
    remediation: "Add a language claim for the codebase.",
    rule: { type: "required-predicate", entityType: "Codebase", predicate: "language" }
  },
  {
    openontology: V,
    kind: "Constraint",
    id: "layer2-settles-somewhere",
    description: "Every layer 2 must declare the network it settles to.",
    severity: "error",
    remediation: "Add a deployedOn claim from the layer 2 to its base network.",
    rule: { type: "cardinality", predicate: "deployedOn", entityType: "Layer2", min: 1, max: 1 }
  },
  {
    openontology: V,
    kind: "Constraint",
    id: "chain-ids-unique",
    description: "Two networks must not share a chain id.",
    severity: "error",
    remediation: "Correct the duplicated chainId claim.",
    rule: { type: "unique", predicate: "chainId" }
  },
  {
    openontology: V,
    kind: "Constraint",
    id: "proof-system-known",
    description: "A layer 2's proof system must be one of the three recognised kinds.",
    severity: "error",
    rule: { type: "allowed-values", predicate: "proofSystem", values: ["validity", "fraud", "hybrid"] }
  }
];

const namespaces = [
  {
    openontology: V,
    kind: "Namespace",
    prefix: PREFIX,
    uri: "https://logicsrc.com/ontology/ethereum/",
    description: "Compact id prefix for the Ethereum ecosystem example."
  }
];

const manifest = {
  openontology: V,
  kind: "OntologyPackage",
  id: "ethereum-ecosystem",
  name: "Ethereum Ecosystem Ontology",
  version: "0.1.0",
  namespace: "https://logicsrc.com/ontology/ethereum/",
  description:
    "An open map of people, organizations, projects, codebases, research topics, protocols, networks, and applications. All data in this package is fictional and exists to demonstrate the OpenOntology contract.",
  license: "CC-BY-4.0",
  maintainers: [{ id: CURATOR, name: "Example Curator" }],
  imports: [],
  schema: {
    namespaces: "schema/namespaces.yaml",
    entityTypes: "schema/entity-types.yaml",
    properties: "schema/properties.yaml",
    relationships: "schema/relationships.yaml",
    constraints: "schema/constraints.yaml",
    queries: "schema/queries.yaml"
  },
  data: {
    entities: "data/entities.ndjson",
    claims: "data/claims.ndjson",
    sources: "data/sources.ndjson",
    evidence: "data/evidence.ndjson"
  }
};

/* ── a pending merge proposal, kept next to the package ─────────────────── */

const mergeChangeSet = {
  openontology: V,
  kind: "ChangeSet",
  id: "changeset:merge-haddad",
  ontology: "ethereum-ecosystem@0.1.0",
  title: "Merge S. Haddad into Samir Haddad",
  rationale:
    "Both records point at the same contributor: identical alias handle, same organization, overlapping commits on light-client-rs.",
  createdAt: NOW,
  createdBy: MAPPER,
  actorType: "agent",
  runId: RUN,
  operations: [
    {
      op: "merge-entity",
      source: `${PREFIX}:person:s-haddad`,
      target: `${PREFIX}:person:samir-haddad`,
      reason: "Same person; the shorter record was created from a commit signature."
    }
  ],
  requiredApprovals: 1,
  status: "proposed"
};

/* ── write ──────────────────────────────────────────────────────────────── */

yaml("openontology.yaml", manifest);
yaml("schema/namespaces.yaml", namespaces);
yaml("schema/entity-types.yaml", entityTypes);
yaml("schema/properties.yaml", properties);
yaml("schema/relationships.yaml", relationships);
yaml("schema/constraints.yaml", constraints);
yaml("schema/queries.yaml", queries);
ndjson("data/entities.ndjson", entities);
ndjson("data/claims.ndjson", claims);
ndjson("data/sources.ndjson", sources);
ndjson("data/evidence.ndjson", evidence);
yaml("changesets/merge-haddad.yaml", mergeChangeSet);

console.log(
  `entityTypes=${entityTypes.length} relationshipTypes=${relationships.length} entities=${entities.length} ` +
    `claims=${claims.length} sources=${sources.length} evidence=${evidence.length} queries=${queries.length}`
);
console.log(
  `proposed=${claims.filter((c) => c.status === "proposed").length} ` +
    `disputed=${claims.filter((c) => c.status === "disputed").length} ` +
    `retracted=${claims.filter((c) => c.status === "retracted").length} ` +
    `superseded=${claims.filter((c) => c.status === "superseded").length} ` +
    `derived=${claims.filter((c) => c.status === "derived").length}`
);
