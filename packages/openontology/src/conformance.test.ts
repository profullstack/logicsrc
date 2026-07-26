import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validate as validateSchema, type SchemaKind } from "@logicsrc/validators";
import { buildOntologyPackage, loadOntologyPackage } from "./package.js";
import { createOntologyEngine } from "./engine.js";
import { exportJsonLd, importJsonLd, packagePrefix } from "./jsonld.js";
import { localActor } from "./policy.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "../../schemas/fixtures/openontology");
const EXAMPLE = resolve(HERE, "../../../examples/openontology/ethereum-ecosystem");

type Conformance = {
  valid: Array<{ fixture: string; kind: SchemaKind }>;
  invalid: Array<{ fixture: string; kind: SchemaKind; reason: string }>;
};

const conformance = JSON.parse(readFileSync(join(FIXTURES, "conformance.json"), "utf8")) as Conformance;
const read = (relPath: string) => JSON.parse(readFileSync(join(FIXTURES, relPath), "utf8")) as unknown;

/**
 * The conformance bundle is the third-party contract (R27): these assertions
 * only touch published schemas and fixture files, so another implementation
 * can reproduce them without importing a line of the reference engine.
 */
describe("conformance fixtures", () => {
  it("has a fixture for every normative object", () => {
    const kinds = new Set(conformance.valid.map((entry) => entry.kind));
    expect(kinds).toEqual(
      new Set([
        "openontology-manifest",
        "openontology-namespace",
        "openontology-entity-type",
        "openontology-property",
        "openontology-relationship-type",
        "openontology-constraint",
        "openontology-query",
        "openontology-action",
        "openontology-entity",
        "openontology-claim",
        "openontology-source",
        "openontology-evidence",
        "openontology-changeset",
        "openontology-review",
        "openontology-approval",
        "openontology-event"
      ])
    );
  });

  it.each(conformance.valid)("$fixture validates as $kind", ({ fixture, kind }) => {
    const result = validateSchema(kind, read(fixture));
    if (!result.ok) {
      throw new Error(
        `${fixture} should validate but did not:\n${result.errors
          .map((e) => `  ${e.instancePath || "/"} ${e.message}`)
          .join("\n")}`
      );
    }
    expect(result.ok).toBe(true);
  });

  it.each(conformance.invalid)("$fixture is rejected: $reason", ({ fixture, kind }) => {
    const result = validateSchema(kind, read(fixture));
    expect(result.ok).toBe(false);
  });
});

/**
 * The Ethereum example is a demonstration, not a dependency (R195): if it is
 * removed, these tests skip rather than fail.
 */
const describeExample = existsSync(join(EXAMPLE, "openontology.yaml")) ? describe : describe.skip;

describeExample("ethereum ecosystem example", () => {
  const pkg = () => loadOntologyPackage(EXAMPLE);

  it("passes strict validation", () => {
    const loaded = pkg();
    const report = createOntologyEngine({ package: loaded, actor: localActor() }).validateOntologyPackage({
      strict: true,
      expectedDigest: buildOntologyPackage(loaded).digest
    });
    const errors = report.findings.filter((f) => f.severity === "error");
    expect(errors).toEqual([]);
  });

  it("meets the PRD's fixture-coverage bar", () => {
    const loaded = pkg();
    expect(loaded.schema.entityTypes.length).toBeGreaterThanOrEqual(10);
    expect(loaded.schema.relationships.length).toBeGreaterThanOrEqual(12);
    expect(loaded.data.entities.length).toBeGreaterThanOrEqual(50);
    expect(loaded.data.claims.length).toBeGreaterThanOrEqual(150);
    expect(loaded.data.sources.length).toBeGreaterThanOrEqual(25);
    expect(loaded.schema.queries.length).toBeGreaterThanOrEqual(5);
  });

  it("demonstrates every claim lifecycle state", () => {
    const byStatus = new Map<string, number>();
    for (const claim of pkg().data.claims) {
      byStatus.set(claim.status, (byStatus.get(claim.status) ?? 0) + 1);
    }
    for (const status of ["asserted", "proposed", "disputed", "retracted", "superseded", "derived"]) {
      expect(byStatus.get(status), `expected at least one ${status} claim`).toBeGreaterThanOrEqual(1);
    }
  });

  it("ships a pending merge proposal for the duplicate identity", () => {
    const loaded = pkg();
    const duplicates = loaded.data.entities.filter((e) => e.canonicalName.includes("Haddad"));
    expect(duplicates).toHaveLength(2);
    expect(existsSync(join(EXAMPLE, "changesets/merge-haddad.yaml"))).toBe(true);
  });

  it("answers a three-hop question and explains the answer", () => {
    const engine = createOntologyEngine({ package: pkg(), actor: localActor() });
    const result = engine.queryOntology("orgs-behind-a-network");
    expect(result.rows.length).toBeGreaterThan(0);

    const explanation = engine.explainOntologyResult(result.id, 0);
    // Four patterns matched, so the answer rests on four claims, each sourced.
    expect(explanation.claims).toHaveLength(4);
    for (const entry of explanation.claims) expect(entry.sources.length).toBeGreaterThan(0);
  });

  it("hides proposed, disputed, and retracted claims from the default view", () => {
    const engine = createOntologyEngine({ package: pkg(), actor: localActor() });
    const defaultView = engine.queryOntology({
      match: [{ subject: "?p", predicate: "worksOn", object: "?x", bindClaim: "?claim" }]
    });
    const everything = engine.queryOntology({
      match: [{ subject: "?p", predicate: "worksOn", object: "?x", bindClaim: "?claim" }],
      include: { claimStatus: ["asserted", "proposed", "disputed", "retracted", "superseded", "derived"] }
    });
    expect(everything.rows.length).toBeGreaterThan(defaultView.rows.length);
  });

  it("round-trips through JSON-LD without losing ids", () => {
    const loaded = pkg();
    const exported = exportJsonLd(loaded);
    const back = importJsonLd(exported.document, { ...loaded.manifest, prefix: packagePrefix(loaded) });
    expect(back.entities.map((e) => e.id).sort()).toEqual(loaded.data.entities.map((e) => e.id).sort());
    expect(back.claims.map((c) => c.id).sort()).toEqual(loaded.data.claims.map((c) => c.id).sort());
  });

  it("builds the same digest twice (deterministic build)", () => {
    expect(buildOntologyPackage(pkg()).digest).toBe(buildOntologyPackage(pkg()).digest);
  });
});
