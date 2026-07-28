import { describe, expect, it } from "vitest";
import { formatId, parsePrd, PrdParseError, rewriteFrontMatter, slugify } from "./parse.js";
import { SECTIONS } from "./types.js";

const MINIMAL = `---
openprd: "0.2"
id: "0007"
title: Do the thing
status: Draft
authors:
  - a@example.com
---

# Do the thing

## Problem

Something hurts.

## Goals

Make it stop.

## Non-Goals

_None._

## Users

Everyone.

## Requirements

- R1 [P0] First capability.
- R2 [P1] Second capability.

## UX Notes

_None._

## Success Metrics

It stops hurting.

## Risks & Open Questions

- Might not stop.
`;

describe("parsePrd", () => {
  const doc = parsePrd(MINIMAL, "/repo/prd/0007-do-the-thing.md");

  it("splits front-matter from body and parses the YAML", () => {
    expect(doc.frontMatter.id).toBe("0007");
    expect(doc.frontMatter.title).toBe("Do the thing");
    expect(doc.frontMatter.authors).toEqual(["a@example.com"]);
    expect(doc.body.startsWith("\n# Do the thing")).toBe(true);
  });

  it("derives the id prefix and slug from the filename", () => {
    expect(doc.filePrefix).toBe("0007");
    expect(doc.slug).toBe("do-the-thing");
    expect(doc.file).toBe("0007-do-the-thing.md");
  });

  it("finds all eight sections in order", () => {
    expect(doc.sections.map((s) => s.name)).toEqual([...SECTIONS]);
  });

  it("captures the H1 heading separately from the sections", () => {
    expect(doc.heading).toBe("Do the thing");
  });

  it("parses requirements with ids, priorities, and line numbers", () => {
    expect(doc.requirements).toHaveLength(2);
    expect(doc.requirements[0]).toMatchObject({ id: "R1", number: 1, priority: "P0", text: "First capability." });
    expect(doc.requirements[1]?.priority).toBe("P1");
    expect(doc.requirements[0]?.line).toBeGreaterThan(1);
  });

  it("rejects a file with no front-matter", () => {
    expect(() => parsePrd("# Just markdown\n", "x.md")).toThrow(PrdParseError);
  });

  it("rejects front-matter that is not a mapping", () => {
    expect(() => parsePrd("---\n- a\n- b\n---\n\n## Problem\n", "x.md")).toThrow(/mapping/);
  });

  it("reports invalid YAML rather than silently continuing", () => {
    expect(() => parsePrd('---\ntitle: "unterminated\n---\n\nbody\n', "x.md")).toThrow(/not valid YAML/);
  });

  it("treats ### as content, not as a section boundary", () => {
    const withSub = MINIMAL.replace(
      "## Requirements\n",
      "## Requirements\n\n### Product identity\n\nSome prose.\n"
    );
    const parsed = parsePrd(withSub, "0007-do-the-thing.md");
    expect(parsed.sections.map((s) => s.name)).toEqual([...SECTIONS]);
    expect(parsed.sections.find((s) => s.name === "Requirements")?.content).toContain("### Product identity");
  });

  it("ignores headings and requirement-shaped lines inside code fences", () => {
    const withFence = MINIMAL.replace(
      "## UX Notes\n",
      "## UX Notes\n\n```txt\n## Not A Section\n- R9 [P0] not a real requirement\n```\n"
    );
    const parsed = parsePrd(withFence, "0007-do-the-thing.md");
    expect(parsed.sections.map((s) => s.name)).toEqual([...SECTIONS]);
    expect(parsed.requirements.map((r) => r.id)).toEqual(["R1", "R2"]);
  });

  it("accepts the bold requirement style real PRDs use", () => {
    const bold = MINIMAL.replace("- R1 [P0] First capability.", "- **R1 [P0]** First capability.");
    const parsed = parsePrd(bold, "0007-do-the-thing.md");
    expect(parsed.requirements[0]).toMatchObject({ id: "R1", priority: "P0", text: "First capability." });
  });

  it("still records a requirement that is missing its priority tag", () => {
    const untagged = MINIMAL.replace("- R2 [P1] Second capability.", "- R2 Second capability.");
    const parsed = parsePrd(untagged, "0007-do-the-thing.md");
    expect(parsed.requirements[1]).toMatchObject({ id: "R2", priority: null });
  });

  it("marks an empty section as empty", () => {
    const emptied = MINIMAL.replace("## UX Notes\n\n_None._\n", "## UX Notes\n\n");
    const parsed = parsePrd(emptied, "0007-do-the-thing.md");
    expect(parsed.sections.find((s) => s.name === "UX Notes")?.empty).toBe(true);
    expect(parsed.sections.find((s) => s.name === "Problem")?.empty).toBe(false);
  });

  it("flags a malformed filename by leaving the prefix null", () => {
    const parsed = parsePrd(MINIMAL, "notes.md");
    expect(parsed.filePrefix).toBeNull();
    expect(parsed.slug).toBeNull();
  });
});

describe("slugify and formatId", () => {
  it("kebab-cases a title", () => {
    expect(slugify("Add the LogicSRC OpenOntology specification")).toBe(
      "add-the-logicsrc-openontology-specification"
    );
  });

  it("strips punctuation, accents, and repeated separators", () => {
    expect(slugify("Ship  “Café” — v2.0!")).toBe("ship-cafe-v2-0");
  });

  it("never leaves a trailing hyphen after truncation", () => {
    const slug = slugify("a".repeat(80));
    expect(slug.endsWith("-")).toBe(false);
    expect(slug.length).toBeLessThanOrEqual(72);
  });

  it("zero-pads to four digits", () => {
    expect(formatId(1)).toBe("0001");
    expect(formatId(42)).toBe("0042");
  });
});

describe("rewriteFrontMatter", () => {
  it("updates a key in place and leaves the body byte-identical", () => {
    const updated = rewriteFrontMatter(MINIMAL, { status: "Review" });
    expect(updated).toContain("status: Review");
    expect(updated.split("---\n")[2]).toBe(MINIMAL.split("---\n")[2]);
  });

  it("appends a key that was not present", () => {
    const updated = rewriteFrontMatter(MINIMAL, { updated: "2026-07-28" });
    expect(updated).toContain("updated: 2026-07-28");
  });

  it("blanks a key when given null, keeping the line", () => {
    const withRepo = rewriteFrontMatter(MINIMAL, { repo: "owner/name" });
    const cleared = rewriteFrontMatter(withRepo, { repo: null });
    expect(cleared).toContain("repo:");
    expect(cleared).not.toContain("owner/name");
  });

  it("leaves other keys untouched", () => {
    const updated = rewriteFrontMatter(MINIMAL, { status: "Accepted" });
    const doc = parsePrd(updated, "0007-do-the-thing.md");
    expect(doc.frontMatter.title).toBe("Do the thing");
    expect(doc.frontMatter.authors).toEqual(["a@example.com"]);
    expect(doc.frontMatter.status).toBe("Accepted");
  });
});
