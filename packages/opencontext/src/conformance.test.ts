/**
 * The official conformance suite.
 *
 * Everything here runs against the *published* fixtures under
 * `@logicsrc/schemas`, not against private test data, so a third-party
 * implementation can run exactly the same cases. Schema fixtures need no
 * OpenContext code at all — only a JSON Schema validator. The resolution
 * scenarios go further and pin resolver behaviour that schemas cannot express:
 * scope, authority, supersession, lifecycle, and redaction.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "@logicsrc/validators";
import { OpenContext } from "./index.js";
import { hasFailure } from "./validate.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../../schemas/fixtures/opencontext");

interface Conformance {
  opencontextConformance: string;
  valid: Array<{ fixture: string; kind: string }>;
  invalid: Array<{ fixture: string; kind: string; why: string }>;
  resolution: Array<{ scenario: string; expected: string }>;
}

const conformance = JSON.parse(readFileSync(join(FIXTURES, "conformance.json"), "utf8")) as Conformance;

function readFixture(relative: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, relative), "utf8"));
}

describe("conformance: schemas", () => {
  it("declares a v1 suite", () => {
    expect(conformance.opencontextConformance).toBe("1.0");
    expect(conformance.valid.length).toBeGreaterThan(0);
    expect(conformance.invalid.length).toBeGreaterThan(0);
  });

  it.each(conformance.valid)("valid: $fixture", ({ fixture, kind }) => {
    const result = validate(kind as never, readFixture(fixture));
    if (!result.ok) {
      const detail = result.errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
      throw new Error(`${fixture} should satisfy ${kind}: ${detail}`);
    }
    expect(result.ok).toBe(true);
  });

  it.each(conformance.invalid)("invalid: $fixture ($why)", ({ fixture, kind }) => {
    const result = validate(kind as never, readFixture(fixture));
    expect(result.ok).toBe(false);
  });
});

interface Expectation {
  description: string;
  resolve?: { role?: string; agent?: string; task?: string; at?: string; includeHistorical?: boolean };
  expect?: {
    included?: string[];
    includedVersions?: Record<string, number>;
    objectCount?: number;
    excluded?: Array<{ id: string; reason: string }>;
    warnings?: string[];
    lifecycle?: Record<string, string>;
    redacted?: Record<string, string[]>;
    contentAbsent?: Record<string, string[]>;
    contentEquals?: Record<string, Record<string, unknown>>;
  };
  also?: Array<{ resolve: Expectation["resolve"]; expect: Expectation["expect"] }>;
  validate?: { expectDiagnostics?: string[]; expectFailure?: boolean };
}

describe("conformance: resolution", () => {
  it("declares scenarios", () => {
    expect(conformance.resolution.length).toBeGreaterThanOrEqual(8);
  });

  it.each(conformance.resolution)("$scenario", async ({ scenario, expected }) => {
    const spec = readFixture(expected) as Expectation;
    const oc = await OpenContext.load(join(FIXTURES, scenario));

    if (spec.validate) {
      const findings = oc.validate();
      for (const code of spec.validate.expectDiagnostics ?? []) {
        expect(findings.map((finding) => finding.code)).toContain(code);
      }
      if (spec.validate.expectFailure) {
        expect(hasFailure(findings, "error")).toBe(true);
      }
    }

    const runs = [
      ...(spec.resolve ? [{ resolve: spec.resolve, expect: spec.expect }] : []),
      ...(spec.also ?? [])
    ];

    for (const run of runs) {
      const result = oc.resolve({ ...run.resolve, explain: true });
      const bundle = result.bundle;
      const ids = bundle.objects.map((object) => object.id).sort();
      const want = run.expect ?? {};

      if (want.included) expect(ids).toEqual([...want.included].sort());
      if (want.objectCount !== undefined) expect(bundle.objects).toHaveLength(want.objectCount);

      if (want.includedVersions) {
        for (const [id, version] of Object.entries(want.includedVersions)) {
          expect(bundle.objects.find((object) => object.id === id)?.version).toBe(version);
        }
      }

      for (const expectation of want.excluded ?? []) {
        expect(
          result.excluded.some((item) => item.id === expectation.id && item.reason === expectation.reason),
          `expected ${expectation.id} to be excluded as ${expectation.reason}, got ${JSON.stringify(result.excluded)}`
        ).toBe(true);
      }

      for (const code of want.warnings ?? []) {
        expect(bundle.warnings?.map((warning) => warning.code)).toContain(code);
      }

      for (const [id, state] of Object.entries(want.lifecycle ?? {})) {
        expect(bundle.objects.find((object) => object.id === id)?.lifecycle).toBe(state);
      }

      for (const [id, paths] of Object.entries(want.redacted ?? {})) {
        expect(bundle.objects.find((object) => object.id === id)?.redacted).toEqual(paths);
      }

      for (const [id, paths] of Object.entries(want.contentAbsent ?? {})) {
        const content = bundle.objects.find((object) => object.id === id)?.content as Record<string, unknown>;
        for (const path of paths) expect(content?.[path]).toBeUndefined();
      }

      for (const [id, pairs] of Object.entries(want.contentEquals ?? {})) {
        const content = bundle.objects.find((object) => object.id === id)?.content;
        for (const [path, value] of Object.entries(pairs)) {
          expect(readPath(content, path)).toEqual(value);
        }
      }
    }
  });

  it("produces identical digests for a repeated run of every scenario", async () => {
    // Determinism is a conformance requirement, not an implementation detail.
    for (const { scenario, expected } of conformance.resolution) {
      const spec = readFixture(expected) as Expectation;
      if (!spec.resolve) continue;

      const first = (await OpenContext.load(join(FIXTURES, scenario))).bundle({ ...spec.resolve });
      const second = (await OpenContext.load(join(FIXTURES, scenario))).bundle({ ...spec.resolve });
      expect(second.digest, `${scenario} digest drifted between runs`).toBe(first.digest);
    }
  });
});

function readPath(node: unknown, path: string): unknown {
  let current = node;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) current = current[Number.parseInt(segment, 10)];
    else if (typeof current === "object") current = (current as Record<string, unknown>)[segment];
    else return undefined;
  }
  return current;
}
