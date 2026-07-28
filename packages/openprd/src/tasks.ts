import { validate as validateSchema } from "@logicsrc/validators";
import type { PrdDocument, Priority, Requirement } from "./types.js";

/**
 * The optional LogicSRC bridge described in docs/openprd.md:
 *
 *   "a PRD's Requirements map cleanly onto LogicSRC task documents
 *    (each R# → one task), and owner/repo reuse LogicSRC identity and repo
 *    conventions. That bridge is optional and lives in tooling."
 *
 * So it lives here, in tooling — the standard itself stays a file format with
 * no service behind it.
 */

export interface TaskDocument {
  type: "logicsrc.task";
  version: string;
  title: string;
  description: string;
  board: string;
  creator_did: string;
  status: string;
  skills?: string[];
  github_repo?: string;
  external_links?: string[];
  logicsrc_version?: string;
}

export interface ToTasksOptions {
  /** LogicSRC DID. Derived from the first author when omitted. */
  creator?: string;
  /** Board path. Defaults to `/prd/<id>`. */
  board?: string;
  status?: string;
  /** Only convert requirements at these priorities. */
  priorities?: Priority[];
}

export interface ToTasksResult {
  tasks: TaskDocument[];
  skipped: Array<{ requirement: string; reason: string }>;
}

/**
 * LogicSRC DIDs look like `name.namespace`. An author email maps onto that
 * shape predictably: `anthony@profullstack.com` → `anthony.profullstack`.
 */
export function deriveCreatorDid(author: string | undefined): string {
  if (!author) return "openprd.local";

  const trimmed = author.trim();
  if (/^[a-z0-9][a-z0-9._-]*\.[a-z0-9][a-z0-9._-]*$/.test(trimmed) && !trimmed.includes("@")) {
    return trimmed;
  }

  const at = trimmed.indexOf("@");
  if (at > 0) {
    const local = sanitize(trimmed.slice(0, at));
    const domain = trimmed.slice(at + 1);
    const org = sanitize(domain.split(".")[0] ?? "local");
    if (local && org) return `${local}.${org}`;
  }

  const fallback = sanitize(trimmed);
  return fallback ? `${fallback}.local` : "openprd.local";
}

function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "");
}

export function prdToTasks(doc: PrdDocument, options: ToTasksOptions = {}): ToTasksResult {
  const fm = doc.frontMatter;
  const id = fm.id ?? doc.filePrefix ?? "0000";
  const creator = options.creator ?? deriveCreatorDid(fm.owner ?? fm.authors?.[0]);
  const board = options.board ?? `/prd/${id}`;

  const tasks: TaskDocument[] = [];
  const skipped: ToTasksResult["skipped"] = [];

  for (const requirement of doc.requirements) {
    if (options.priorities && (!requirement.priority || !options.priorities.includes(requirement.priority))) {
      skipped.push({
        requirement: requirement.id,
        reason: `priority ${requirement.priority ?? "none"} not in the requested set`
      });
      continue;
    }
    if (!requirement.text) {
      skipped.push({ requirement: requirement.id, reason: "requirement has no text" });
      continue;
    }

    tasks.push(toTask(doc, requirement, { creator, board, status: options.status ?? "draft", id }));
  }

  return { tasks, skipped };
}

function toTask(
  doc: PrdDocument,
  requirement: Requirement,
  ctx: { creator: string; board: string; status: string; id: string }
): TaskDocument {
  const fm = doc.frontMatter;
  const plain = stripMarkdown(requirement.text);
  const prefix = `${ctx.id} ${requirement.id}`;
  const title = truncate(`${prefix}: ${plain}`, 160);

  const task: TaskDocument = {
    type: "logicsrc.task",
    version: "0.1",
    title,
    description: `${plain}\n\nFrom OpenPRD ${ctx.id} "${fm.title}" (${doc.file}, line ${requirement.line}).`,
    board: ctx.board,
    creator_did: ctx.creator,
    status: ctx.status
  };

  if (requirement.priority) task.skills = [requirement.priority.toLowerCase()];
  if (fm.repo) task.github_repo = fm.repo;
  const links = [fm.discussion, fm.implementation].filter((link): link is string => Boolean(link));
  if (links.length) task.external_links = links;

  return task;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Validate emitted tasks against the LogicSRC task schema. */
export function validateTasks(tasks: TaskDocument[]): Array<{ index: number; errors: string[] }> {
  const problems: Array<{ index: number; errors: string[] }> = [];
  tasks.forEach((task, index) => {
    const result = validateSchema("task", task);
    if (result.ok) return;
    problems.push({
      index,
      errors: result.errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`)
    });
  });
  return problems;
}
