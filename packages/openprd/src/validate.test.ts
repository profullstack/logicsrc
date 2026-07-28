import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadPrdCollection, renderIndex } from "./collection.js";
import { canTransition, checkTransition, nextStatuses } from "./lifecycle.js";
import { parsePrd } from "./parse.js";
import { createPrd, initPrdCollection, writeIndex } from "./scaffold.js";
import { reportFor, validatePrdCollection, validatePrdDocument } from "./validate.js";
import type { PrdStatus } from "./types.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "openprd-"));
  dirs.push(dir);
  return dir;
}

/** A conforming PRD, which each test then breaks in exactly one way. */
function conforming(overrides: { frontMatter?: string; body?: string } = {}): string {
  const frontMatter =
    overrides.frontMatter ??
    `openprd: "0.2"
id: "0001"
title: Do the thing
status: Draft
authors:
  - a@example.com
created: 2026-07-01
updated: 2026-07-02`;

  const body =
    overrides.body ??
    `## Problem

Something hurts.

## Goals

Make it stop.

## Non-Goals

_None._

## Users

Everyone.

## Requirements

- R1 [P0] First capability.

## UX Notes

_None._

## Success Metrics

It stops hurting.

## Risks & Open Questions

- Might not stop.`;

  return `---\n${frontMatter}\n---\n\n${body}\n`;
}

const codes = (source: string, file = "0001-do-the-thing.md", options = {}) =>
  validatePrdDocument(parsePrd(source, file), options).map((finding) => finding.code);

describe("document conformance", () => {
  it("accepts a conforming PRD with no errors", () => {
    const report = reportFor(parsePrd(conforming(), "0001-do-the-thing.md"));
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("rejects a filename without a four-digit id", () => {
    expect(codes(conforming(), "do-the-thing.md")).toContain("OP-C-FILENAME");
  });

  it("rejects a non-kebab-case slug", () => {
    expect(codes(conforming(), "0001-Do_The_Thing.md")).toContain("OP-C-SLUG-FORM");
  });

  it("rejects front-matter that fails the schema", () => {
    const missingStatus = conforming({
      frontMatter: `openprd: "0.2"\nid: "0001"\ntitle: Do the thing`
    });
    expect(codes(missingStatus)).toContain("OP-C-FRONTMATTER");
  });

  it("rejects an unknown status value", () => {
    const bad = conforming({
      frontMatter: `openprd: "0.2"\nid: "0001"\ntitle: Do the thing\nstatus: Shipped`
    });
    expect(codes(bad)).toContain("OP-C-FRONTMATTER");
  });

  it("rejects an id that does not match the filename prefix", () => {
    const mismatch = conforming({
      frontMatter: `openprd: "0.2"\nid: "0009"\ntitle: Do the thing\nstatus: Draft`
    });
    expect(codes(mismatch)).toContain("OP-C-ID-MISMATCH");
  });

  it("rejects a missing section", () => {
    const withoutUsers = conforming().replace("## Users\n\nEveryone.\n\n", "");
    const found = codes(withoutUsers);
    expect(found).toContain("OP-C-SECTION-MISSING");
  });

  it("rejects sections that are out of order", () => {
    const swapped = conforming()
      .replace("## Problem\n\nSomething hurts.", "## Goals\n\nMake it stop.")
      .replace("## Goals\n\nMake it stop.\n\n## Non-Goals", "## Problem\n\nSomething hurts.\n\n## Non-Goals");
    expect(codes(swapped)).toContain("OP-C-SECTION-ORDER");
  });

  it("treats a non-standard section as info, not an error", () => {
    const extra = conforming().replace("## UX Notes", "## Appendix\n\nExtra.\n\n## UX Notes");
    const findings = validatePrdDocument(parsePrd(extra, "0001-do-the-thing.md"));
    const extraFinding = findings.find((f) => f.code === "OP-L-EXTRA-SECTION");
    expect(extraFinding?.severity).toBe("info");
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("accepts a section whose body is just _None._", () => {
    expect(codes(conforming())).not.toContain("OP-L-EMPTY-SECTION");
  });
});

describe("document lint", () => {
  it("warns about an empty section and escalates it under --strict", () => {
    const empty = conforming().replace("## UX Notes\n\n_None._", "## UX Notes\n");
    const lenient = validatePrdDocument(parsePrd(empty, "0001-do-the-thing.md"));
    const strict = validatePrdDocument(parsePrd(empty, "0001-do-the-thing.md"), { strict: true });
    expect(lenient.find((f) => f.code === "OP-L-EMPTY-SECTION")?.severity).toBe("warning");
    expect(strict.find((f) => f.code === "OP-L-EMPTY-SECTION")?.severity).toBe("error");
  });

  it("warns when a requirement has no priority tag", () => {
    const untagged = conforming().replace("- R1 [P0] First capability.", "- R1 First capability.");
    expect(codes(untagged)).toContain("OP-L-REQ-PRIORITY");
  });

  it("errors on duplicate requirement ids", () => {
    const duplicated = conforming().replace(
      "- R1 [P0] First capability.",
      "- R1 [P0] First capability.\n- R1 [P1] Same number again."
    );
    const findings = validatePrdDocument(parsePrd(duplicated, "0001-do-the-thing.md"));
    expect(findings.find((f) => f.code === "OP-L-REQ-DUPLICATE")?.severity).toBe("error");
  });

  it("warns when requirement numbering skips", () => {
    const gap = conforming().replace(
      "- R1 [P0] First capability.",
      "- R1 [P0] First capability.\n- R5 [P1] Jumped."
    );
    expect(codes(gap)).toContain("OP-L-REQ-NUMBERING");
  });

  it("warns when a PRD lists no authors", () => {
    const noAuthors = conforming({
      frontMatter: `openprd: "0.2"\nid: "0001"\ntitle: Do the thing\nstatus: Draft`
    });
    expect(codes(noAuthors)).toContain("OP-L-NO-AUTHOR");
  });

  it("errors when updated is before created", () => {
    const backwards = conforming({
      frontMatter: `openprd: "0.2"\nid: "0001"\ntitle: Do the thing\nstatus: Draft\nauthors:\n  - a@example.com\ncreated: 2026-07-10\nupdated: 2026-07-01`
    });
    const findings = validatePrdDocument(parsePrd(backwards, "0001-do-the-thing.md"));
    expect(findings.find((f) => f.code === "OP-L-DATE-ORDER")?.severity).toBe("error");
  });

  it("errors when status is Superseded with no replacement named", () => {
    const superseded = conforming({
      frontMatter: `openprd: "0.2"\nid: "0001"\ntitle: Do the thing\nstatus: Superseded\nauthors:\n  - a@example.com`
    });
    expect(codes(superseded)).toContain("OP-L-SUPERSEDED-BY");
  });

  it("errors when a PRD supersedes itself", () => {
    const selfRef = conforming({
      frontMatter: `openprd: "0.2"\nid: "0001"\ntitle: Do the thing\nstatus: Draft\nauthors:\n  - a@example.com\nsupersedes: "0001"`
    });
    expect(codes(selfRef)).toContain("OP-L-SELF-REFERENCE");
  });

  it("notes when the slug does not summarize the title", () => {
    expect(codes(conforming(), "0001-something-else-entirely.md")).toContain("OP-L-SLUG-DRIFT");
  });
});

describe("collection rules", () => {
  function collectionWith(files: Record<string, string>): ReturnType<typeof loadPrdCollection> {
    const dir = scratch();
    initPrdCollection(dir);
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(join(dir, name), contents, "utf8");
    }
    return loadPrdCollection(dir);
  }

  it("accepts a freshly initialized collection", () => {
    const dir = scratch();
    initPrdCollection(dir);
    createPrd(dir, { title: "Do the thing", authors: ["a@example.com"], today: "2026-07-26" });
    writeIndex(dir);
    const collection = loadPrdCollection(dir);
    const report = validatePrdCollection(collection, { expectedIndex: renderIndex(collection) });
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("errors on a numbering gap", () => {
    const collection = collectionWith({
      "0001-one.md": conforming(),
      "0003-three.md": conforming({
        frontMatter: `openprd: "0.2"\nid: "0003"\ntitle: Three\nstatus: Draft\nauthors:\n  - a@example.com`
      })
    });
    const report = validatePrdCollection(collection);
    expect(report.findings.map((f) => f.code)).toContain("OP-C-NUMBERING-GAP");
    expect(report.ok).toBe(false);
  });

  it("errors on a duplicate id across two files", () => {
    const collection = collectionWith({
      "0001-one.md": conforming(),
      "0002-two.md": conforming({
        frontMatter: `openprd: "0.2"\nid: "0001"\ntitle: Two\nstatus: Draft\nauthors:\n  - a@example.com`
      })
    });
    expect(validatePrdCollection(collection).findings.map((f) => f.code)).toContain("OP-C-DUPLICATE-ID");
  });

  it("errors when a cross-reference points outside the collection", () => {
    const collection = collectionWith({
      "0001-one.md": conforming({
        frontMatter: `openprd: "0.2"\nid: "0001"\ntitle: One\nstatus: Draft\nauthors:\n  - a@example.com\nsupersedes: "0099"`
      })
    });
    expect(validatePrdCollection(collection).findings.map((f) => f.code)).toContain("OP-C-UNKNOWN-REFERENCE");
  });

  it("warns when supersession is recorded on only one side", () => {
    const collection = collectionWith({
      "0001-one.md": conforming({
        frontMatter: `openprd: "0.2"\nid: "0001"\ntitle: One\nstatus: Superseded\nauthors:\n  - a@example.com\nsuperseded-by: "0002"`
      }),
      "0002-two.md": conforming({
        frontMatter: `openprd: "0.2"\nid: "0002"\ntitle: Two\nstatus: Draft\nauthors:\n  - a@example.com`
      })
    });
    expect(validatePrdCollection(collection).findings.map((f) => f.code)).toContain("OP-L-ONE-SIDED-REFERENCE");
  });

  it("reports an unparseable file instead of skipping it", () => {
    const collection = collectionWith({ "0001-broken.md": "# no front matter\n" });
    const report = validatePrdCollection(collection);
    expect(report.findings.map((f) => f.code)).toContain("OP-P-PARSE");
    expect(report.ok).toBe(false);
  });

  it("warns when the index is stale", () => {
    const dir = scratch();
    initPrdCollection(dir);
    createPrd(dir, { title: "Unindexed", authors: ["a@example.com"], today: "2026-07-26" });
    const collection = loadPrdCollection(dir);
    const report = validatePrdCollection(collection, { expectedIndex: renderIndex(collection) });
    expect(report.findings.map((f) => f.code)).toContain("OP-L-INDEX-STALE");
  });
});

describe("lifecycle", () => {
  it("follows the transitions in the standard", () => {
    expect(nextStatuses("Draft")).toEqual(["Review", "Withdrawn"]);
    expect(canTransition("Review", "Accepted")).toBe(true);
    expect(canTransition("Accepted", "Final")).toBe(true);
    expect(canTransition("Final", "Superseded")).toBe(true);
  });

  it("refuses to skip stages", () => {
    expect(canTransition("Draft", "Final")).toBe(false);
    expect(canTransition("Draft", "Accepted")).toBe(false);
    const check = checkTransition("Draft", "Final");
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/Review, Withdrawn/);
  });

  it("treats Rejected, Withdrawn, and Superseded as terminal", () => {
    for (const status of ["Rejected", "Withdrawn", "Superseded"] as PrdStatus[]) {
      expect(nextStatuses(status)).toEqual([]);
      expect(checkTransition(status, "Draft").reason).toMatch(/terminal/);
    }
  });

  it("requires a replacement id to mark a PRD Superseded", () => {
    expect(checkTransition("Accepted", "Superseded").ok).toBe(false);
    expect(checkTransition("Accepted", "Superseded", { supersededBy: "0002" }).ok).toBe(true);
  });

  it("refuses a no-op transition", () => {
    expect(checkTransition("Draft", "Draft").reason).toMatch(/already/);
  });
});
