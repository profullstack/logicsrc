import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  findPrd,
  loadPrdCollection,
  nextPrdNumber,
  nextStatuses,
  prdToTasks,
  renderDocument,
  renderIndex,
  renderReport,
  summarize,
  validatePrdCollection,
  validateTasks,
  type PrdCollection
} from "@logicsrc/openprd";

/**
 * OpenPRD surface for the MCP server.
 *
 * Everything here is read-only. Creating or moving a PRD writes to a repo, and
 * that belongs to the CLI where a human sees the diff — not to a tool an agent
 * can call unattended.
 */

const SPEC = `# OpenPRD

A lightweight standard for product requirements documents. A repo keeps a
numbered, committed collection under prd/, one Markdown file each.

- One file per PRD: prd/<id>-<slug>.md, four-digit ids, no gaps, 0000 reserved
  for the template.
- Front-matter carries openprd, id, title, status, authors, and optional repo,
  dates, discussion, implementation, tags, supersedes, superseded-by.
- The body has eight required sections in order: Problem, Goals, Non-Goals,
  Users, Requirements, UX Notes, Success Metrics, Risks & Open Questions.
- Requirements are numbered R1, R2, … each tagged [P0], [P1], or [P2].
- Lifecycle: Draft → Review → Accepted → Final, or Rejected / Withdrawn /
  Superseded. Status lives in front-matter and is the source of truth.

Full specification: https://logicsrc.com/docs/openprd`;

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function openCollection(): { collection: PrdCollection | null; dir: string | null; error: string | null } {
  const dir = process.env.OPENPRD_DIR ?? "./prd";
  const path = resolve(dir);
  if (!existsSync(path)) {
    return { collection: null, dir: path, error: `${path} does not exist; set OPENPRD_DIR` };
  }
  try {
    return { collection: loadPrdCollection(path), dir: path, error: null };
  } catch (error) {
    return { collection: null, dir: path, error: (error as Error).message };
  }
}

export function registerOpenPrd(server: McpServer): void {
  server.registerResource(
    "openprd-spec",
    "logicsrc://openprd/spec",
    {
      title: "OpenPRD specification",
      description: "Numbered PRDs: layout, front-matter, the eight sections, and the lifecycle.",
      mimeType: "text/markdown"
    },
    async () => ({
      contents: [{ uri: "logicsrc://openprd/spec", mimeType: "text/markdown", text: SPEC }]
    })
  );

  server.registerResource(
    "openprd-index",
    "prd://index",
    {
      title: "PRD index",
      description: "The current collection index, generated from the PRDs on disk.",
      mimeType: "text/markdown"
    },
    async () => {
      const { collection, error } = openCollection();
      const text = collection ? renderIndex(collection) : `No PRD collection: ${error}`;
      return { contents: [{ uri: "prd://index", mimeType: "text/markdown", text }] };
    }
  );

  server.registerTool(
    "prd_list",
    {
      title: "List PRDs",
      description: "Lists the PRDs in the collection with id, title, status, tags, and requirement count.",
      inputSchema: { status: z.string().optional().describe("Comma-separated statuses to include.") },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ status }) => {
      const { collection, error } = openCollection();
      if (!collection) return errorResult(error ?? "no collection");
      const wanted = status?.split(",").map((value) => value.trim());
      const rows = collection.documents
        .map(summarize)
        .filter((row) => !wanted || wanted.includes(row.status));
      return textResult(JSON.stringify(rows, null, 2));
    }
  );

  server.registerTool(
    "prd_show",
    {
      title: "Show a PRD",
      description: "Shows one PRD's front-matter, sections, and parsed requirements.",
      inputSchema: {
        ref: z.string().describe("Id, number, slug, or filename."),
        format: z.enum(["text", "json", "markdown"]).optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ ref, format }) => {
      const { collection, error } = openCollection();
      if (!collection) return errorResult(error ?? "no collection");
      const doc = findPrd(collection, ref);
      if (!doc) return errorResult(`No PRD matching "${ref}"`);
      return textResult(renderDocument(doc, format ?? "text"));
    }
  );

  server.registerTool(
    "prd_validate",
    {
      title: "Validate the PRD collection",
      description:
        "Checks conformance — filename, front-matter, id match, the eight sections in order — plus collection rules.",
      inputSchema: { strict: z.boolean().optional() },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ strict }) => {
      const { collection, error } = openCollection();
      if (!collection) return errorResult(error ?? "no collection");
      const report = validatePrdCollection(collection, {
        strict: strict === true,
        expectedIndex: renderIndex(collection)
      });
      return textResult(renderReport(report, "markdown"));
    }
  );

  server.registerTool(
    "prd_next_id",
    {
      title: "Next free PRD id",
      description: "Returns the next four-digit id. Numbers are assigned at creation, never reserved.",
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      const { collection, error } = openCollection();
      if (!collection) return errorResult(error ?? "no collection");
      return textResult(nextPrdNumber(collection));
    }
  );

  server.registerTool(
    "prd_next_statuses",
    {
      title: "Allowed lifecycle moves",
      description: "Given a PRD, lists the statuses it may legally move to next.",
      inputSchema: { ref: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ ref }) => {
      const { collection, error } = openCollection();
      if (!collection) return errorResult(error ?? "no collection");
      const doc = findPrd(collection, ref);
      if (!doc) return errorResult(`No PRD matching "${ref}"`);
      const allowed = nextStatuses(doc.frontMatter.status);
      return textResult(
        JSON.stringify(
          {
            id: doc.frontMatter.id,
            status: doc.frontMatter.status,
            allowedNext: allowed,
            terminal: allowed.length === 0
          },
          null,
          2
        )
      );
    }
  );

  server.registerTool(
    "prd_tasks",
    {
      title: "Map requirements to LogicSRC tasks",
      description: "Turns each R# into one logicsrc.task document, validated before it is returned.",
      inputSchema: {
        ref: z.string(),
        priority: z.string().optional().describe("Comma-separated priorities, e.g. P0,P1"),
        creator: z.string().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ ref, priority, creator }) => {
      const { collection, error } = openCollection();
      if (!collection) return errorResult(error ?? "no collection");
      const doc = findPrd(collection, ref);
      if (!doc) return errorResult(`No PRD matching "${ref}"`);

      const priorities = priority?.split(",").map((value) => value.trim()) as
        | Array<"P0" | "P1" | "P2">
        | undefined;
      const { tasks, skipped } = prdToTasks(doc, { creator, priorities });
      const problems = validateTasks(tasks);
      if (problems.length > 0) {
        return errorResult(`Generated tasks failed validation: ${JSON.stringify(problems, null, 2)}`);
      }
      return textResult(JSON.stringify({ tasks, skipped }, null, 2));
    }
  );

  server.registerPrompt(
    "write_prd",
    { title: "Draft an OpenPRD document", description: "Draft a conforming PRD for a product decision." },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Draft an OpenPRD document for the change the user describes.

Front-matter: openprd "0.2", a four-digit id matching the filename, an imperative
title starting with a verb, status Draft, and at least one author.

Then all eight sections, in this order, none omitted:
Problem, Goals, Non-Goals, Users, Requirements, UX Notes, Success Metrics,
Risks & Open Questions. A section may be a single line such as _None._

Requirements are numbered R1, R2, … contiguously, each tagged [P0], [P1], or [P2],
one capability per line. Goals are outcomes, not features. Non-Goals bound the work.
Risks & Open Questions must name the decisions still owed rather than pretending
they are settled.`
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "review_prd",
    { title: "Review a PRD", description: "Review a PRD for shape, clarity, and honesty." },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Review this PRD.

Check the shape first: all eight sections present and in order, requirements numbered
contiguously with priority tags, front-matter complete.

Then the substance: are the Goals outcomes rather than features? Do the Non-Goals
actually bound the work? Is every P0 requirement testable? Do the Success Metrics
measure the Goals? Do the Risks name real decisions still owed, or is that section
decoration? Say what you would change and why.`
          }
        }
      ]
    })
  );
}
