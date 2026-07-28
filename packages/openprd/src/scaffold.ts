import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadPrdCollection, nextPrdNumber, renderIndex, INDEX_FILE, TEMPLATE_FILE } from "./collection.js";
import { formatId, slugify } from "./parse.js";
import { OPENPRD_VERSION, SECTIONS, type PrdStatus } from "./types.js";

/**
 * The canonical OpenPRD template. It lives in code so `prd init` works in any
 * repo, with or without a checkout of the standard; `template.test.ts` asserts
 * it stays identical to docs/openprd/0000-template.md.
 */
export const TEMPLATE = `---
openprd: "${OPENPRD_VERSION}"
id: "0000"
title: "Short imperative title — start with a verb if possible"
status: Draft
authors:
  - you@example.com
created: 2026-01-01
updated: 2026-01-01
repo:
discussion:
implementation:
tags:
supersedes:
superseded-by:
---

## Problem

The user/business problem, and why it matters now. Cite the ask, the incident,
or the constraint — not aesthetics.

## Goals

What success looks like, as outcomes (not features).

## Non-Goals

Explicitly out of scope, to bound the work.

## Users

Who this is for; personas or segments.

## Requirements

- R1 [P0] First required capability.
- R2 [P1] Next capability.

## UX Notes

Flows, states, and constraints that shape the experience.

## Success Metrics

How the goals will be measured.

## Risks & Open Questions

- Known risk or decision still owed.
`;

export interface InitResult {
  dir: string;
  created: string[];
  skipped: string[];
}

/** Create a `prd/` collection: the template plus a generated index. */
export function initPrdCollection(dir: string, options: { title?: string } = {}): InitResult {
  const base = resolve(dir);
  mkdirSync(base, { recursive: true });

  const created: string[] = [];
  const skipped: string[] = [];

  const templatePath = join(base, TEMPLATE_FILE);
  if (existsSync(templatePath)) {
    skipped.push(TEMPLATE_FILE);
  } else {
    writeFileSync(templatePath, TEMPLATE, "utf8");
    created.push(TEMPLATE_FILE);
  }

  const indexPath = join(base, INDEX_FILE);
  const index = renderIndex(loadPrdCollection(base), options);
  if (existsSync(indexPath)) {
    skipped.push(INDEX_FILE);
  } else {
    writeFileSync(indexPath, index, "utf8");
    created.push(INDEX_FILE);
  }

  return { dir: base, created, skipped };
}

export interface CreateOptions {
  title: string;
  authors?: string[];
  status?: PrdStatus;
  repo?: string;
  tags?: string[];
  discussion?: string;
  implementation?: string;
  owner?: string;
  supersedes?: string;
  /** Pinned in tests so generated files are byte-identical across runs. */
  today?: string;
  /** Override the assigned number. Defaults to the next free one. */
  id?: string;
}

export interface CreateResult {
  id: string;
  slug: string;
  file: string;
  path: string;
}

/**
 * Write the next numbered PRD. The number is assigned at creation from what is
 * on disk — never reserved in advance, per the standard.
 */
export function createPrd(dir: string, options: CreateOptions): CreateResult {
  const base = resolve(dir);
  if (!existsSync(base)) mkdirSync(base, { recursive: true });

  const collection = loadPrdCollection(base);
  const id = options.id ? formatId(Number.parseInt(options.id, 10)) : nextPrdNumber(collection);
  const slug = slugify(options.title);
  if (!slug) throw new Error(`Cannot derive a slug from title ${JSON.stringify(options.title)}`);

  const file = `${id}-${slug}.md`;
  const path = join(base, file);
  if (existsSync(path)) throw new Error(`${file} already exists`);

  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const authors = options.authors?.length ? options.authors : ["you@example.com"];

  const frontMatter = [
    "---",
    `openprd: "${OPENPRD_VERSION}"`,
    `id: "${id}"`,
    `title: ${yamlScalar(options.title)}`,
    `status: ${options.status ?? "Draft"}`,
    "authors:",
    ...authors.map((author) => `  - ${author}`),
    ...(options.owner ? [`owner: ${options.owner}`] : []),
    `repo: ${options.repo ?? ""}`.trimEnd(),
    `created: ${today}`,
    `updated: ${today}`,
    `discussion: ${options.discussion ?? ""}`.trimEnd(),
    `implementation: ${options.implementation ?? ""}`.trimEnd(),
    options.tags?.length ? `tags:\n${options.tags.map((tag) => `  - ${tag}`).join("\n")}` : "tags:",
    `supersedes: ${options.supersedes ?? ""}`.trimEnd(),
    "superseded-by:",
    "---",
    ""
  ].join("\n");

  const body = [
    `# ${options.title}`,
    "",
    ...SECTIONS.flatMap((section) => [`## ${section}`, "", placeholder(section), ""])
  ].join("\n");

  writeFileSync(path, `${frontMatter}${body}`, "utf8");
  return { id, slug, file, path };
}

function placeholder(section: string): string {
  switch (section) {
    case "Problem":
      return "_TODO: the user/business problem, and why it matters now._";
    case "Goals":
      return "_TODO: what success looks like, as outcomes._";
    case "Non-Goals":
      return "_TODO: explicitly out of scope._";
    case "Users":
      return "_TODO: who this is for._";
    case "Requirements":
      return "- R1 [P0] _TODO: first required capability._";
    case "UX Notes":
      return "_TODO: flows, states, and constraints._";
    case "Success Metrics":
      return "_TODO: how the goals will be measured._";
    default:
      return "- _TODO: known risk or decision still owed._";
  }
}

function yamlScalar(value: string): string {
  return /[:#{}[\],&*?|<>=!%@`"']/.test(value) || /^\s|\s$/.test(value)
    ? JSON.stringify(value)
    : value;
}

/** Rewrite `prd/README.md` from what is on disk. Returns true when it changed. */
export function writeIndex(dir: string, options: { title?: string } = {}): { changed: boolean; path: string } {
  const base = resolve(dir);
  const collection = loadPrdCollection(base);
  const index = renderIndex(collection, options);
  const path = join(base, INDEX_FILE);
  const before = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (before === index) return { changed: false, path };
  writeFileSync(path, index, "utf8");
  return { changed: true, path };
}
