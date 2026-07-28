import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { initOntologyPackage } from "@logicsrc/openontology";
import { createLogicSrcMcpServer } from "./server.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dirs: string[] = [];

let ontologyDir: string;

beforeAll(() => {
  ontologyDir = mkdtempSync(join(tmpdir(), "mcp-ontology-"));
  dirs.push(ontologyDir);
  initOntologyPackage(ontologyDir, { id: "test-ecosystem", now: "2026-07-26T00:00:00Z" });
  process.env.OPENONTOLOGY_PACKAGE = ontologyDir;
  process.env.OPENPRD_DIR = join(REPO, "prd");
});

afterAll(() => {
  delete process.env.OPENONTOLOGY_PACKAGE;
  delete process.env.OPENPRD_DIR;
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createLogicSrcMcpServer();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function toolText(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content.map((entry) => entry.text ?? "").join("\n");
}

/** Resource contents are text-or-blob in the SDK types; these fixtures are text. */
function resourceText(contents: unknown): string {
  const entry = (contents as Array<{ text?: string }>)[0];
  return entry?.text ?? "";
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

describe("MCP: OpenOntology", () => {
  it("exposes the spec, manifest, schema, and saved queries as resources", async () => {
    const client = await connect();
    const uris = (await client.listResources()).resources.map((resource) => resource.uri);
    expect(uris).toContain("logicsrc://openontology/spec");
    expect(uris).toContain("ontology://test-ecosystem/manifest");
    expect(uris).toContain("ontology://test-ecosystem/schema");
    expect(uris).toContain("ontology://test-ecosystem/queries");
  });

  it("serves the ontology schema resource", async () => {
    const client = await connect();
    const resource = await client.readResource({ uri: "ontology://test-ecosystem/schema" });
    expect(resourceText(resource.contents)).toContain("worksOn");
  });

  it("runs a query and returns claim ids with the ontology version (R160)", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "ontology_query", arguments: { savedQuery: "contributors" } });
    const payload = JSON.parse(toolText(result)) as {
      ontology: string;
      rows: Array<{ claims: string[] }>;
      resultId: string;
    };
    expect(payload.ontology).toBe("test-ecosystem@0.1.0");
    expect(payload.rows.length).toBeGreaterThan(0);
    expect(payload.rows[0]!.claims.length).toBeGreaterThan(0);
  });

  it("explains a result down to sources", async () => {
    const client = await connect();
    const query = await client.callTool({ name: "ontology_query", arguments: { savedQuery: "contributors" } });
    const { resultId } = JSON.parse(toolText(query)) as { resultId: string };

    const explained = await client.callTool({
      name: "ontology_explain",
      arguments: { resultId, row: 0 }
    });
    const payload = JSON.parse(toolText(explained)) as { claims: Array<{ sources: unknown[] }> };
    expect(payload.claims[0]!.sources.length).toBeGreaterThan(0);
  });

  it("validates the loaded package", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "ontology_validate", arguments: { strict: true } });
    expect(toolText(result)).toContain("Validation passed");
  });

  it("finds entities with ranked evidence rather than a silent match", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "ontology_find_entities", arguments: { text: "Alice" } });
    const matches = JSON.parse(toolText(result)) as Array<{ id: string; matchedOn: string; score: number }>;
    expect(matches[0]!.id).toBe("test:person:alice");
    expect(matches[0]!.matchedOn).toBeTruthy();
  });

  it("refuses to propose when the server is read-only (the default)", async () => {
    const client = await connect();
    const denied = await client.callTool({
      name: "ontology_propose_claim",
      arguments: {
        subject: "test:person:alice",
        predicate: "worksOn",
        objectEntity: "test:project:docs-portal",
        source: "test:source:repo"
      }
    });
    expect(isError(denied)).toBe(true);
    expect(toolText(denied)).toContain("ontology:claim:propose");
  });

  it("proposes a change set when writes are enabled — and still cannot apply it", async () => {
    process.env.OPENONTOLOGY_MCP_WRITABLE = "1";
    try {
      const client = await connect();
      const proposed = await client.callTool({
        name: "ontology_propose_claim",
        arguments: {
          subject: "test:person:alice",
          predicate: "worksOn",
          objectEntity: "test:project:docs-portal",
          source: "test:source:repo",
          runId: "run_mcp_1"
        }
      });
      const payload = JSON.parse(toolText(proposed)) as { changeSet: string; status: string };
      expect(payload.status).toBe("proposed");

      // Enabling writes buys proposals, not applies: the actor is an agent.
      const applied = await client.callTool({
        name: "ontology_apply_changeset",
        arguments: { changeSet: payload.changeSet }
      });
      expect(isError(applied)).toBe(true);
      expect(toolText(applied)).toMatch(/never apply directly/);
    } finally {
      delete process.env.OPENONTOLOGY_MCP_WRITABLE;
    }
  });

  it("exports Turtle and SHACL", async () => {
    const client = await connect();
    const turtle = await client.callTool({ name: "ontology_export", arguments: { format: "turtle" } });
    expect(toolText(turtle)).toContain("@prefix oo:");

    const shacl = await client.callTool({ name: "ontology_export", arguments: { format: "shacl" } });
    expect(toolText(shacl)).toContain("sh:NodeShape");
  });

  it("registers the ontology prompts", async () => {
    const client = await connect();
    const names = (await client.listPrompts()).prompts.map((prompt) => prompt.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "design_ontology",
        "map_sources_to_claims",
        "resolve_entities",
        "review_ontology_changeset",
        "explain_ontology_answer"
      ])
    );
  });
});

describe("MCP: OpenPRD", () => {
  it("exposes the spec and the generated index", async () => {
    const client = await connect();
    const uris = (await client.listResources()).resources.map((resource) => resource.uri);
    expect(uris).toContain("logicsrc://openprd/spec");
    expect(uris).toContain("prd://index");

    const index = await client.readResource({ uri: "prd://index" });
    expect(resourceText(index.contents)).toContain("| ID | Title | Status | Tags |");
  });

  it("lists this repo's PRDs", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "prd_list", arguments: {} });
    const rows = JSON.parse(toolText(result)) as Array<{ id: string; title: string; requirements: number }>;
    expect(rows[0]!.id).toBe("0001");
    expect(rows[0]!.requirements).toBe(210);
  });

  it("validates the collection", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "prd_validate", arguments: {} });
    expect(toolText(result)).toContain("validation passed");
  });

  it("reports the next free id and the allowed lifecycle moves", async () => {
    const client = await connect();
    // Asserted against the live prd/ directory, so this advances with every PRD added.
    expect(toolText(await client.callTool({ name: "prd_next_id", arguments: {} }))).toBe("0003");

    const moves = await client.callTool({ name: "prd_next_statuses", arguments: { ref: "0001" } });
    const payload = JSON.parse(toolText(moves)) as { status: string; allowedNext: string[] };
    expect(payload.status).toBe("Draft");
    expect(payload.allowedNext).toEqual(["Review", "Withdrawn"]);
  });

  it("maps requirements to validated tasks", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "prd_tasks", arguments: { ref: "0001", priority: "P0" } });
    const payload = JSON.parse(toolText(result)) as { tasks: Array<{ type: string }> };
    expect(payload.tasks.length).toBeGreaterThan(100);
    expect(payload.tasks[0]!.type).toBe("logicsrc.task");
  });

  it("registers the PRD prompts", async () => {
    const client = await connect();
    const names = (await client.listPrompts()).prompts.map((prompt) => prompt.name);
    expect(names).toEqual(expect.arrayContaining(["write_prd", "review_prd"]));
  });
});
