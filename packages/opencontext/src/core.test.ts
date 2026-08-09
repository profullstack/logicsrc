import { describe, expect, it } from "vitest";
import { compareIds, deriveId, isValidId, isValidScopePattern, matchPattern, matchesPrincipal, parseRef } from "./ids.js";
import { globToRegExp, staticPrefix, normalizePattern } from "./glob.js";
import { formatAge, parseDuration, parseTimestamp, resolveAsOf } from "./time.js";
import { bundleIdFromDigest, canonicalJson, digestBundle, digestOf, sha256Uri } from "./digest.js";
import { parseContextDocument, findFieldLine } from "./parse.js";
import { defaultTypeFor } from "./store.js";

describe("id patterns", () => {
  it("matches whole dotted segments only", () => {
    expect(matchPattern("products.*", "products.enterprise")).toBe(true);
    expect(matchPattern("products.*", "products")).toBe(true);
    expect(matchPattern("products.*", "products.enterprise.pricing")).toBe(true);

    // The bug this guards against: a prefix wildcard leaking into a sibling id
    // that merely starts with the same characters would silently widen access.
    expect(matchPattern("products.*", "products-internal")).toBe(false);
    expect(matchPattern("products.*", "productsx.thing")).toBe(false);
  });

  it("treats * as everything and anything else as exact", () => {
    expect(matchPattern("*", "anything.at.all")).toBe(true);
    expect(matchPattern("mission", "mission")).toBe(true);
    expect(matchPattern("mission", "mission.statement")).toBe(false);
  });

  it("matches exactly one segment for an interior wildcard", () => {
    expect(matchPattern("customers.*.churn-risk", "customers.acme.churn-risk")).toBe(true);
    expect(matchPattern("customers.*.churn-risk", "customers.northwind.churn-risk")).toBe(true);

    // Interior wildcards must not span segments, or "this field on any record"
    // would silently become "this whole subtree".
    expect(matchPattern("customers.*.churn-risk", "customers.acme.eu.churn-risk")).toBe(false);
    expect(matchPattern("customers.*.churn-risk", "customers.churn-risk")).toBe(false);
    expect(matchPattern("customers.*.churn-risk", "customers.acme.plan")).toBe(false);
  });

  it("keeps a trailing wildcard meaning the whole subtree", () => {
    expect(matchPattern("customers.*", "customers.acme.churn-risk")).toBe(true);
    expect(matchPattern("customers.*.*", "customers.acme.eu.churn-risk")).toBe(true);
    expect(matchPattern("*.churn-risk", "customers.churn-risk")).toBe(true);
    expect(matchPattern("*.churn-risk", "customers.acme.churn-risk")).toBe(false);
  });

  it("validates scope patterns", () => {
    expect(isValidScopePattern("customers.*.churn-risk")).toBe(true);
    expect(isValidScopePattern("policies.support.*")).toBe(true);
    expect(isValidScopePattern("*")).toBe(true);
    expect(isValidScopePattern("Policies.*")).toBe(false);
    expect(isValidScopePattern("policies.*support")).toBe(false);
  });

  it("parses and rejects references", () => {
    expect(parseRef("policy.refunds")).toEqual({ id: "policy.refunds" });
    expect(parseRef("policy.refunds@3")).toEqual({ id: "policy.refunds", version: 3 });
    expect(parseRef("policy.refunds@v3")).toBeNull();
    expect(parseRef("Policy.Refunds")).toBeNull();
  });

  it("validates ids", () => {
    expect(isValidId("decision.2026-08-09-model-provider")).toBe(true);
    expect(isValidId("policies.support.refund")).toBe(true);
    expect(isValidId("Policy Refunds")).toBe(false);
    expect(isValidId(".leading")).toBe(false);
  });

  it("matches principals including wildcards", () => {
    expect(matchesPrincipal(["support"], ["support-agent", "support"])).toBe(true);
    expect(matchesPrincipal(["*"], ["anyone"])).toBe(true);
    expect(matchesPrincipal(["team.*"], ["team.support"])).toBe(true);
    expect(matchesPrincipal(["finance"], ["support"])).toBe(false);
    expect(matchesPrincipal(undefined, ["support"])).toBe(false);
    expect(matchesPrincipal([], ["support"])).toBe(false);
  });

  it("derives ids from collection-relative paths", () => {
    expect(deriveId("policies", "refunds.md")).toBe("policies.refunds");
    expect(deriveId("policies", "support/refund.md")).toBe("policies.support.refund");
    expect(deriveId("policies", "Refund Policy (v2).md")).toBe("policies.refund-policy-v2");
    // index.md is the collection root, not a child named "index".
    expect(deriveId("policies", "support/index.md")).toBe("policies.support");
  });

  it("orders ids stably", () => {
    expect(compareIds("a", "b")).toBeLessThan(0);
    expect(compareIds("b", "a")).toBeGreaterThan(0);
    expect(compareIds("a", "a")).toBe(0);
  });
});

describe("globs", () => {
  it("expands ** across directories and * within one", () => {
    expect(globToRegExp("context/policies/**").test("context/policies/a.md")).toBe(true);
    expect(globToRegExp("context/policies/**").test("context/policies/sub/a.md")).toBe(true);

    expect(globToRegExp("context/policies/*.md").test("context/policies/a.md")).toBe(true);
    expect(globToRegExp("context/policies/*.md").test("context/policies/sub/a.md")).toBe(false);
  });

  it("lets **/ match zero directories", () => {
    expect(globToRegExp("a/**/b.md").test("a/b.md")).toBe(true);
    expect(globToRegExp("a/**/b.md").test("a/x/y/b.md")).toBe(true);
  });

  it("finds the static prefix", () => {
    expect(staticPrefix("context/policies/**")).toBe("context/policies");
    expect(staticPrefix("context/policies/*.md")).toBe("context/policies");
    expect(staticPrefix("context/mission.md")).toBe("context");
  });

  it("normalises leading ./ and trailing /", () => {
    expect(normalizePattern("./context/policies/")).toBe("context/policies");
  });
});

describe("durations and timestamps", () => {
  it("parses fixed-length durations", () => {
    expect(parseDuration("30d")).toBe(30 * 86_400_000);
    expect(parseDuration("12h")).toBe(12 * 3_600_000);
    expect(parseDuration("1y")).toBe(365 * 86_400_000);
    expect(parseDuration("30 days")).toBeNull();
    expect(parseDuration(undefined)).toBeNull();
  });

  it("reads a bare date as the end of that day", () => {
    // --at 2026-08-09 should include everything that happened during the 9th,
    // not only what existed at midnight.
    expect(resolveAsOf("2026-08-09").toISOString()).toBe("2026-08-09T23:59:59.999Z");
  });

  it("rejects an unparseable timestamp rather than defaulting to now", () => {
    expect(() => resolveAsOf("last tuesday")).toThrow(/Invalid timestamp/);
  });

  it("parses RFC 3339 instants", () => {
    expect(parseTimestamp("2026-08-09T15:00:00Z")?.toISOString()).toBe("2026-08-09T15:00:00.000Z");
    expect(parseTimestamp("nonsense")).toBeNull();
  });

  it("formats ages", () => {
    expect(formatAge(3_600_000 * 5)).toBe("5h");
    expect(formatAge(86_400_000 * 10)).toBe("10d");
  });
});

describe("canonical serialization and digests", () => {
  it("sorts keys so key order cannot change a digest", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(digestOf({ a: 1, b: 2 })).toBe(digestOf({ b: 2, a: 1 }));
  });

  it("drops undefined but preserves null", () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("canonicalises nested structures and dates", () => {
    expect(canonicalJson({ x: [{ b: 1, a: 2 }] })).toBe('{"x":[{"a":2,"b":1}]}');
    expect(canonicalJson({ d: new Date("2026-08-09T00:00:00Z") })).toBe('{"d":"2026-08-09T00:00:00.000Z"}');
  });

  it("excludes clock and self-referential fields from a bundle digest", () => {
    const base = { opencontext: "1.0", objects: [{ id: "a" }] };
    const one = digestBundle({ ...base, generated_at: "2026-01-01T00:00:00Z", as_of: "2026-01-01T00:00:00Z", digest: "x", bundle_id: "ocb_1" });
    const two = digestBundle({ ...base, generated_at: "2027-06-06T06:06:06Z", as_of: "2027-06-06T06:06:06Z", digest: "y", bundle_id: "ocb_2" });
    expect(one).toBe(two);
  });

  it("changes the digest when the selected context changes", () => {
    const one = digestBundle({ objects: [{ id: "a" }] });
    const two = digestBundle({ objects: [{ id: "a" }, { id: "b" }] });
    expect(one).not.toBe(two);
  });

  it("changes the digest when an exclusion changes", () => {
    const one = digestBundle({ objects: [], excluded: [{ id: "a", reason: "not-in-scope" }] });
    const two = digestBundle({ objects: [], excluded: [{ id: "a", reason: "permission-denied" }] });
    expect(one).not.toBe(two);
  });

  it("derives a stable bundle id from the digest", () => {
    const digest = sha256Uri("hello");
    expect(bundleIdFromDigest(digest)).toMatch(/^ocb_[0-9a-f]{16}$/);
    expect(bundleIdFromDigest(digest)).toBe(bundleIdFromDigest(digest));
  });

  it("refuses to canonicalise non-finite numbers", () => {
    expect(() => canonicalJson({ x: Number.NaN })).toThrow(/non-finite/);
  });
});

describe("document parsing", () => {
  it("reads front matter and body", () => {
    const parsed = parseContextDocument("---\nid: a\ntype: policy\n---\n\nBody text.\n", "a.md");
    expect(parsed.object.id).toBe("a");
    expect(parsed.object.content).toBe("Body text.\n");
    expect(parsed.format).toBe("markdown");
  });

  it("accepts Markdown with no front matter as content", () => {
    // Point OpenContext at an existing docs/ folder and it works; metadata is
    // added where governance actually matters.
    const parsed = parseContextDocument("Just prose.\n", "a.md");
    expect(parsed.object.content).toBe("Just prose.\n");
    expect(parsed.declaredKeys).toEqual([]);
  });

  it("does not let an empty body clobber declared content", () => {
    const parsed = parseContextDocument("---\nid: a\ncontent: declared\n---\n\n", "a.md");
    expect(parsed.object.content).toBe("declared");
  });

  it("parses YAML and JSON documents whole", () => {
    expect(parseContextDocument("id: a\ntype: policy\n", "a.yaml").object.id).toBe("a");
    expect(parseContextDocument('{"id":"a","type":"policy"}', "a.json").object.id).toBe("a");
  });

  it("reports parse errors with a file and a reason", () => {
    expect(() => parseContextDocument("[1,2", "a.json")).toThrow(/Invalid JSON/);
    expect(() => parseContextDocument("- a\n- b\n", "a.yaml")).toThrow(/Expected a context object/);
  });

  it("locates a field for diagnostics", () => {
    expect(findFieldLine("---\nid: a\nowner: b\n---\n", "owner")).toBe(3);
    expect(findFieldLine("id: a\n", "missing")).toBeUndefined();
  });
});

describe("type defaults", () => {
  it("de-pluralises a collection key", () => {
    expect(defaultTypeFor("policies", true)).toBe("policy");
    expect(defaultTypeFor("procedures", true)).toBe("procedure");
    expect(defaultTypeFor("decisions", true)).toBe("decision");
    expect(defaultTypeFor("knowledge", true)).toBe("knowledge");
    // A context: entry is named by its key, which is already singular.
    expect(defaultTypeFor("mission", false)).toBe("mission");
  });
});
