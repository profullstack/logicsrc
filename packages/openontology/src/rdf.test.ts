import { describe, expect, it } from "vitest";
import { exportTurtle, importTurtle } from "./rdf.js";
import { constraintsToShacl } from "./shacl.js";
import { packagePrefix } from "./jsonld.js";
import { loadPrdFixturePackage } from "./test-helpers.js";

const pkg = loadPrdFixturePackage();

describe("RDF/Turtle", () => {
  it("declares the prefixes it uses", () => {
    const { turtle } = exportTurtle(pkg);
    for (const prefix of ["oo:", "prov:", "rdf:", "rdfs:", "xsd:"]) {
      expect(turtle).toContain(`@prefix ${prefix}`);
    }
  });

  it("reifies claims so provenance survives the crossing", () => {
    const { turtle } = exportTurtle(pkg);
    expect(turtle).toContain("a oo:Claim");
    expect(turtle).toContain("rdf:subject");
    expect(turtle).toContain("prov:wasDerivedFrom");
    expect(turtle).toContain("prov:wasAttributedTo");
  });

  it("also emits the plain triple for asserted relationships", () => {
    const { turtle } = exportTurtle(pkg);
    const worksOn = turtle.split("\n").filter((line) => line.includes("worksOn"));
    // Reified (rdf:predicate) plus at least one direct triple.
    expect(worksOn.some((line) => line.includes("rdf:predicate"))).toBe(true);
    expect(worksOn.some((line) => !line.includes("rdf:predicate"))).toBe(true);
  });

  it("round-trips entities and claims through Turtle", () => {
    const { turtle } = exportTurtle(pkg);
    const back = importTurtle(turtle, { ...pkg.manifest, prefix: packagePrefix(pkg) });

    expect(back.entities.map((e) => e.id).sort()).toEqual(pkg.data.entities.map((e) => e.id).sort());
    expect(back.claims.map((c) => c.id).sort()).toEqual(pkg.data.claims.map((c) => c.id).sort());
    expect(back.unsupported).toEqual([]);

    const original = pkg.data.claims[0]!;
    const restored = back.claims.find((c) => c.id === original.id)!;
    expect(restored.subject).toBe(original.subject);
    expect(restored.predicate).toBe(original.predicate);
    expect(restored.object).toEqual(original.object);
    expect(restored.sources).toEqual(original.sources);
    expect(restored.confidence).toBe(original.confidence);
    expect(restored.validTime?.from).toBe(original.validTime?.from);
  });

  it("preserves a scalar property claim's value and type", () => {
    const { turtle } = exportTurtle(pkg);
    const back = importTurtle(turtle, { ...pkg.manifest, prefix: packagePrefix(pkg) });
    const homepage = back.claims.find((c) => c.predicate === "homepage")!;
    expect(homepage.object).toEqual({ value: "https://example.org/zk-prover" });
  });

  it("reports fields the profile cannot carry", () => {
    const copy = structuredClone(pkg);
    copy.data.claims[0]!.tags = ["zk"];
    copy.data.claims[0]!.license = "CC-BY-4.0";
    const { lossy } = exportTurtle(copy);
    const entry = lossy.find((l) => l.objectId === copy.data.claims[0]!.id);
    expect(entry?.fields).toEqual(expect.arrayContaining(["tags", "license"]));
  });

  it("counts what crossed the boundary", () => {
    const { counts } = exportTurtle(pkg);
    expect(counts.entities).toBe(pkg.data.entities.length);
    expect(counts.claims).toBe(pkg.data.claims.length);
    expect(counts.triples).toBeGreaterThan(counts.claims);
  });
});

describe("SHACL", () => {
  it("maps a required-predicate constraint to a node shape", () => {
    const { turtle, mapped } = constraintsToShacl(pkg);
    expect(mapped.map((m) => m.constraint)).toContain("project-has-homepage");
    expect(turtle).toContain("sh:NodeShape");
    expect(turtle).toContain("sh:targetClass ns:Project");
    expect(turtle).toContain("sh:minCount 1");
  });

  it("carries the constraint severity across", () => {
    const { turtle } = constraintsToShacl(pkg);
    expect(turtle).toContain("sh:Warning");
  });

  it("reports uniqueness and query constraints as unmappable rather than faking them", () => {
    const copy = structuredClone(pkg);
    copy.schema.constraints.push(
      {
        openontology: "0.1",
        kind: "Constraint",
        id: "unique-homepage",
        description: "Homepages are unique.",
        rule: { type: "unique", predicate: "homepage" }
      },
      {
        openontology: "0.1",
        kind: "Constraint",
        id: "needs-review",
        description: "No claims awaiting review.",
        rule: { type: "query", query: "contributors" }
      }
    );

    const { unmapped, turtle } = constraintsToShacl(copy);
    expect(unmapped.map((u) => u.constraint)).toEqual(["unique-homepage", "needs-review"]);
    expect(unmapped[0]!.reason).toMatch(/SPARQLConstraint/);
    // The gap is stated in the output itself, not just in a return value.
    expect(turtle).toContain("# unmapped: unique-homepage");
  });
});
