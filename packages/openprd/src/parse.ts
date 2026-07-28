import { basename } from "node:path";
import { parse as parseYaml } from "yaml";
import type { PrdDocument, PrdFrontMatter, Requirement, Section } from "./types.js";

export class PrdParseError extends Error {
  readonly code = "OP-P-PARSE";
  constructor(message: string, readonly file?: string) {
    super(message);
    this.name = "PrdParseError";
  }
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** `0001-add-the-thing.md` → prefix `0001`, slug `add-the-thing`. */
const FILE_NAME = /^(\d{4})-(.+)\.md$/;

/**
 * A requirement line. The standard writes them as `R1 [P0] …`; real PRDs also
 * bold the marker (`**R1 [P0]**`) and bullet it. All three parse the same.
 */
const REQUIREMENT = /^\s*(?:[-*+]\s+)?\*{0,2}R(\d+)\*{0,2}\s*\*{0,2}\[(P[012])\]\*{0,2}\s*(.*)$/;

/** A requirement marker with no priority tag — caught as a lint finding. */
const REQUIREMENT_NO_PRIORITY = /^\s*(?:[-*+]\s+)?\*{0,2}R(\d+)\*{0,2}[.:)\s]+(?!\[P[012]\])(.*)$/;

export function parsePrd(source: string, path: string): PrdDocument {
  const file = basename(path);
  const match = FRONT_MATTER.exec(source);
  if (!match) {
    throw new PrdParseError(
      `${file} has no YAML front-matter block (expected the file to open with '---')`,
      file
    );
  }

  const [, frontMatterRaw, body] = match as unknown as [string, string, string];

  let frontMatter: PrdFrontMatter;
  try {
    frontMatter = (parseYaml(frontMatterRaw) ?? {}) as PrdFrontMatter;
  } catch (error) {
    throw new PrdParseError(`${file} front-matter is not valid YAML — ${(error as Error).message}`, file);
  }
  if (typeof frontMatter !== "object" || Array.isArray(frontMatter)) {
    throw new PrdParseError(`${file} front-matter must be a YAML mapping`, file);
  }

  const nameMatch = FILE_NAME.exec(file);
  // Line 1 is `---`; the body starts after the closing delimiter.
  const bodyStartLine = frontMatterRaw.split("\n").length + 3;

  return {
    path,
    file,
    filePrefix: nameMatch?.[1] ?? null,
    slug: nameMatch?.[2] ?? null,
    frontMatter,
    frontMatterRaw,
    body,
    heading: findHeading(body),
    sections: findSections(body, bodyStartLine),
    requirements: findRequirements(body, bodyStartLine)
  };
}

function findHeading(body: string): string | null {
  for (const line of body.split("\n")) {
    if (line.startsWith("# ")) return line.slice(2).trim();
    if (line.startsWith("## ")) return null; // a section started first
  }
  return null;
}

/**
 * Sections are `##` headings only. `###` and deeper are content, so a PRD can
 * organize a long Requirements section without inventing new sections.
 */
function findSections(body: string, offset: number): Section[] {
  const lines = body.split("\n");
  const sections: Section[] = [];
  let fenced = false;

  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) return;

    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (!heading || line.startsWith("###")) return;

    sections.push({
      name: (heading[1] as string).trim(),
      line: offset + index,
      content: "",
      empty: true
    });
  });

  // Fill each section's content from its heading to the next one.
  const headingIndexes = sections.map((section) => section.line - offset);
  sections.forEach((section, i) => {
    const from = (headingIndexes[i] as number) + 1;
    const to = i + 1 < headingIndexes.length ? (headingIndexes[i + 1] as number) : lines.length;
    const content = lines.slice(from, to).join("\n").trim();
    section.content = content;
    section.empty = content.length === 0;
  });

  return sections;
}

function findRequirements(body: string, offset: number): Requirement[] {
  const requirements: Requirement[] = [];
  let fenced = false;

  body.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) return;

    const match = REQUIREMENT.exec(line);
    if (match) {
      requirements.push({
        id: `R${match[1]}`,
        number: Number.parseInt(match[1] as string, 10),
        priority: match[2] as Requirement["priority"],
        text: (match[3] as string).trim(),
        line: offset + index
      });
      return;
    }

    const untagged = REQUIREMENT_NO_PRIORITY.exec(line);
    if (untagged) {
      requirements.push({
        id: `R${untagged[1]}`,
        number: Number.parseInt(untagged[1] as string, 10),
        priority: null,
        text: (untagged[2] as string).trim(),
        line: offset + index
      });
    }
  });

  return requirements;
}

/** Kebab-case slug from a title, matching the filename convention. */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");
}

/** Four-digit, zero-padded id. */
export function formatId(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * Rewrite a document's front-matter in place, preserving the body byte for
 * byte. Only the keys given are touched; everything else keeps its position,
 * comments, and formatting.
 */
export function rewriteFrontMatter(
  source: string,
  updates: Record<string, string | null>
): string {
  const match = FRONT_MATTER.exec(source);
  if (!match) throw new PrdParseError("Cannot rewrite front-matter: no block found");

  const [, raw, body] = match as unknown as [string, string, string];
  const lines = raw.split("\n");
  const applied = new Set<string>();

  const rendered = lines.map((line) => {
    const keyMatch = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/.exec(line);
    if (!keyMatch) return line;
    const key = keyMatch[1] as string;
    if (!(key in updates)) return line;
    applied.add(key);
    const value = updates[key];
    return value === null || value === "" ? `${key}:` : `${key}: ${value}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (applied.has(key)) continue;
    if (value === null || value === "") continue;
    rendered.push(`${key}: ${value}`);
  }

  return `---\n${rendered.join("\n")}\n---\n${body}`;
}
