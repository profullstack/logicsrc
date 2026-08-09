/**
 * Reading context documents off disk.
 *
 * Three shapes are supported and they mean the same thing:
 *   - Markdown with YAML front matter — metadata in the fence, prose as content
 *   - YAML — the whole document is the object
 *   - JSON — the whole document is the object
 *
 * A Markdown file with no front matter is still a valid context object: it
 * becomes content with an id derived from its path. That is what keeps
 * OpenContext adoptable — point it at an existing `docs/` folder and it works,
 * then add metadata where governance actually matters.
 */

import { parse as parseYaml } from "yaml";
import type { ContextObject } from "./types.js";

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export interface ParsedDocument {
  /** The object as authored. Never has defaults applied. */
  object: ContextObject;
  /** 1-indexed line the front matter / document body starts on. */
  bodyLine: number;
  /** Keys present in the source, for reporting unknown-field errors precisely. */
  declaredKeys: string[];
  format: "markdown" | "yaml" | "json";
}

export class ContextParseError extends Error {
  readonly file: string;
  readonly line?: number;

  constructor(message: string, file: string, line?: number) {
    super(message);
    this.name = "ContextParseError";
    this.file = file;
    this.line = line;
  }
}

export function parseContextDocument(text: string, file: string): ParsedDocument {
  const lower = file.toLowerCase();
  if (lower.endsWith(".json")) return parseJsonDocument(text, file);
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return parseYamlDocument(text, file);
  return parseMarkdownDocument(text, file);
}

function parseJsonDocument(text: string, file: string): ParsedDocument {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new ContextParseError(`Invalid JSON: ${(error as Error).message}`, file);
  }
  assertObject(data, file);
  return { object: data as ContextObject, bodyLine: 1, declaredKeys: Object.keys(data as object), format: "json" };
}

function parseYamlDocument(text: string, file: string): ParsedDocument {
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (error) {
    throw new ContextParseError(`Invalid YAML: ${(error as Error).message}`, file, yamlErrorLine(error));
  }
  if (data === null || data === undefined) {
    throw new ContextParseError("Document is empty.", file, 1);
  }
  assertObject(data, file);
  return { object: data as ContextObject, bodyLine: 1, declaredKeys: Object.keys(data as object), format: "yaml" };
}

function parseMarkdownDocument(text: string, file: string): ParsedDocument {
  const match = FRONT_MATTER.exec(text);

  if (!match) {
    // No front matter: the whole file is content. Still a valid object once the
    // loader supplies an id and type from the collection it came from.
    return {
      object: { content: stripBom(text) } as unknown as ContextObject,
      bodyLine: 1,
      declaredKeys: [],
      format: "markdown"
    };
  }

  let meta: unknown;
  try {
    meta = parseYaml(match[1]!);
  } catch (error) {
    throw new ContextParseError(
      `Invalid YAML front matter: ${(error as Error).message}`,
      file,
      1 + (yamlErrorLine(error) ?? 0)
    );
  }

  if (meta === null || meta === undefined) meta = {};
  assertObject(meta, file);

  const body = text.slice(match[0].length);
  const bodyLine = countLines(match[0]) + 1;
  // id and type are supplied by the loader when the author omits them, so the
  // parsed front matter is not yet a complete ContextObject.
  const object = { ...(meta as Record<string, unknown>) } as unknown as ContextObject;

  // Front matter may carry `content` explicitly; otherwise the prose is it.
  // An empty body must not clobber a declared content field.
  if (object.content === undefined && body.trim().length > 0) {
    object.content = body.replace(/^\r?\n/, "");
  }

  return { object, bodyLine, declaredKeys: Object.keys(meta as object), format: "markdown" };
}

function assertObject(data: unknown, file: string): void {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ContextParseError(
      `Expected a context object (a mapping), got ${Array.isArray(data) ? "an array" : typeof data}.`,
      file,
      1
    );
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function countLines(text: string): number {
  let count = 0;
  for (const char of text) if (char === "\n") count += 1;
  return count;
}

function yamlErrorLine(error: unknown): number | undefined {
  const pos = (error as { linePos?: Array<{ line: number }> }).linePos;
  return pos?.[0]?.line;
}

/**
 * Best-effort 1-indexed line of a top-level key, so diagnostics can point at the
 * offending field rather than the file. Front matter is scanned from line 2,
 * since line 1 is the opening fence.
 */
export function findFieldLine(text: string, field: string): number | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*"?${escaped}"?\\s*:`, "m");
  const match = pattern.exec(text);
  if (!match) return undefined;
  return countLines(text.slice(0, match.index)) + 1;
}
