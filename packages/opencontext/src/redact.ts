/**
 * Structured redaction.
 *
 * Redaction runs after authorization and before compilation, so a field can be
 * stripped from an object the consumer is otherwise entitled to read — the
 * support agent gets the customer record without the SSN.
 *
 * Paths address the object's `content`. A leading segment naming the object's
 * own type or id is optional, so on a `customer` object both `ssn` and
 * `customer.ssn` reach the same field; that is what makes a repository-wide
 * rule like `customer.ssn` behave the way an author expects.
 */

import type { ContextObject, Redaction } from "./types.js";
import { sha256Hex } from "./digest.js";

export interface RedactionOutcome {
  content: unknown;
  /** Paths actually removed or masked. Reported in the bundle; the values are not. */
  redacted: string[];
}

const DEFAULT_REPLACEMENT = "[REDACTED]";

export function applyRedactions(object: ContextObject, rules: Redaction[]): RedactionOutcome {
  if (rules.length === 0 || object.content === undefined || object.content === null) {
    return { content: object.content, redacted: [] };
  }

  // Strings have no structure to address, so structured rules cannot apply.
  if (typeof object.content !== "object") {
    return { content: object.content, redacted: [] };
  }

  const content = structuredClone(object.content) as Record<string, unknown>;
  const redacted: string[] = [];

  for (const rule of rules) {
    for (const path of candidatePaths(rule.path, object)) {
      const applied = applyRule(content, parsePath(path), rule);
      if (applied) {
        redacted.push(rule.path);
        break;
      }
    }
  }

  return { content, redacted: [...new Set(redacted)] };
}

/** `customer.ssn` on a `customer` object also means `ssn`. */
function candidatePaths(path: string, object: ContextObject): string[] {
  const paths = [path];
  const head = path.split(/[.[]/)[0];
  if (head && (head === object.type || head === object.id || object.id.endsWith(`.${head}`))) {
    const rest = path.slice(head.length).replace(/^\./, "");
    if (rest.length > 0) paths.push(rest);
  }
  return paths;
}

export interface PathSegment {
  key?: string;
  /** True for `[]` and `[*]`: apply to every element. */
  wildcardIndex?: boolean;
  index?: number;
}

/** Parse `contacts[*].email` into segments. */
export function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const pattern = /([^.[\]]+)|\[(\*|\d*)\]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(path)) !== null) {
    if (match[1] !== undefined) {
      segments.push({ key: match[1] });
    } else {
      const inner = match[2] ?? "";
      if (inner === "" || inner === "*") segments.push({ wildcardIndex: true });
      else segments.push({ index: Number.parseInt(inner, 10) });
    }
  }

  return segments;
}

function applyRule(root: unknown, segments: PathSegment[], rule: Redaction): boolean {
  if (segments.length === 0) return false;
  return walk(root, segments, 0, rule);
}

function walk(node: unknown, segments: PathSegment[], depth: number, rule: Redaction): boolean {
  if (node === null || node === undefined || typeof node !== "object") return false;

  const segment = segments[depth]!;
  const isLast = depth === segments.length - 1;

  if (segment.wildcardIndex || segment.index !== undefined) {
    if (!Array.isArray(node)) return false;
    const indices = segment.wildcardIndex ? node.map((_, index) => index) : [segment.index!];
    let touched = false;
    for (const index of indices) {
      if (index < 0 || index >= node.length) continue;
      if (isLast) {
        const replaced = redactValue(node[index], rule);
        if (replaced === REMOVE) node.splice(index, 1);
        else node[index] = replaced;
        touched = true;
      } else if (walk(node[index], segments, depth + 1, rule)) {
        touched = true;
      }
    }
    return touched;
  }

  const key = segment.key!;

  // A wildcard-free path applied to an array still means "every element", so a
  // rule written for one record works on a list of them.
  if (Array.isArray(node)) {
    let touched = false;
    for (const item of node) {
      if (walk(item, segments, depth, rule)) touched = true;
    }
    return touched;
  }

  const record = node as Record<string, unknown>;
  if (!Object.hasOwn(record, key)) return false;

  if (isLast) {
    const replaced = redactValue(record[key], rule);
    if (replaced === REMOVE) delete record[key];
    else record[key] = replaced;
    return true;
  }

  return walk(record[key], segments, depth + 1, rule);
}

const REMOVE = Symbol("remove");

function redactValue(value: unknown, rule: Redaction): unknown {
  switch (rule.mode ?? "remove") {
    case "mask":
      return rule.replacement ?? DEFAULT_REPLACEMENT;
    case "hash":
      // Equality stays testable without disclosing the value — two records with
      // the same email still match, and neither email is readable.
      return `sha256:${sha256Hex(stableString(value))}`;
    default:
      return REMOVE;
  }
}

function stableString(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value ?? null);
}

/**
 * Heuristic secret detection, used by doctor.
 *
 * Secrets belong in a secret manager and are referenced from context, never
 * stored in it — a context repository is usually far more widely readable than
 * the systems it describes.
 */
const SECRET_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "AWS access key id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/ },
  { label: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { label: "JSON Web Token", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { label: "generic assigned secret", pattern: /\b(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["']?[A-Za-z0-9/+_-]{16,}/i }
];

export function detectSecrets(value: unknown): string[] {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const found: string[] = [];
  for (const { label, pattern } of SECRET_PATTERNS) {
    if (pattern.test(text)) found.push(label);
  }
  return found;
}
