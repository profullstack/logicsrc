import { afterAll, describe, expect, it } from "vitest";
import { OpenContext } from "./index.js";
import { cleanupProjects, isoDaysAgo, isoDaysAhead, makeProject, NOW } from "./test-helpers.js";
import { computeLifecycle, isApproved, isReviewOverdue } from "./lifecycle.js";
import { authorityRank, compareCandidates } from "./authority.js";
import type { ContextObject, Manifest } from "./types.js";

afterAll(cleanupProjects);

const AT = NOW.toISOString();

function baseManifest(extra: Partial<Manifest> = {}): Partial<Manifest> {
  return {
    id: "test",
    collections: { policies: "./context/policies/**" },
    roles: { everyone: { include: ["*"] } },
    ...extra
  };
}

describe("lifecycle", () => {
  const manifest: Manifest = { opencontext: "1.0", id: "t", freshness: { default_ttl: "30d" } };

  it("computes current, stale, expired, and future against the timestamp", () => {
    const at = { asOf: NOW, manifest };
    expect(computeLifecycle({ id: "a", type: "n", updated: isoDaysAgo(1) }, at)).toBe("current");
    expect(computeLifecycle({ id: "a", type: "n", updated: isoDaysAgo(90) }, at)).toBe("stale");
    expect(computeLifecycle({ id: "a", type: "n", expires: isoDaysAgo(1) }, at)).toBe("expired");
    expect(computeLifecycle({ id: "a", type: "n", valid_from: isoDaysAhead(30) }, at)).toBe("future");
  });

  it("treats explicit null expiry as never expiring", () => {
    // `expires: null` is a statement; omitting the field is not.
    const object: ContextObject = { id: "a", type: "n", updated: isoDaysAgo(1), expires: null };
    expect(computeLifecycle(object, { asOf: NOW, manifest })).toBe("current");
  });

  it("lets a per-object ttl override the repository default", () => {
    const object: ContextObject = { id: "a", type: "n", updated: isoDaysAgo(90), ttl: "365d" };
    expect(computeLifecycle(object, { asOf: NOW, manifest })).toBe("current");
  });

  it("ranks supersession above every other state", () => {
    const object: ContextObject = { id: "a", type: "n", expires: isoDaysAgo(1) };
    expect(computeLifecycle(object, { asOf: NOW, manifest, superseded: new Set(["a"]) })).toBe("superseded");
  });

  it("holds back drafts and counts approvals against the minimum", () => {
    expect(isApproved({ id: "a", type: "n", status: "draft" })).toBe(false);
    expect(isApproved({ id: "a", type: "n" })).toBe(true);
    expect(
      isApproved({ id: "a", type: "n", approval: { required: true, minimum: 2, approved_by: [{ role: "cto" }] } })
    ).toBe(false);
    expect(
      isApproved({
        id: "a",
        type: "n",
        approval: { required: true, minimum: 2, approved_by: [{ role: "cto" }, { role: "cfo" }] }
      })
    ).toBe(true);
  });

  it("detects an overdue review", () => {
    const manifestWithReview: Manifest = { opencontext: "1.0", id: "t", review: { interval: "180d" } };
    expect(isReviewOverdue({ id: "a", type: "n", updated: isoDaysAgo(365) }, NOW, manifestWithReview)).toBe(true);
    expect(isReviewOverdue({ id: "a", type: "n", updated: isoDaysAgo(10) }, NOW, manifestWithReview)).toBe(false);
  });
});

describe("authority ordering", () => {
  const manifest: Manifest = { opencontext: "1.0", id: "t" };

  it("ranks canonical above historical by default", () => {
    const precedence = ["canonical", "approved", "reference", "observed", "inferred", "historical"] as const;
    expect(authorityRank("canonical", [...precedence])).toBeLessThan(authorityRank("historical", [...precedence]));
  });

  it("sorts an unknown authority last rather than first", () => {
    const precedence = ["canonical", "approved", "reference", "observed", "inferred", "historical"] as const;
    expect(authorityRank("gospel" as never, [...precedence])).toBe(precedence.length);
  });

  it("prefers canonical over reference", () => {
    const a: ContextObject = { id: "x", type: "p", authority: "canonical" };
    const b: ContextObject = { id: "x", type: "p", authority: "reference" };
    expect(compareCandidates(a, b, manifest)).toBeLessThan(0);
  });

  it("breaks an authority tie by version, then id, so ordering is total", () => {
    const a: ContextObject = { id: "x", type: "p", authority: "canonical", version: 2 };
    const b: ContextObject = { id: "x", type: "p", authority: "canonical", version: 1 };
    expect(compareCandidates(a, b, manifest)).toBeLessThan(0);

    const c: ContextObject = { id: "aaa", type: "p", authority: "canonical" };
    const d: ContextObject = { id: "zzz", type: "p", authority: "canonical" };
    expect(compareCandidates(c, d, manifest)).toBeLessThan(0);
    expect(compareCandidates(c, c, manifest)).toBe(0);
  });
});

describe("resolution pipeline", () => {
  it("excludes superseded versions and keeps the newest", async () => {
    const dir = makeProject({
      manifest: baseManifest({ collections: { pricing: "./context/pricing/**" } }),
      objects: {
        "context/pricing/a.md": { id: "pricing.enterprise", type: "policy", version: 1, authority: "canonical", content: "1800" },
        "context/pricing/b.md": {
          id: "pricing.enterprise",
          type: "policy",
          version: 2,
          authority: "canonical",
          supersedes: ["pricing.enterprise@1"],
          content: "2500"
        }
      }
    });

    const oc = await OpenContext.load(dir);
    const { bundle, excluded } = oc.resolve({ role: "everyone", at: AT, explain: true });

    expect(bundle.objects).toHaveLength(1);
    expect(bundle.objects[0]!.version).toBe(2);
    expect(bundle.objects[0]!.content).toContain("2500");
    expect(excluded.some((item) => item.reason === "superseded")).toBe(true);
  });

  it("returns superseded context when history is requested", async () => {
    const dir = makeProject({
      manifest: baseManifest({ collections: { pricing: "./context/pricing/**" } }),
      objects: {
        "context/pricing/a.md": { id: "pricing.enterprise", type: "policy", version: 1, authority: "canonical", content: "1800" },
        "context/pricing/b.md": {
          id: "pricing.enterprise",
          type: "policy",
          version: 2,
          authority: "canonical",
          supersedes: ["pricing.enterprise@1"],
          content: "2500"
        }
      }
    });

    const oc = await OpenContext.load(dir);
    const { bundle } = oc.resolve({ role: "everyone", at: AT, includeHistorical: true });
    expect(bundle.objects).toHaveLength(2);
  });

  it("resolves stale context but warns about it", async () => {
    const dir = makeProject({
      manifest: baseManifest({ freshness: { default_ttl: "30d" } }),
      objects: {
        "context/policies/old.md": { id: "policies.old", type: "policy", updated: isoDaysAgo(200), content: "old" }
      }
    });

    const oc = await OpenContext.load(dir);
    const { bundle } = oc.resolve({ role: "everyone", at: AT });

    // Staleness is a warning, never a silent omission: dropping it would hide
    // the very thing the operator needs to see.
    expect(bundle.objects.map((object) => object.id)).toContain("policies.old");
    expect(bundle.warnings?.some((warning) => warning.code === "stale")).toBe(true);
    expect(bundle.objects[0]!.lifecycle).toBe("stale");
  });

  it("keeps unauthorized context out of the bundle entirely", async () => {
    const dir = makeProject({
      manifest: baseManifest({
        roles: { support: { include: ["policies.*"], exclude: ["policies.internal.*"] } }
      }),
      objects: {
        "context/policies/refunds.md": { id: "policies.refunds", type: "policy", content: "public-ish" },
        "context/policies/internal/margins.md": { id: "policies.internal.margins", type: "policy", content: "SECRET MARGIN" }
      }
    });

    const oc = await OpenContext.load(dir);
    const { bundle } = oc.resolve({ role: "support", at: AT, explain: true });

    const serialized = JSON.stringify(bundle.objects);
    expect(serialized).not.toContain("SECRET MARGIN");
    expect(bundle.objects.map((object) => object.id)).toEqual(["policies.refunds"]);
  });

  it("orders the bundle by layer, then authority, then id", async () => {
    const dir = makeProject({
      manifest: baseManifest(),
      objects: {
        "context/policies/z.md": { id: "policies.z", type: "policy", layer: "L5", content: "z" },
        "context/policies/a.md": { id: "policies.a", type: "policy", layer: "L0", content: "a" },
        "context/policies/m.md": { id: "policies.m", type: "policy", layer: "L3", content: "m" }
      }
    });

    const oc = await OpenContext.load(dir);
    const { bundle } = oc.resolve({ role: "everyone", at: AT });
    expect(bundle.objects.map((object) => object.id)).toEqual(["policies.a", "policies.m", "policies.z"]);
  });

  it("produces an identical digest for identical inputs and source state", async () => {
    const dir = makeProject({
      manifest: baseManifest(),
      objects: {
        "context/policies/a.md": { id: "policies.a", type: "policy", content: "a", updated: isoDaysAgo(1) }
      }
    });

    const one = await OpenContext.load(dir);
    const two = await OpenContext.load(dir);

    const first = one.bundle({ role: "everyone", task: "refund", at: AT });
    const second = two.bundle({ role: "everyone", task: "refund", at: AT });

    expect(first.digest).toBe(second.digest);
    expect(first.bundle_id).toBe(second.bundle_id);
  });

  it("changes the digest when the resolved context changes", async () => {
    const dir = makeProject({
      manifest: baseManifest(),
      objects: { "context/policies/a.md": { id: "policies.a", type: "policy", content: "a" } }
    });
    const other = makeProject({
      manifest: baseManifest(),
      objects: {
        "context/policies/a.md": { id: "policies.a", type: "policy", content: "a" },
        "context/policies/b.md": { id: "policies.b", type: "policy", content: "b" }
      }
    });

    const first = (await OpenContext.load(dir)).bundle({ role: "everyone", at: AT });
    const second = (await OpenContext.load(other)).bundle({ role: "everyone", at: AT });
    expect(first.digest).not.toBe(second.digest);
  });

  it("gives two roles genuinely different bundles from one repository", async () => {
    const dir = makeProject({
      manifest: baseManifest({
        collections: { policies: "./context/policies/**", decisions: "./context/decisions/**" },
        roles: {
          support: { include: ["policies.*"] },
          engineering: { include: ["decisions.*"] }
        }
      }),
      objects: {
        "context/policies/refunds.md": { id: "policies.refunds", type: "policy", content: "refunds" },
        "context/decisions/d1.md": { id: "decisions.d1", type: "decision", title: "D1", content: "x", decision: "Do X." }
      }
    });

    const oc = await OpenContext.load(dir);
    const support = oc.bundle({ role: "support", at: AT });
    const engineering = oc.bundle({ role: "engineering", at: AT });

    expect(support.objects.map((o) => o.id)).toEqual(["policies.refunds"]);
    expect(engineering.objects.map((o) => o.id)).toEqual(["decisions.d1"]);
    expect(support.digest).not.toBe(engineering.digest);
  });

  it("redacts after authorizing, and says that it did without saying what", async () => {
    const dir = makeProject({
      manifest: baseManifest({
        collections: { customers: "./context/customers/**" },
        roles: { support: { include: ["customers.*"], max_classification: "confidential", redact: [{ path: "ssn" }] } }
      }),
      files: {
        "context/customers/acme.json": JSON.stringify({
          id: "customers.acme",
          type: "customer",
          classification: "confidential",
          content: { name: "ACME", ssn: "000-00-0000" }
        })
      }
    });

    const oc = await OpenContext.load(dir);
    const { bundle } = oc.resolve({ role: "support", at: AT });

    const object = bundle.objects[0]!;
    expect((object.content as Record<string, unknown>).name).toBe("ACME");
    expect((object.content as Record<string, unknown>).ssn).toBeUndefined();
    expect(object.redacted).toEqual(["ssn"]);
    expect(JSON.stringify(bundle)).not.toContain("000-00-0000");
    expect(bundle.stats?.redacted).toBe(1);
  });

  it("trims by relevance only when asked, and reports what it trimmed", async () => {
    const dir = makeProject({
      manifest: baseManifest(),
      objects: {
        "context/policies/refunds.md": { id: "policies.refunds", type: "policy", title: "Refund policy", content: "refunds" },
        "context/policies/payroll.md": { id: "policies.payroll", type: "policy", title: "Payroll", content: "payroll" }
      }
    });

    const oc = await OpenContext.load(dir);

    // Default keeps everything authorized: trimming silently would be worse
    // than a large bundle.
    expect(oc.bundle({ role: "everyone", task: "refund", at: AT }).objects).toHaveLength(2);

    const trimmed = oc.resolve({ role: "everyone", task: "refund", at: AT, limit: 1, explain: true });
    expect(trimmed.bundle.objects.map((o) => o.id)).toEqual(["policies.refunds"]);
    expect(trimmed.excluded.some((item) => item.reason === "not-relevant")).toBe(true);
  });

  it("preserves provenance and namespaced extensions through compilation", async () => {
    const dir = makeProject({
      manifest: baseManifest(),
      objects: {
        "context/policies/a.md": {
          id: "policies.a",
          type: "policy",
          content: "a",
          sources: [{ uri: "crm://policies/a", type: "canonical-record" }],
          extensions: { "com.example.risk": { score: 0.25 } }
        }
      }
    });

    const oc = await OpenContext.load(dir);
    const { bundle } = oc.resolve({ role: "everyone", at: AT });

    expect(bundle.provenance?.[0]?.sources?.some((source) => source.uri === "crm://policies/a")).toBe(true);
    expect(bundle.objects[0]!.extensions).toEqual({ "com.example.risk": { score: 0.25 } });
  });

  it("reports a declared conflict instead of quietly picking a side", async () => {
    const dir = makeProject({
      manifest: baseManifest(),
      objects: {
        "context/policies/a.md": {
          id: "policies.a",
          type: "policy",
          authority: "canonical",
          conflicts_with: ["policies.b"],
          content: "30 days"
        },
        "context/policies/b.md": { id: "policies.b", type: "policy", authority: "observed", content: "60 days" }
      }
    });

    const oc = await OpenContext.load(dir);
    const { bundle } = oc.resolve({ role: "everyone", at: AT });
    expect(bundle.warnings?.some((warning) => warning.code === "conflict-declared")).toBe(true);
  });

  it("cannot be widened by --include", async () => {
    const dir = makeProject({
      manifest: baseManifest({ roles: { support: { include: ["policies.refunds"] } } }),
      objects: {
        "context/policies/refunds.md": { id: "policies.refunds", type: "policy", content: "in scope" },
        "context/policies/payroll.md": { id: "policies.payroll", type: "policy", content: "out of scope" }
      }
    });

    const oc = await OpenContext.load(dir);
    const { bundle } = oc.resolve({ role: "support", at: AT, include: ["policies.payroll"] });
    expect(bundle.objects.map((o) => o.id)).not.toContain("policies.payroll");
  });
});

describe("list, get, search, graph", () => {
  async function project(): Promise<OpenContext> {
    const dir = makeProject({
      manifest: baseManifest({
        roles: { support: { include: ["policies.refunds"] }, everyone: { include: ["*"] } }
      }),
      objects: {
        "context/policies/refunds.md": {
          id: "policies.refunds",
          type: "policy",
          title: "Refund policy",
          tags: ["refunds"],
          content: "Refund requests are accepted within 30 days.",
          references: ["policies.payroll"]
        },
        "context/policies/payroll.md": { id: "policies.payroll", type: "policy", title: "Payroll", content: "25th" }
      }
    });
    return OpenContext.load(dir);
  }

  it("hides unauthorized objects from list", async () => {
    const oc = await project();
    const scope = oc.scope({ role: "support" });
    expect(oc.list({ scope }).map((entry) => entry.id)).toEqual(["policies.refunds"]);
    expect(oc.list().map((entry) => entry.id)).toEqual(["policies.payroll", "policies.refunds"]);
  });

  it("makes a denied read indistinguishable from a missing object", async () => {
    const oc = await project();
    const scope = oc.scope({ role: "support" });
    expect(oc.get("policies.payroll", { scope })).toBeNull();
    expect(oc.get("policies.nonexistent", { scope })).toBeNull();
  });

  it("filters search by scope before returning content", async () => {
    const oc = await project();
    const scope = oc.scope({ role: "support" });
    expect(oc.search("payroll", { scope })).toHaveLength(0);
    expect(oc.search("refund", { scope }).map((hit) => hit.id)).toEqual(["policies.refunds"]);
  });

  it("ranks a title match above a body-only match", async () => {
    const oc = await project();
    const hits = oc.search("refund");
    expect(hits[0]!.id).toBe("policies.refunds");
    expect(hits[0]!.matched).toContain("title");
  });

  it("builds a graph with reference edges", async () => {
    const oc = await project();
    const graph = oc.graph();
    expect(graph.nodes.map((node) => node.id)).toContain("policies.refunds");
    expect(graph.edges).toContainEqual({ from: "policies.refunds", to: "policies.payroll", kind: "references" });
  });

  it("reports history from declared versions", async () => {
    const dir = makeProject({
      manifest: baseManifest({ collections: { pricing: "./context/pricing/**" } }),
      objects: {
        "context/pricing/a.md": { id: "pricing.x", type: "policy", version: 1, updated: isoDaysAgo(100), content: "1" },
        "context/pricing/b.md": {
          id: "pricing.x",
          type: "policy",
          version: 2,
          updated: isoDaysAgo(1),
          supersedes: ["pricing.x@1"],
          content: "2"
        }
      }
    });
    const oc = await OpenContext.load(dir);
    const result = await oc.history("pricing.x", { at: AT });

    expect(result.entries.map((entry) => entry.version)).toEqual([1, 2]);
    expect(result.entries[0]!.lifecycle).toBe("superseded");
    expect(result.entries[1]!.lifecycle).toBe("current");
  });

  it("diffs two versions field by field", async () => {
    const dir = makeProject({
      manifest: baseManifest({ collections: { pricing: "./context/pricing/**" } }),
      objects: {
        "context/pricing/a.md": { id: "pricing.x", type: "policy", version: 1, authority: "reference", content: "1800" },
        "context/pricing/b.md": { id: "pricing.x", type: "policy", version: 2, authority: "canonical", content: "2500" }
      }
    });
    const oc = await OpenContext.load(dir);
    const diffs = oc.diff("pricing.x@1", "pricing.x@2");

    const changed = diffs.find((diff) => diff.id === "pricing.x");
    expect(changed?.status).toBe("changed");
    expect(changed?.changes.map((change) => change.field)).toEqual(expect.arrayContaining(["authority", "content", "version"]));
  });
});
