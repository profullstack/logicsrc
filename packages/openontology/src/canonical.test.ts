import { describe, expect, it } from "vitest";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { canonicalize, canonicalObject, digest, packageDigest } from "./canonical.js";
import { idForm, isValidId, toIri, createIdFactory } from "./ids.js";

describe("canonical JSON", () => {
  it("sorts object keys so key order never changes the bytes", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ a: 2, b: 1 })).toBe(canonicalize({ b: 1, a: 2 }));
  });

  it("sorts nested keys and preserves array order", () => {
    const value = { z: [{ y: 1, x: 2 }], a: { d: 4, c: 3 } };
    expect(canonicalize(value)).toBe('{"a":{"c":3,"d":4},"z":[{"x":2,"y":1}]}');
  });

  it("drops undefined members but keeps explicit nulls", () => {
    expect(canonicalize({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("normalizes -0 so it cannot produce a second digest", () => {
    expect(digest({ n: -0 })).toBe(digest({ n: 0 }));
  });

  it("refuses non-finite numbers rather than emitting null", () => {
    expect(() => canonicalize({ n: Number.NaN })).toThrow(/non-finite/);
  });

  it("produces the same digest for YAML- and JSON-authored input (R16/R17)", () => {
    const object = { kind: "Entity", id: "x:person:a", aliases: ["a", "b"], nested: { k: 1 } };
    const fromJson = JSON.parse(JSON.stringify(object)) as unknown;
    const fromYaml = parseYaml(toYaml(object)) as unknown;
    expect(digest(fromYaml)).toBe(digest(fromJson));
  });

  it("round-trips through canonicalObject", () => {
    const object = { b: 1, a: { d: [3, 2], c: undefined } };
    expect(canonicalize(canonicalObject(object))).toBe(canonicalize(object));
  });

  it("changes the package digest when any file digest changes", () => {
    const manifest = { id: "p", version: "0.1.0" };
    const a = packageDigest(manifest, [{ path: "data/claims.ndjson", digest: "sha256:aa" }]);
    const b = packageDigest(manifest, [{ path: "data/claims.ndjson", digest: "sha256:bb" }]);
    expect(a).not.toBe(b);
  });

  it("is insensitive to the order files are listed in", () => {
    const manifest = { id: "p" };
    const files = [
      { path: "b.ndjson", digest: "sha256:bb" },
      { path: "a.ndjson", digest: "sha256:aa" }
    ];
    expect(packageDigest(manifest, files)).toBe(packageDigest(manifest, [...files].reverse()));
  });
});

describe("identifier profile", () => {
  it("recognizes the three accepted forms", () => {
    expect(idForm("ethereum:person:alice")).toBe("compact");
    expect(idForm("https://example.org/person/alice")).toBe("iri");
    expect(idForm("urn:logicsrc:ethereum:person:alice")).toBe("urn");
    expect(idForm("not an id")).toBeNull();
    expect(isValidId("Person")).toBe(false);
  });

  it("canonicalizes compact ids against the package namespace", () => {
    expect(
      toIri("ethereum:person:alice", { defaultNamespace: "https://logicsrc.com/ontology/ethereum/" })
    ).toBe("https://logicsrc.com/ontology/ethereum/person/alice");
  });

  it("adds the trailing slash when a namespace omits it", () => {
    expect(toIri("x:person:a", { defaultNamespace: "https://example.org/ns" })).toBe(
      "https://example.org/ns/person/a"
    );
  });

  it("leaves IRIs and URNs untouched", () => {
    const iri = "https://example.org/person/alice";
    expect(toIri(iri, { defaultNamespace: "https://other.example/" })).toBe(iri);
    const urn = "urn:logicsrc:person:alice";
    expect(toIri(urn, { defaultNamespace: "https://other.example/" })).toBe(urn);
  });

  it("honours per-prefix namespaces for imported packages", () => {
    expect(
      toIri("other:person:bob", {
        defaultNamespace: "https://example.org/mine/",
        namespaces: { other: "https://example.org/theirs/" }
      })
    ).toBe("https://example.org/theirs/person/bob");
  });

  it("generates deterministic sequential ids", () => {
    const next = createIdFactory("claim");
    expect([next(), next()]).toEqual(["claim:000001", "claim:000002"]);
  });
});
