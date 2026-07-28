import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createOntologyEngine,
  exportJsonLd,
  exportTurtle,
  constraintsToShacl,
  loadOntologyPackage,
  readOnlyActor,
  proposerActor,
  renderReport,
  type OntologyEngine
} from "@logicsrc/openontology";

/**
 * OpenOntology surface for the MCP server.
 *
 * Read tools are always available. Write tools exist but are capability-scoped
 * and default to *proposal* behaviour (R158): the server runs as a read-only
 * actor unless OPENONTOLOGY_MCP_WRITABLE is set, and even then an agent actor
 * can only propose — applying is denied by the policy layer, not by this file.
 */

const SPEC = `# LogicSRC OpenOntology

An open contract for durable, source-backed domain knowledge shared by humans
and AI agents. Five nouns: Type, Entity, Claim, Source, Change set.

- Claims are the canonical fact record and are append-only. A correction is a
  dispute, retraction, or supersession — never an edit.
- Every claim carries status, confidence, valid time, recorded time, and the
  sources it rests on. Confidence is metadata, never permission.
- Queries use a portable triple-pattern AST with asOf and per-status filtering,
  and every answer can be traced to the claims, evidence, and sources behind it.
- Agents propose; humans apply. An agent holding every scope still cannot apply.

Full specification: https://logicsrc.com/docs/openontology`;

interface OntologyContext {
  engine: OntologyEngine | null;
  packageDir: string | null;
  error: string | null;
  writable: boolean;
}

function loadContext(): OntologyContext {
  const dir = process.env.OPENONTOLOGY_PACKAGE ?? null;
  const writable = process.env.OPENONTOLOGY_MCP_WRITABLE === "1";

  if (!dir) {
    return { engine: null, packageDir: null, writable, error: "OPENONTOLOGY_PACKAGE is not set" };
  }
  const path = resolve(dir);
  if (!existsSync(path)) {
    return { engine: null, packageDir: path, writable, error: `${path} does not exist` };
  }

  try {
    const pkg = loadOntologyPackage(path);
    const actor = writable ? proposerActor("agent:mcp") : readOnlyActor("agent:mcp");
    return {
      engine: createOntologyEngine({ package: pkg, actor, client: "logicsrc-mcp" }),
      packageDir: path,
      writable,
      error: null
    };
  } catch (error) {
    return { engine: null, packageDir: path, writable, error: (error as Error).message };
  }
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

export function registerOpenOntology(server: McpServer): void {
  const context = loadContext();

  const requireEngine = (): OntologyEngine | null => context.engine;

  const notConfigured = () =>
    errorResult(
      `No ontology package is loaded: ${context.error ?? "unknown reason"}. ` +
        "Set OPENONTOLOGY_PACKAGE to a directory containing openontology.yaml."
    );

  /* ── resources ─────────────────────────────────────────────────────── */

  server.registerResource(
    "openontology-spec",
    "logicsrc://openontology/spec",
    {
      title: "LogicSRC OpenOntology specification",
      description: "The OpenOntology model in brief: five nouns, claims, provenance, governance.",
      mimeType: "text/markdown"
    },
    async () => ({
      contents: [{ uri: "logicsrc://openontology/spec", mimeType: "text/markdown", text: SPEC }]
    })
  );

  if (context.engine) {
    const engine = context.engine;
    const manifest = engine.getOntologyManifest();

    server.registerResource(
      "openontology-manifest",
      `ontology://${manifest.id}/manifest`,
      {
        title: `${manifest.name} manifest`,
        description: "Package identity, namespace, licence, and maintainers.",
        mimeType: "application/json"
      },
      async () => ({
        contents: [
          {
            uri: `ontology://${manifest.id}/manifest`,
            mimeType: "application/json",
            text: JSON.stringify(manifest, null, 2)
          }
        ]
      })
    );

    server.registerResource(
      "openontology-schema",
      `ontology://${manifest.id}/schema`,
      {
        title: `${manifest.name} schema`,
        description: "Entity types, properties, relationship types, constraints, and saved queries.",
        mimeType: "application/json"
      },
      async () => ({
        contents: [
          {
            uri: `ontology://${manifest.id}/schema`,
            mimeType: "application/json",
            text: JSON.stringify(engine.getOntologySchema(), null, 2)
          }
        ]
      })
    );

    server.registerResource(
      "openontology-queries",
      `ontology://${manifest.id}/queries`,
      {
        title: `${manifest.name} saved queries`,
        description: "The questions this ontology already knows how to answer.",
        mimeType: "application/json"
      },
      async () => ({
        contents: [
          {
            uri: `ontology://${manifest.id}/queries`,
            mimeType: "application/json",
            text: JSON.stringify(engine.getOntologySchema().queries, null, 2)
          }
        ]
      })
    );
  }

  /* ── read tools ────────────────────────────────────────────────────── */

  server.registerTool(
    "ontology_status",
    {
      title: "OpenOntology status",
      description: "Reports which ontology package this server has loaded and whether writes are enabled.",
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () =>
      textResult(
        JSON.stringify(
          {
            loaded: Boolean(context.engine),
            packageDir: context.packageDir,
            error: context.error,
            writable: context.writable,
            note: "Write tools propose change sets; applying is denied to agent actors by policy."
          },
          null,
          2
        )
      )
  );

  server.registerTool(
    "ontology_validate",
    {
      title: "Validate the loaded ontology package",
      description: "Runs schema, graph, provenance, policy, and constraint validation.",
      inputSchema: { strict: z.boolean().optional().describe("Treat unknown types and predicates as errors.") },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ strict }) => {
      const engine = requireEngine();
      if (!engine) return notConfigured();
      const report = engine.validateOntologyPackage({ strict: strict === true });
      return textResult(renderReport(report, "markdown"));
    }
  );

  server.registerTool(
    "ontology_get_entity",
    {
      title: "Get an entity",
      description: "Fetches one entity by id, following merge redirects.",
      inputSchema: { id: z.string().describe("Entity id, e.g. eth:person:avery-lindqvist") },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ id }) => {
      const engine = requireEngine();
      if (!engine) return notConfigured();
      try {
        return textResult(JSON.stringify(engine.getEntity(id), null, 2));
      } catch (error) {
        return errorResult((error as Error).message);
      }
    }
  );

  server.registerTool(
    "ontology_find_entities",
    {
      title: "Find entities",
      description: "Ranked candidate matches with the evidence for each — never a silent single match.",
      inputSchema: {
        text: z.string().optional(),
        type: z.string().optional(),
        limit: z.number().int().positive().max(100).optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ text, type, limit }) => {
      const engine = requireEngine();
      if (!engine) return notConfigured();
      const matches = engine.findEntities({ text, type, limit });
      return textResult(
        JSON.stringify(
          matches.map((match) => ({
            id: match.entity.id,
            name: match.entity.canonicalName,
            type: match.entity.type,
            score: match.score,
            matchedOn: match.matchedOn,
            evidence: match.evidence
          })),
          null,
          2
        )
      );
    }
  );

  server.registerTool(
    "ontology_query",
    {
      title: "Run a portable query",
      description:
        "Runs a saved query by id, or an ad-hoc triple-pattern query. Results include the claim ids behind each row.",
      inputSchema: {
        savedQuery: z.string().optional().describe("Saved query id."),
        query: z.string().optional().describe("JSON query body with match/where/select/include."),
        asOf: z.string().optional().describe("ISO instant to evaluate domain valid time against."),
        limit: z.number().int().positive().max(500).optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ savedQuery, query, asOf, limit }) => {
      const engine = requireEngine();
      if (!engine) return notConfigured();
      if (!savedQuery && !query) return errorResult("Provide savedQuery or query.");

      try {
        const body = savedQuery
          ? savedQuery
          : ({ ...(JSON.parse(query as string) as Record<string, unknown>) } as never);
        const result = engine.queryOntology(body as never);
        const rows = result.rows.slice(0, limit ?? 50);
        const manifest = engine.getOntologyManifest();

        // R160: factual answers carry the ontology version and claim ids.
        return textResult(
          JSON.stringify(
            {
              ontology: `${manifest.id}@${manifest.version}`,
              resultId: result.id,
              columns: result.columns,
              claimStatus: result.explanation.claimStatus,
              asOf: asOf ?? result.explanation.asOf ?? null,
              rows: rows.map((row) => ({ ...row.bindings, claims: row.claims })),
              truncated: result.explanation.truncated || rows.length < result.rows.length
            },
            null,
            2
          )
        );
      } catch (error) {
        return errorResult((error as Error).message);
      }
    }
  );

  server.registerTool(
    "ontology_explain",
    {
      title: "Explain an answer",
      description: "Traces one result row to its claims, evidence, sources, and status history.",
      inputSchema: {
        resultId: z.string().describe("resultId returned by ontology_query."),
        row: z.number().int().nonnegative().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ resultId, row }) => {
      const engine = requireEngine();
      if (!engine) return notConfigured();
      try {
        return textResult(JSON.stringify(engine.explainOntologyResult(resultId, row ?? 0), null, 2));
      } catch (error) {
        return errorResult((error as Error).message);
      }
    }
  );

  server.registerTool(
    "ontology_export",
    {
      title: "Export the ontology",
      description: "Exports as JSON-LD, RDF/Turtle, or SHACL shapes, reporting anything the format cannot carry.",
      inputSchema: { format: z.enum(["jsonld", "turtle", "shacl"]) },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ format }) => {
      const engine = requireEngine();
      if (!engine) return notConfigured();
      const pkg = engine.buildOntologyPackage();

      if (format === "turtle") {
        const exported = exportTurtle(pkg);
        return textResult(
          `${exported.turtle}\n# lossy: ${exported.lossy.length} object(s) carry fields Turtle cannot express`
        );
      }
      if (format === "shacl") {
        const exported = constraintsToShacl(pkg);
        return textResult(exported.turtle);
      }
      const exported = exportJsonLd(pkg);
      return textResult(
        JSON.stringify({ document: exported.document, lossy: exported.lossy }, null, 2)
      );
    }
  );

  /* ── write tools (proposal-only) ───────────────────────────────────── */

  server.registerTool(
    "ontology_propose_claim",
    {
      title: "Propose a claim",
      description:
        "Creates a PROPOSED change set asserting one claim. Never applies it — a human with write scope does that.",
      inputSchema: {
        subject: z.string(),
        predicate: z.string(),
        objectEntity: z.string().optional(),
        objectValue: z.string().optional(),
        source: z.string().optional().describe("Source id backing the claim."),
        confidence: z.number().min(0).max(1).optional(),
        runId: z.string().optional(),
        rationale: z.string().optional()
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
    },
    async (input) => {
      const engine = requireEngine();
      if (!engine) return notConfigured();
      if (!input.objectEntity && input.objectValue === undefined) {
        return errorResult("Provide objectEntity or objectValue.");
      }

      try {
        const changeSet = engine.createOntologyChangeSet({
          title: `${input.subject} ${input.predicate} ${input.objectEntity ?? input.objectValue}`,
          rationale: input.rationale,
          runId: input.runId,
          operations: [
            {
              op: "assert-claim",
              value: {
                subject: input.subject,
                predicate: input.predicate,
                object: input.objectEntity ? { entity: input.objectEntity } : { value: input.objectValue },
                ...(input.source ? { sources: [input.source] } : {}),
                ...(input.confidence !== undefined ? { confidence: input.confidence } : {})
              }
            }
          ]
        });
        return textResult(
          JSON.stringify(
            { changeSet: changeSet.id, status: changeSet.status, requiredApprovals: changeSet.requiredApprovals },
            null,
            2
          )
        );
      } catch (error) {
        return errorResult((error as Error).message);
      }
    }
  );

  server.registerTool(
    "ontology_create_changeset",
    {
      title: "Create a change set",
      description: "Creates a PROPOSED change set from a JSON array of operations.",
      inputSchema: {
        title: z.string(),
        operations: z.string().describe("JSON array of change-set operations."),
        rationale: z.string().optional(),
        runId: z.string().optional()
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
    },
    async ({ title, operations, rationale, runId }) => {
      const engine = requireEngine();
      if (!engine) return notConfigured();
      try {
        const parsed = JSON.parse(operations) as never[];
        const changeSet = engine.createOntologyChangeSet({ title, rationale, runId, operations: parsed });
        const diff = engine.diffOntologyChangeSet(changeSet.id);
        return textResult(JSON.stringify({ changeSet: changeSet.id, status: changeSet.status, diff }, null, 2));
      } catch (error) {
        return errorResult((error as Error).message);
      }
    }
  );

  server.registerTool(
    "ontology_validate_changeset",
    {
      title: "Validate a change set",
      description: "Validates the package as it would look after a change set applies.",
      inputSchema: { changeSet: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ changeSet }) => {
      const engine = requireEngine();
      if (!engine) return notConfigured();
      try {
        return textResult(renderReport(engine.validateOntologyChangeSet(changeSet), "markdown"));
      } catch (error) {
        return errorResult((error as Error).message);
      }
    }
  );

  server.registerTool(
    "ontology_apply_changeset",
    {
      title: "Apply a change set",
      description:
        "Applies an approved change set. Requires write scope and approvals; agent actors are denied by policy.",
      inputSchema: { changeSet: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    async ({ changeSet }) => {
      const engine = requireEngine();
      if (!engine) return notConfigured();
      try {
        const applied = engine.applyOntologyChangeSet(changeSet);
        return textResult(
          JSON.stringify({ changeSet: applied.changeSet.id, revision: applied.revision }, null, 2)
        );
      } catch (error) {
        // The denial is the point: surface it verbatim.
        return errorResult(`Not applied: ${(error as Error).message}`);
      }
    }
  );

  /* ── prompts ───────────────────────────────────────────────────────── */

  const prompts: Array<[string, string, string]> = [
    [
      "design_ontology",
      "Design an OpenOntology package for a domain",
      `Design a LogicSRC OpenOntology package for the domain the user describes.

Produce entity types, properties, and relationship types first — nouns before facts.
For each relationship type declare from/to, cardinality, and whether it is temporal.
Do not infer transitivity, symmetry, or inverses unless you declare them.
Then propose 3-5 saved queries that answer the questions people actually ask.
Return YAML matching the OpenOntology schemas.`
    ],
    [
      "map_sources_to_claims",
      "Turn source material into proposed claims",
      `Read the source material and produce PROPOSED claims.

Every claim needs: subject, predicate, a typed object, a source id, and an evidence
selector pointing at the exact location it came from. Set confidence honestly — it is
metadata, not persuasion. Never invent an entity id you have not seen; propose a new
entity explicitly instead. Output change-set operations, not applied state.`
    ],
    [
      "resolve_entities",
      "Decide whether two entity records are the same thing",
      `Compare the candidate entity records.

List the evidence for and against them being the same thing. Weigh stable external ids
above name similarity. Recommend merge, keep-separate, or needs-more-evidence — and say
which. Remember that merging two different people is worse than keeping duplicates, and
that a merge needs curator approval.`
    ],
    [
      "review_ontology_changeset",
      "Review a proposed change set",
      `Review this OpenOntology change set as a curator.

Check: does each claim cite a source? Do the domain and range hold? Is the confidence
justified by the evidence? Does any add-entity duplicate something already present?
Are merges and retractions reversible and justified? Report per-operation accept/reject
with reasons, then an overall recommendation.`
    ],
    [
      "explain_ontology_answer",
      "Explain why the ontology returned an answer",
      `Explain this query result to someone who does not trust it yet.

Walk from the answer to the claims that produced it, then to the evidence and sources.
State the claim statuses included, the asOf time, and any filters applied. Name what is
uncertain — low confidence, a single source, a stale source, a dispute — rather than
presenting the row as settled fact.`
    ]
  ];

  for (const [name, title, text] of prompts) {
    server.registerPrompt(
      name,
      { title, description: title },
      async () => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] })
    );
  }
}

/** Read the packaged spec doc when it is available on disk. */
export function readSpecDoc(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
}
