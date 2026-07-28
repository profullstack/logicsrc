import { validate as validateSchema } from "@logicsrc/validators";
import { slugify } from "./parse.js";
import { SECTIONS, type Finding, type PrdCollection, type PrdDocument, type Severity, type ValidationReport } from "./types.js";

export interface ValidateOptions {
  /** Promote lint warnings to errors, for CI that wants a clean collection. */
  strict?: boolean;
  /** The version the collection targets. Mismatches are reported. */
  expectedVersion?: string;
}

const TEMPLATE_ID = "0000";

/**
 * Conformance, straight from docs/openprd.md:
 *
 *   - lives at prd/<id>-<slug>.md with a four-digit <id>
 *   - front-matter validates against openprd-prd.schema.json
 *   - id equals the filename's numeric prefix
 *   - all eight body sections are present in order
 *
 * Everything beyond those four is lint: useful, but never the difference
 * between conforming and not.
 */
export function validatePrdDocument(doc: PrdDocument, options: ValidateOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const lint: Severity = options.strict ? "error" : "warning";
  const add = (finding: Finding) => findings.push({ file: doc.file, ...finding });

  const isTemplate = doc.filePrefix === TEMPLATE_ID;

  /* ── 1. Filename ─────────────────────────────────────────────────────── */

  if (!doc.filePrefix) {
    add({
      code: "OP-C-FILENAME",
      severity: "error",
      message: `${doc.file} is not named <id>-<slug>.md with a four-digit id`,
      hint: "Rename to prd/0001-short-kebab-title.md"
    });
  } else if (doc.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(doc.slug)) {
    add({
      code: "OP-C-SLUG-FORM",
      severity: "error",
      message: `${doc.file} slug "${doc.slug}" is not kebab-case`,
      hint: "Lowercase letters, digits, and single hyphens only"
    });
  }

  /* ── 2. Front-matter schema ──────────────────────────────────────────── */

  const result = validateSchema("openprd-prd", doc.frontMatter);
  if (!result.ok) {
    for (const error of result.errors) {
      add({
        code: "OP-C-FRONTMATTER",
        severity: "error",
        line: 2,
        message: `front-matter ${error.instancePath || "/"} ${error.message ?? "failed validation"}`,
        hint: "See packages/schemas/schemas/openprd-prd.schema.json"
      });
    }
  }

  /* ── 3. id matches the filename prefix ───────────────────────────────── */

  if (doc.filePrefix && doc.frontMatter.id && doc.frontMatter.id !== doc.filePrefix) {
    add({
      code: "OP-C-ID-MISMATCH",
      severity: "error",
      line: 2,
      message: `front-matter id "${doc.frontMatter.id}" does not match filename prefix "${doc.filePrefix}"`
    });
  }

  /* ── 4. The eight sections, present and in order ─────────────────────── */

  const present = doc.sections.map((section) => section.name);
  const expected = [...SECTIONS];

  for (const name of expected) {
    if (!present.includes(name)) {
      add({
        code: "OP-C-SECTION-MISSING",
        severity: "error",
        message: `missing required section "## ${name}"`,
        hint: `The eight sections are: ${expected.join(", ")}`
      });
    }
  }

  const required = present.filter((name) => expected.includes(name as (typeof SECTIONS)[number]));
  const ordered = expected.filter((name) => required.includes(name));
  if (required.length === ordered.length && required.join("|") !== ordered.join("|")) {
    add({
      code: "OP-C-SECTION-ORDER",
      severity: "error",
      message: `sections are out of order: found ${required.join(" → ")}, expected ${ordered.join(" → ")}`
    });
  }

  const extra = present.filter((name) => !expected.includes(name as (typeof SECTIONS)[number]));
  for (const name of extra) {
    add({
      code: "OP-L-EXTRA-SECTION",
      severity: "info",
      line: doc.sections.find((s) => s.name === name)?.line,
      message: `"## ${name}" is not one of the eight standard sections`,
      hint: "Use a ### subsection inside a standard section instead"
    });
  }

  /* ── Lint from here down ─────────────────────────────────────────────── */

  if (options.expectedVersion && doc.frontMatter.openprd !== options.expectedVersion) {
    add({
      code: "OP-L-VERSION",
      severity: lint,
      line: 2,
      message: `declares openprd "${doc.frontMatter.openprd}" but the collection targets "${options.expectedVersion}"`
    });
  }

  for (const section of doc.sections) {
    if (!expected.includes(section.name as (typeof SECTIONS)[number])) continue;
    if (!section.empty) continue;
    add({
      code: "OP-L-EMPTY-SECTION",
      severity: isTemplate ? "info" : lint,
      line: section.line,
      message: `section "## ${section.name}" is empty`,
      hint: "A single line such as _None._ is enough"
    });
  }

  if (!isTemplate) {
    if ((doc.frontMatter.authors?.length ?? 0) === 0) {
      add({
        code: "OP-L-NO-AUTHOR",
        severity: lint,
        line: 2,
        message: "no authors listed",
        hint: "The standard expects at least one author"
      });
    }

    if (doc.slug && doc.frontMatter.title) {
      const fromTitle = slugify(doc.frontMatter.title);
      if (fromTitle && doc.slug !== fromTitle && !fromTitle.startsWith(doc.slug) && !doc.slug.startsWith(fromTitle)) {
        add({
          code: "OP-L-SLUG-DRIFT",
          severity: "info",
          message: `slug "${doc.slug}" does not summarize the title (expected something like "${fromTitle}")`
        });
      }
    }

    if (doc.heading && doc.frontMatter.title && doc.heading !== doc.frontMatter.title) {
      add({
        code: "OP-L-HEADING-DRIFT",
        severity: "info",
        message: `H1 "${doc.heading}" differs from front-matter title "${doc.frontMatter.title}"`
      });
    }
  }

  /* ── Requirements ────────────────────────────────────────────────────── */

  const requirementsSection = doc.sections.find((section) => section.name === "Requirements");
  if (requirementsSection && !requirementsSection.empty && doc.requirements.length === 0 && !isTemplate) {
    add({
      code: "OP-L-NO-REQUIREMENTS",
      severity: lint,
      line: requirementsSection.line,
      message: "Requirements section has no numbered R# entries",
      hint: "One capability per line: - R1 [P0] …"
    });
  }

  const seen = new Map<number, number>();
  for (const requirement of doc.requirements) {
    if (!requirement.priority) {
      add({
        code: "OP-L-REQ-PRIORITY",
        severity: lint,
        line: requirement.line,
        message: `${requirement.id} has no priority tag`,
        hint: "Prefix each requirement with [P0], [P1], or [P2]"
      });
    }
    const first = seen.get(requirement.number);
    if (first !== undefined) {
      add({
        code: "OP-L-REQ-DUPLICATE",
        severity: "error",
        line: requirement.line,
        message: `duplicate requirement id ${requirement.id} (first seen on line ${first})`
      });
    } else {
      seen.set(requirement.number, requirement.line);
    }
  }

  const numbers = [...seen.keys()].sort((a, b) => a - b);
  numbers.forEach((n, index) => {
    if (n === index + 1) return;
    const previous = index === 0 ? 0 : (numbers[index - 1] as number);
    if (n === previous + 1) return;
    add({
      code: "OP-L-REQ-NUMBERING",
      severity: lint,
      line: seen.get(n),
      message: `requirement numbering jumps from R${previous} to R${n}`,
      hint: "Number requirements contiguously from R1"
    });
  });

  /* ── Dates and supersession ──────────────────────────────────────────── */

  const { created, updated, status } = doc.frontMatter;
  if (created && updated && updated < created) {
    add({
      code: "OP-L-DATE-ORDER",
      severity: "error",
      line: 2,
      message: `updated (${updated}) is before created (${created})`
    });
  }

  const supersededBy = doc.frontMatter["superseded-by"];
  if (status === "Superseded" && !supersededBy) {
    add({
      code: "OP-L-SUPERSEDED-BY",
      severity: "error",
      line: 2,
      message: "status is Superseded but superseded-by names no replacement"
    });
  }
  if (supersededBy && status !== "Superseded") {
    add({
      code: "OP-L-SUPERSEDED-STATUS",
      severity: lint,
      line: 2,
      message: `superseded-by is set to ${supersededBy} but status is ${status}`
    });
  }
  if (doc.frontMatter.supersedes && doc.frontMatter.supersedes === doc.frontMatter.id) {
    add({
      code: "OP-L-SELF-REFERENCE",
      severity: "error",
      line: 2,
      message: "supersedes points at this PRD itself"
    });
  }

  return findings;
}

/**
 * Collection-level rules: numbering with no gaps, unique ids, resolvable
 * cross-references, and an index that matches what is on disk.
 */
export function validatePrdCollection(
  collection: PrdCollection,
  options: ValidateOptions & { expectedIndex?: string } = {}
): ValidationReport {
  const findings: Finding[] = [];
  const lint: Severity = options.strict ? "error" : "warning";

  for (const { file, reason } of collection.unparsed) {
    findings.push({ code: "OP-P-PARSE", severity: "error", file, message: reason });
  }

  for (const doc of [...(collection.template ? [collection.template] : []), ...collection.documents]) {
    findings.push(...validatePrdDocument(doc, options));
  }

  const byId = new Map<string, PrdDocument[]>();
  for (const doc of collection.documents) {
    const id = doc.frontMatter.id ?? doc.filePrefix ?? "????";
    byId.set(id, [...(byId.get(id) ?? []), doc]);
  }

  for (const [id, docs] of byId) {
    if (docs.length > 1) {
      findings.push({
        code: "OP-C-DUPLICATE-ID",
        severity: "error",
        file: docs.map((d) => d.file).join(", "),
        message: `id ${id} is used by ${docs.length} files`
      });
    }
  }

  // "Four-digit, zero-padded, monotonically increasing, no gaps."
  const numbers = collection.documents
    .map((doc) => Number.parseInt(doc.filePrefix ?? "", 10))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);

  numbers.forEach((n, index) => {
    const expected = index + 1;
    if (n === expected) return;
    const previous = index === 0 ? 0 : (numbers[index - 1] as number);
    if (n === previous + 1) return;
    findings.push({
      code: "OP-C-NUMBERING-GAP",
      severity: "error",
      message: `numbering jumps from ${String(previous).padStart(4, "0")} to ${String(n).padStart(4, "0")}`,
      hint: "Ids are monotonically increasing with no gaps; 0000 is reserved for the template"
    });
  });

  if (collection.documents.some((doc) => doc.filePrefix === "0000")) {
    findings.push({
      code: "OP-C-TEMPLATE-ID",
      severity: "error",
      message: "0000 is reserved for the template",
      hint: "Rename the PRD to the next free number"
    });
  }

  const ids = new Set(collection.documents.map((doc) => doc.frontMatter.id ?? doc.filePrefix));
  for (const doc of collection.documents) {
    for (const [field, target] of [
      ["supersedes", doc.frontMatter.supersedes],
      ["superseded-by", doc.frontMatter["superseded-by"]]
    ] as const) {
      if (!target) continue;
      if (!ids.has(target)) {
        findings.push({
          code: "OP-C-UNKNOWN-REFERENCE",
          severity: "error",
          file: doc.file,
          line: 2,
          message: `${field} points at ${target}, which is not in this collection`
        });
        continue;
      }
      const other = collection.documents.find((d) => (d.frontMatter.id ?? d.filePrefix) === target);
      const reciprocal = field === "supersedes" ? other?.frontMatter["superseded-by"] : other?.frontMatter.supersedes;
      if (reciprocal !== (doc.frontMatter.id ?? doc.filePrefix)) {
        findings.push({
          code: "OP-L-ONE-SIDED-REFERENCE",
          severity: lint,
          file: doc.file,
          line: 2,
          message: `${field}: ${target} is not reciprocated by ${other?.file ?? target}`,
          hint: "Supersession should be recorded on both PRDs"
        });
      }
    }
  }

  if (!collection.template) {
    findings.push({
      code: "OP-L-NO-TEMPLATE",
      severity: "info",
      message: "no 0000-template.md in the collection",
      hint: "Run `logicsrc prd init` to add the template and index"
    });
  }

  if (options.expectedIndex !== undefined) {
    if (collection.indexRaw === null) {
      findings.push({
        code: "OP-L-NO-INDEX",
        severity: "info",
        message: "no README.md index in the collection",
        hint: "Run `logicsrc prd index --write`"
      });
    } else if (collection.indexRaw.trim() !== options.expectedIndex.trim()) {
      findings.push({
        code: "OP-L-INDEX-STALE",
        severity: lint,
        file: "README.md",
        message: "index does not match the PRDs on disk",
        hint: "Run `logicsrc prd index --write`"
      });
    }
  }

  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;

  return {
    ok: counts.error === 0,
    findings,
    counts,
    checked: {
      documents: collection.documents.length,
      sections: collection.documents.reduce((n, doc) => n + doc.sections.length, 0),
      requirements: collection.documents.reduce((n, doc) => n + doc.requirements.length, 0)
    }
  };
}

/** Report for a single document, without collection-level rules. */
export function reportFor(doc: PrdDocument, options: ValidateOptions = {}): ValidationReport {
  const findings = validatePrdDocument(doc, options);
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return {
    ok: counts.error === 0,
    findings,
    counts,
    checked: { documents: 1, sections: doc.sections.length, requirements: doc.requirements.length }
  };
}
