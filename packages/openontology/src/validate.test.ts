import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildOntologyPackage, loadOntologyPackage, verifyPackageDigest } from "./package.js";
import { initOntologyPackage } from "./scaffold.js";
import { renderReport, validateOntologyPackage } from "./validate.js";
import { OPENONTOLOGY_VERSION } from "./types.js";
import type { Claim, LoadedPackage } from "./types.js";

const NOW = "2026-07-26T00:00:00Z";
const dirs: string[] = [];

function scaffold(): { dir: string; pkg: LoadedPackage } {
  const dir = mkdtempSync(join(tmpdir(), "openontology-"));
  dirs.push(dir);
  initOntologyPackage(dir, { id: "test-ecosystem", now: NOW });
  return { dir, pkg: loadOntologyPackage(dir) };
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** Clone the scaffold and mutate one claim, to isolate a single failure mode. */
function withClaims(pkg: LoadedPackage, mutate: (claims: Claim[]) => void): LoadedPackage {
  const copy = structuredClone(pkg);
  mutate(copy.data.claims);
  return copy;
}

describe("init + validate", () => {
  it("scaffolds a package that passes strict validation with no edits (R139)", () => {
    const { pkg } = scaffold();
    const report = validateOntologyPackage(pkg, { strict: true });
    const errors = report.findings.filter((f) => f.severity === "error");
    expect(errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.checked.entities).toBe(8);
    expect(report.checked.claims).toBe(14);
  });

  it("loads YAML manifest, YAML schema files, and NDJSON data together", () => {
    const { pkg } = scaffold();
    expect(pkg.manifest.kind).toBe("OntologyPackage");
    expect(pkg.schema.entityTypes.map((t) => t.id)).toEqual(["Person", "Organization", "Project"]);
    expect(pkg.data.sources).toHaveLength(2);
    expect(pkg.files.map((f) => f.path)).toContain("data/claims.ndjson");
  });

  it("builds a deterministic digest that survives a rebuild", () => {
    const { pkg } = scaffold();
    const first = buildOntologyPackage(pkg);
    const second = buildOntologyPackage(loadOntologyPackage(structuredClone(pkg)));
    expect(first.digest).toBe(second.digest);
    expect(verifyPackageDigest(first).ok).toBe(true);
  });

  it("detects a tampered built package", () => {
    const { pkg } = scaffold();
    const built = buildOntologyPackage(pkg);
    built.files[0] = { ...built.files[0], digest: `sha256:${"0".repeat(64)}` };
    expect(verifyPackageDigest(built).ok).toBe(false);
  });

  it("reports a missing declared file instead of loading a partial package", () => {
    const { dir } = scaffold();
    rmSync(join(dir, "data/claims.ndjson"));
    expect(() => loadOntologyPackage(dir)).toThrow(/data.claims.*missing/);
  });
});

describe("graph validation", () => {
  it("rejects a claim whose subject type is outside the relationship domain", () => {
    const { pkg } = scaffold();
    const broken = withClaims(pkg, (claims) => {
      const claim = claims.find((c) => c.predicate === "worksOn") as Claim;
      claim.subject = "test:org:northwind"; // an Organization cannot worksOn
    });
    const report = validateOntologyPackage(broken);
    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.code)).toContain("OO-G-DOMAIN");
  });

  it("rejects a claim whose object type is outside the relationship range", () => {
    const { pkg } = scaffold();
    const broken = withClaims(pkg, (claims) => {
      const claim = claims.find((c) => c.predicate === "worksOn") as Claim;
      claim.object = { entity: "test:org:northwind" };
    });
    expect(validateOntologyPackage(broken).findings.map((f) => f.code)).toContain("OO-G-RANGE");
  });

  it("rejects a value object on a relationship predicate", () => {
    const { pkg } = scaffold();
    const broken = withClaims(pkg, (claims) => {
      const claim = claims.find((c) => c.predicate === "worksOn") as Claim;
      claim.object = { value: "ZK Prover" };
    });
    expect(validateOntologyPackage(broken).findings.map((f) => f.code)).toContain("OO-G-OBJECT-KIND");
  });

  it("rejects a value that does not match its declared datatype", () => {
    const { pkg } = scaffold();
    const broken = withClaims(pkg, (claims) => {
      const claim = claims.find((c) => c.predicate === "homepage") as Claim;
      claim.object = { value: 42 };
    });
    expect(validateOntologyPackage(broken).findings.map((f) => f.code)).toContain("OO-G-DATATYPE");
  });

  it("rejects dangling entity, source, and claim references", () => {
    const { pkg } = scaffold();
    const broken = withClaims(pkg, (claims) => {
      (claims[0] as Claim).subject = "test:person:nobody";
      (claims[1] as Claim).sources = ["test:source:missing"];
      (claims[2] as Claim).supersedes = "test:claim:9999";
    });
    const codes = validateOntologyPackage(broken).findings.map((f) => f.code);
    expect(codes.filter((c) => c === "OO-G-DANGLING-REF").length).toBeGreaterThanOrEqual(3);
  });

  it("rejects a claim with no source and no firstParty declaration (R54)", () => {
    const { pkg } = scaffold();
    const broken = withClaims(pkg, (claims) => {
      const claim = claims[0] as Claim;
      delete claim.sources;
      delete claim.firstParty;
    });
    expect(validateOntologyPackage(broken).findings.map((f) => f.code)).toContain("OO-P-NO-SOURCE");
  });

  it("requires a runId on agent-authored claims (R55)", () => {
    const { pkg } = scaffold();
    const broken = withClaims(pkg, (claims) => {
      (claims[0] as Claim).assertedBy = "agent:research-mapper";
    });
    expect(validateOntologyPackage(broken).findings.map((f) => f.code)).toContain("OO-P-NO-RUN");
  });

  it("requires derivedFrom on derived claims (R56)", () => {
    const { pkg } = scaffold();
    const broken = withClaims(pkg, (claims) => {
      (claims[0] as Claim).status = "derived";
    });
    expect(validateOntologyPackage(broken).findings.map((f) => f.code)).toContain("OO-P-NO-DERIVATION");
  });

  it("rejects validTime.to before validTime.from", () => {
    const { pkg } = scaffold();
    const broken = withClaims(pkg, (claims) => {
      (claims[0] as Claim).validTime = { from: "2026-05-01T00:00:00Z", to: "2026-01-01T00:00:00Z" };
    });
    expect(validateOntologyPackage(broken).findings.map((f) => f.code)).toContain("OO-G-TEMPORAL-ORDER");
  });

  it("catches duplicate ids", () => {
    const { pkg } = scaffold();
    const broken = structuredClone(pkg);
    broken.data.entities.push(structuredClone(broken.data.entities[0]));
    expect(validateOntologyPackage(broken).findings.map((f) => f.code)).toContain("OO-G-DUPLICATE-ID");
  });

  it("treats unknown predicates as warnings by default and errors in strict mode (R75)", () => {
    const { pkg } = scaffold();
    const broken = withClaims(pkg, (claims) => {
      (claims[0] as Claim).predicate = "notDeclared";
    });
    const lenient = validateOntologyPackage(broken);
    const strict = validateOntologyPackage(broken, { strict: true });
    expect(lenient.findings.find((f) => f.code === "OO-G-UNKNOWN-PREDICATE")?.severity).toBe("warning");
    expect(strict.findings.find((f) => f.code === "OO-G-UNKNOWN-PREDICATE")?.severity).toBe("error");
    expect(lenient.ok).toBe(true);
    expect(strict.ok).toBe(false);
  });

  it("flags a schema-invalid object with its path", () => {
    const { pkg } = scaffold();
    const broken = structuredClone(pkg);
    delete (broken.data.entities[0] as Partial<{ canonicalName: string }>).canonicalName;
    const report = validateOntologyPackage(broken);
    const finding = report.findings.find((f) => f.code === "OO-S-OBJECT");
    expect(finding).toBeDefined();
    expect(finding?.path).toMatch(/^\/0/);
  });
});

describe("provenance policy", () => {
  it("raises a policy finding for an over-long excerpt", () => {
    const { pkg } = scaffold();
    const withEvidence = structuredClone(pkg);
    withEvidence.data.evidence.push({
      openontology: OPENONTOLOGY_VERSION,
      kind: "Evidence",
      id: "test:evidence:1",
      source: "test:source:team-page",
      selector: { type: "line-range", start: 1, end: 2 },
      excerpt: "x".repeat(600)
    });
    const report = validateOntologyPackage(withEvidence, { maxExcerptLength: 500 });
    const finding = report.findings.find((f) => f.code === "OO-P-EXCERPT-LENGTH");
    expect(finding?.severity).toBe("policy");
    // A policy finding is not an error: the package still validates.
    expect(report.ok).toBe(true);
  });

  it("rejects public evidence drawn from a private source", () => {
    const { pkg } = scaffold();
    const copy = structuredClone(pkg);
    copy.data.sources[0].visibility = "private";
    copy.data.evidence.push({
      openontology: OPENONTOLOGY_VERSION,
      kind: "Evidence",
      id: "test:evidence:2",
      source: copy.data.sources[0].id,
      selector: { type: "whole-document" },
      visibility: "public"
    });
    expect(validateOntologyPackage(copy).findings.map((f) => f.code)).toContain("OO-P-VISIBILITY");
  });
});

describe("constraints", () => {
  it("reports a violation of a declared required-predicate constraint", () => {
    const { pkg } = scaffold();
    const broken = structuredClone(pkg);
    broken.data.claims = broken.data.claims.filter((c) => c.predicate !== "homepage");
    const report = validateOntologyPackage(broken);
    const violations = report.findings.filter((f) => f.code === "OO-C-REQUIRED-PREDICATE");
    expect(violations).toHaveLength(3);
    expect(violations[0].severity).toBe("warning");
  });
});

describe("report rendering", () => {
  it("renders text, json, yaml, and markdown (R71)", () => {
    const { pkg } = scaffold();
    const report = validateOntologyPackage(pkg);
    expect(renderReport(report, "text")).toContain("OpenOntology package is valid.");
    expect(JSON.parse(renderReport(report, "json")).ok).toBe(true);
    expect(renderReport(report, "yaml")).toContain("ok: true");
    expect(renderReport(report, "markdown")).toContain("# Validation passed");
  });

  it("gives every finding a stable code and a remediation hint where known", () => {
    const { pkg } = scaffold();
    const broken = withClaims(pkg, (claims) => {
      delete (claims[0] as Claim).sources;
    });
    const finding = validateOntologyPackage(broken).findings.find((f) => f.code === "OO-P-NO-SOURCE");
    expect(finding?.hint).toMatch(/firstParty/);
  });
});
