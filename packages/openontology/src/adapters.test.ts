import { describe, expect, it } from "vitest";
import {
  csvAdapter,
  githubAdapter,
  httpApiAdapter,
  jsonAdapter,
  listAdapters,
  markdownAdapter,
  ndjsonAdapter,
  parseCsv,
  yamlAdapter,
  type FetchLike,
  type IngestContext
} from "./adapters.js";
import { createOntologyEngine } from "./engine.js";
import { loadPrdFixturePackage } from "./test-helpers.js";
import { proposerActor } from "./policy.js";

const ctx: IngestContext = {
  prefix: "test",
  actor: "agent:importer",
  runId: "run_import_1",
  now: "2026-07-26T00:00:00Z",
  confidence: 0.6,
  license: "CC-BY-4.0"
};

const MAPPING = {
  entityType: "Person",
  idField: "handle",
  nameField: "name",
  idSegment: "person",
  aliasField: "aliases",
  externalIds: { github: "github" },
  properties: { role: "role" },
  relationships: { worksOn: { field: "projects", targetSegment: "project" } }
};

describe("adapter capabilities", () => {
  it("declares what every adapter can and cannot do (R118)", () => {
    const adapters = listAdapters();
    expect(adapters.map((a) => a.id).sort()).toEqual([
      "csv",
      "github",
      "http-api",
      "json",
      "markdown",
      "ndjson",
      "yaml"
    ]);
    for (const adapter of adapters) {
      expect(adapter.capabilities).toHaveProperty("publicData");
      expect(adapter.capabilities).toHaveProperty("deletions");
    }
    // None of the shipped adapters can see upstream deletions — say so.
    expect(adapters.every((a) => a.capabilities.deletions === false)).toBe(true);
  });
});

describe("CSV", () => {
  const csv = `handle,name,role,github,projects
alice,Alice Reyes,Protocol engineer,areyes,"zk-prover,ledger-indexer"
bob,Bob Nakamura,Indexer lead,bnak,ledger-indexer
`;

  it("parses quoted fields and embedded separators", () => {
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.projects).toBe("zk-prover,ledger-indexer");
  });

  it("handles escaped quotes", () => {
    const rows = parseCsv('a,b\n"say ""hi""",2\n');
    expect(rows[0]!.a).toBe('say "hi"');
  });

  it("maps rows to entities and claims", () => {
    const result = csvAdapter.ingest({ uri: "https://example.org/people.csv", content: csv, mapping: MAPPING }, ctx);
    expect(result.entities.map((e) => e.id)).toEqual(["test:person:alice", "test:person:bob"]);
    expect(result.entities[0]!.externalIds).toEqual({ github: "areyes" });

    const worksOn = result.claims.filter((c) => c.predicate === "worksOn");
    expect(worksOn).toHaveLength(3);
    expect(worksOn[0]!.object).toEqual({ entity: "test:project:zk-prover" });
  });

  it("proposes rather than asserts, and records the run (R113/R114)", () => {
    const result = csvAdapter.ingest({ uri: "https://example.org/people.csv", content: csv, mapping: MAPPING }, ctx);
    expect(result.claims.every((c) => c.status === "proposed")).toBe(true);
    expect(result.claims.every((c) => c.runId === "run_import_1")).toBe(true);
    expect(result.claims.every((c) => c.confidence === 0.6)).toBe(true);
  });

  it("attaches source and evidence with a line selector", () => {
    const result = csvAdapter.ingest({ uri: "https://example.org/people.csv", content: csv, mapping: MAPPING }, ctx);
    expect(result.sources[0]!.contentHash).toMatch(/^sha256:/);
    expect(result.sources[0]!.license).toBe("CC-BY-4.0");
    expect(result.evidence[0]!.selector).toEqual({ type: "line-range", start: 2, end: 2 });
    expect(result.claims[0]!.sources).toEqual([result.sources[0]!.id]);
  });

  it("skips a row with no id and says so", () => {
    const result = csvAdapter.ingest(
      { uri: "x.csv", content: "handle,name\n,Nobody\nalice,Alice\n", mapping: MAPPING },
      ctx
    );
    expect(result.entities).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/no handle/);
  });
});

describe("JSON, YAML, NDJSON", () => {
  const records = [{ handle: "alice", name: "Alice Reyes" }];

  it("reads a JSON array", () => {
    const result = jsonAdapter.ingest(
      { uri: "x.json", content: JSON.stringify(records), mapping: MAPPING },
      ctx
    );
    expect(result.entities[0]!.canonicalName).toBe("Alice Reyes");
  });

  it("finds the array inside a wrapper object", () => {
    const result = jsonAdapter.ingest(
      { uri: "x.json", content: JSON.stringify({ data: records }), mapping: MAPPING },
      ctx
    );
    expect(result.entities).toHaveLength(1);
  });

  it("reads a YAML sequence", () => {
    const result = yamlAdapter.ingest(
      { uri: "x.yaml", content: "- handle: alice\n  name: Alice Reyes\n", mapping: MAPPING },
      ctx
    );
    expect(result.entities[0]!.id).toBe("test:person:alice");
  });

  it("reports a bad NDJSON line instead of aborting the file", () => {
    const result = ndjsonAdapter.ingest(
      { uri: "x.ndjson", content: `${JSON.stringify(records[0])}\nnot json\n`, mapping: MAPPING },
      ctx
    );
    expect(result.entities).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/line 2 is not valid JSON/);
  });
});

describe("Markdown", () => {
  const md = `# Title

## ZK Prover

See [the repo](https://example.org/zk) and [docs](https://example.org/docs).

## Ledger Indexer

No links here.
`;

  it("turns headings into entities and links into claims", () => {
    const result = markdownAdapter.ingest({ uri: "x.md", content: md, entityType: "Project" }, ctx);
    expect(result.entities.map((e) => e.canonicalName)).toEqual(["ZK Prover", "Ledger Indexer"]);
    expect(result.claims).toHaveLength(2);
    expect(result.claims[0]!.object).toEqual({ value: "https://example.org/zk" });
  });

  it("warns when the document has no headings at the requested level", () => {
    const result = markdownAdapter.ingest({ uri: "x.md", content: "just prose\n", entityType: "Project" }, ctx);
    expect(result.warnings[0]).toMatch(/no level-2 headings/);
  });
});

describe("HTTP and GitHub", () => {
  const fetchOk = (bodies: Record<string, unknown>): FetchLike =>
    async (url) => {
      const key = Object.keys(bodies).find((k) => url.includes(k));
      if (!key) return { ok: false, status: 404, text: async () => "{}" };
      return { ok: true, status: 200, text: async () => JSON.stringify(bodies[key]) };
    };

  it("reads a JSON endpoint through an injected fetch", async () => {
    const result = await httpApiAdapter.ingest(
      {
        url: "https://example.org/api/people",
        mapping: MAPPING,
        path: "items",
        fetch: fetchOk({ "/api/people": { items: [{ handle: "alice", name: "Alice Reyes" }] } })
      },
      ctx
    );
    expect(result.entities[0]!.id).toBe("test:person:alice");
    expect(result.evidence[0]!.selector).toMatchObject({ type: "api-field" });
  });

  it("throws on a non-OK response rather than proposing nothing silently", async () => {
    const fetchFail: FetchLike = async () => ({ ok: false, status: 503, text: async () => "" });
    await expect(
      httpApiAdapter.ingest({ url: "https://example.org/x", mapping: MAPPING, fetch: fetchFail }, ctx)
    ).rejects.toThrow(/HTTP 503/);
  });

  it("maps a GitHub repo and its contributors", async () => {
    const result = await githubAdapter.ingest(
      {
        repo: "example/zk-prover",
        fetch: fetchOk({
          "/repos/example/zk-prover/contributors": [{ login: "areyes", contributions: 42 }],
          "/repos/example/zk-prover": {
            full_name: "example/zk-prover",
            name: "zk-prover",
            language: "Rust",
            license: { spdx_id: "Apache-2.0" },
            html_url: "https://example.org/zk-prover"
          }
        })
      },
      ctx
    );

    expect(result.entities.map((e) => e.type)).toEqual(["Codebase", "Person"]);
    expect(result.sources[0]!.license).toBe("Apache-2.0");
    expect(result.claims.find((c) => c.predicate === "language")?.object).toEqual({ value: "Rust" });
    expect(result.claims.find((c) => c.predicate === "contributesTo")?.object).toEqual({
      entity: "test:code:zk-prover"
    });
  });

  it("warns when a repository declares no licence", async () => {
    const result = await githubAdapter.ingest(
      {
        repo: "example/unlicensed",
        fetch: fetchOk({
          "/repos/example/unlicensed/contributors": [],
          "/repos/example/unlicensed": { name: "unlicensed", full_name: "example/unlicensed" }
        })
      },
      ctx
    );
    expect(result.warnings.some((w) => /no SPDX licence/.test(w))).toBe(true);
    expect(result.sources[0]!.license).toBe("CC-BY-4.0");
  });
});

describe("ingestion feeds the governed path", () => {
  it("produces operations a proposer agent can turn into a change set", () => {
    const engine = createOntologyEngine({
      package: loadPrdFixturePackage(),
      actor: proposerActor("agent:importer"),
      clock: () => ctx.now
    });

    const result = csvAdapter.ingest(
      {
        uri: "https://example.org/people.csv",
        content: "handle,name\ndave,Dave Okonkwo\n",
        mapping: { entityType: "Person", idField: "handle", nameField: "name", idSegment: "person" }
      },
      ctx
    );

    const changeSet = engine.createOntologyChangeSet({
      title: "Import people.csv",
      operations: result.operations,
      runId: ctx.runId
    });

    expect(changeSet.status).toBe("proposed");
    // An imported entity does not exist until a human applies the change set.
    expect(() => engine.getEntity("test:person:dave")).toThrow(/Unknown entity/);
  });
});
