import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  createOntologyEngine,
  initOntologyPackage,
  loadOntologyPackage,
  localActor
} from "@logicsrc/openontology";
import { renderOntologyKeyHelp, renderOntologyTui, PANEL_KEYS } from "./openontology.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function engine() {
  const dir = mkdtempSync(join(tmpdir(), "tui-ontology-"));
  dirs.push(dir);
  initOntologyPackage(dir, { id: "test-ecosystem", now: "2026-07-26T00:00:00Z" });
  return createOntologyEngine({
    package: loadOntologyPackage(dir),
    actor: localActor("curator"),
    clock: () => "2026-07-26T00:00:00Z"
  });
}

describe("ontology TUI", () => {
  it("renders a bordered frame with the key bar and status line", () => {
    const output = renderOntologyTui(engine());
    const lines = output.split("\n");
    expect(lines[0]!.startsWith("┌")).toBe(true);
    expect(lines.at(-1)!.startsWith("└")).toBe(true);
    expect(output).toContain("e entities");
    expect(output).toContain("q quit");
    expect(output).toContain("asserted claims");
  });

  it("never exceeds the requested width, and stays usable when narrow", () => {
    for (const width of [60, 78, 120]) {
      const lines = renderOntologyTui(engine(), { width }).split("\n");
      const widths = new Set(lines.map((line) => [...line].length));
      expect(widths.size).toBe(1);
      expect([...widths][0]).toBe(Math.max(width, 60));
    }
  });

  it("shows every panel", () => {
    const e = engine();
    expect(renderOntologyTui(e, { panel: "types" })).toContain("Person");
    expect(renderOntologyTui(e, { panel: "entities" })).toContain("Alice Reyes");
    expect(renderOntologyTui(e, { panel: "claims" })).toContain("worksOn");
    expect(renderOntologyTui(e, { panel: "sources" })).toContain("web-page");
    expect(renderOntologyTui(e, { panel: "queries" })).toContain("contributors");
    expect(renderOntologyTui(e, { panel: "changesets" })).toContain("no change sets");
    expect(renderOntologyTui(e, { panel: "violations" })).toContain("no errors");
    expect(renderOntologyTui(e, { panel: "audit" })).toContain("no events");
    // Rendering is read-only: repainting must not append to the audit log.
    expect(renderOntologyTui(e, { panel: "audit" })).toContain("no events");
  });

  it("distinguishes claim status by glyph and word, not colour", () => {
    const claims = renderOntologyTui(engine(), { panel: "claims", rows: 20 });
    expect(claims).toMatch(/✓ asserted/);
    // No ANSI escapes: the panel must survive a monochrome terminal.
    expect(claims.includes("[")).toBe(false);
  });

  it("surfaces proposed change sets and disputes in the status bar", () => {
    const e = engine();
    e.createOntologyChangeSet({
      title: "pending",
      operations: [
        {
          op: "assert-claim",
          value: {
            subject: "test:person:alice",
            predicate: "worksOn",
            object: { entity: "test:project:docs-portal" },
            sources: ["test:source:repo"]
          }
        }
      ]
    });
    expect(renderOntologyTui(e)).toContain("1 proposed");
    expect(renderOntologyTui(e, { panel: "changesets" })).toContain("pending");
  });

  it("lists the keys it binds", () => {
    expect(renderOntologyKeyHelp()).toContain("v: validate");
    expect(PANEL_KEYS.map((entry) => entry.key)).toContain("q");
  });
});
