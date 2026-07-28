/**
 * TypeScript surface for the OpenPRD standard (docs/openprd.md).
 *
 * The normative contracts are the standard document plus
 * `openprd-prd.schema.json` (front-matter). These types describe the parsed
 * document that tooling exchanges — the CLI, SDK, and any MCP surface all
 * speak this shape.
 */

export const OPENPRD_VERSION = "0.2";

/** The eight `##` sections, in the order the standard requires. */
export const SECTIONS = [
  "Problem",
  "Goals",
  "Non-Goals",
  "Users",
  "Requirements",
  "UX Notes",
  "Success Metrics",
  "Risks & Open Questions"
] as const;

export type SectionName = (typeof SECTIONS)[number];

export const STATUSES = [
  "Draft",
  "Review",
  "Accepted",
  "Final",
  "Rejected",
  "Withdrawn",
  "Superseded"
] as const;

export type PrdStatus = (typeof STATUSES)[number];

export type Priority = "P0" | "P1" | "P2";

/** The YAML front-matter block, validated by openprd-prd.schema.json. */
export interface PrdFrontMatter {
  openprd: string;
  id: string;
  title: string;
  status: PrdStatus;
  authors?: string[] | null;
  owner?: string | null;
  repo?: string | null;
  created?: string | null;
  updated?: string | null;
  discussion?: string | null;
  implementation?: string | null;
  tags?: string[] | null;
  supersedes?: string | null;
  "superseded-by"?: string | null;
}

export interface Section {
  name: string;
  /** 1-based line of the `## ` heading. */
  line: number;
  content: string;
  empty: boolean;
}

export interface Requirement {
  /** `R1`, `R2`, … as written. */
  id: string;
  number: number;
  priority: Priority | null;
  text: string;
  line: number;
}

export interface PrdDocument {
  /** Path as given (absolute or relative). */
  path: string;
  /** Basename, e.g. `0001-add-the-thing.md`. */
  file: string;
  /** Four-digit prefix parsed from the filename, or null when malformed. */
  filePrefix: string | null;
  slug: string | null;
  frontMatter: PrdFrontMatter;
  /** Raw front-matter text, for round-trip-safe rewrites. */
  frontMatterRaw: string;
  body: string;
  /** H1 heading immediately after the front-matter, when present. */
  heading: string | null;
  sections: Section[];
  requirements: Requirement[];
}

export type Severity = "error" | "warning" | "info";

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
  hint?: string;
}

export interface ValidationReport {
  ok: boolean;
  findings: Finding[];
  counts: Record<Severity, number>;
  checked: {
    documents: number;
    sections: number;
    requirements: number;
  };
}

export interface PrdCollection {
  dir: string;
  /** `0000-template.md`, when present. */
  template: PrdDocument | null;
  documents: PrdDocument[];
  /** Files that could not be parsed at all, with the reason. */
  unparsed: Array<{ file: string; reason: string }>;
  /** Existing `README.md` index contents, when present. */
  indexRaw: string | null;
}
