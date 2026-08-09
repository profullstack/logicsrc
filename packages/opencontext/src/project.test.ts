/**
 * Project-level tests: the scaffold, doctor scoring, audit, writes, and the
 * launch acceptance criteria walked end to end.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OpenContext } from "./index.js";
import { initProject, scaffoldFiles, slugify } from "./scaffold.js";
import { computeScore, DEFAULT_WEIGHTS, renderHealth } from "./doctor.js";
import { hasFailure } from "./validate.js";
import { buildEvent, eventForBundle, isAuditEnabled, recordEvent } from "./audit.js";
import { renderBundle } from "./bundle.js";
import { cleanupProjects, isoDaysAgo, makeProject, NOW } from "./test-helpers.js";

afterAll(cleanupProjects);

const AT = NOW.toISOString();

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "opencontext-init-"));
}

describe("init scaffold", () => {
  it("generates a project that passes validate --strict with no edits", async () => {
    const dir = scratch();
    initProject(dir, { id: "acme", name: "ACME Corporation" });

    const oc = await OpenContext.load(dir);
    const findings = oc.validate({ strict: true });

    expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
    expect(hasFailure(findings, "warning")).toBe(false);
  });

  it("generates a project that scores 100 on doctor --strict", async () => {
    const dir = scratch();
    initProject(dir, { id: "acme", name: "ACME Corporation" });

    const oc = await OpenContext.load(dir);
    const report = oc.doctor({ strict: true });

    expect(report.ok).toBe(true);
    expect(report.score).toBe(100);
  });

  it("stamps the creation time so the scaffold is not born stale", () => {
    // A hardcoded date would make doctor report the scaffold as stale the moment
    // the default ttl elapsed, teaching on minute one that warnings are noise.
    const files = scaffoldFiles("acme", "ACME", new Date("2030-03-04T05:06:07Z"));
    expect(files["context/mission.md"]).toContain("updated: 2030-03-04T05:06:07.000Z");
    expect(Object.keys(files)).toContain("context/decisions/2030-03-04-adopt-opencontext.md");
  });

  it("defines two roles that resolve to different bundles", async () => {
    const dir = scratch();
    initProject(dir, { id: "acme", name: "ACME Corporation" });

    const oc = await OpenContext.load(dir);
    const support = oc.bundle({ role: "support" });
    const engineering = oc.bundle({ role: "engineering" });

    expect(support.objects.map((object) => object.id)).toContain("policies.refunds");
    expect(engineering.objects.map((object) => object.id)).not.toContain("policies.refunds");
    expect(support.digest).not.toBe(engineering.digest);
  });

  it("does not overwrite existing files unless forced", () => {
    const dir = scratch();
    initProject(dir, { id: "acme" });
    const second = initProject(dir, { id: "acme" });

    expect(second.created).toEqual([]);
    expect(second.skipped.length).toBeGreaterThan(0);
  });

  it("slugifies a namespace id", () => {
    expect(slugify("ACME Corporation")).toBe("acme-corporation");
    expect(slugify("!!!")).toBe("context");
  });
});

describe("doctor", () => {
  it("deducts more for a wrong answer than for an incomplete one", () => {
    // Anything that makes the resolver produce a wrong answer must cost more
    // than anything that merely makes it produce a stale one.
    expect(DEFAULT_WEIGHTS["duplicate-canonical"]!).toBeGreaterThan(DEFAULT_WEIGHTS.stale!);
    expect(DEFAULT_WEIGHTS["conflict-ambiguous"]!).toBeGreaterThan(DEFAULT_WEIGHTS.orphaned!);
    expect(DEFAULT_WEIGHTS["secret-detected"]!).toBeGreaterThan(DEFAULT_WEIGHTS["missing-owner"]!);
  });

  it("normalises the score by repository size", async () => {
    const dir = makeProject({
      manifest: { id: "t", collections: { policies: "./context/policies/**" } },
      objects: {
        "context/policies/a.md": { id: "policies.a", type: "policy", owner: "ops", content: "a" },
        "context/policies/b.md": { id: "policies.b", type: "policy", owner: "ops", content: "b" }
      }
    });
    const oc = await OpenContext.load(dir);

    expect(computeScore([], oc.store)).toBe(100);

    const one = computeScore([{ code: "stale", severity: "warning", message: "x" }], oc.store);
    expect(one).toBeLessThan(100);
    expect(one).toBeGreaterThan(0);
  });

  it("clamps the score at zero rather than going negative", async () => {
    const dir = makeProject({
      manifest: { id: "t", collections: { policies: "./context/policies/**" } },
      objects: { "context/policies/a.md": { id: "policies.a", type: "policy", content: "a" } }
    });
    const oc = await OpenContext.load(dir);

    const many = Array.from({ length: 50 }, () => ({
      code: "duplicate-canonical" as const,
      severity: "error" as const,
      message: "x"
    }));
    expect(computeScore(many, oc.store)).toBe(0);
  });

  it("fails a strict run below the configured minimum score", async () => {
    const dir = makeProject({
      manifest: {
        id: "t",
        collections: { policies: "./context/policies/**" },
        freshness: { default_ttl: "30d" },
        health: { minimum_score: 99 }
      },
      objects: {
        "context/policies/a.md": { id: "policies.a", type: "policy", updated: isoDaysAgo(400), content: "a" }
      }
    });
    const oc = await OpenContext.load(dir);
    const report = oc.doctor({ at: AT });

    expect(report.score).toBeLessThan(99);
    expect(report.ok).toBe(false);
  });

  it("renders a readable health report with aligned columns", async () => {
    const dir = scratch();
    initProject(dir, { id: "acme", name: "A Very Long Organization Name Indeed" });
    const oc = await OpenContext.load(dir);
    const report = oc.doctor();
    const text = renderHealth(report, oc.store);

    expect(text).toContain("OpenContext Health");
    expect(text).toContain("Context health: 100%");
    // Every row must land in the same column even when a title overflows.
    const rows = text.split("\n").filter((line) => /^(Orphaned|Conflicting|Expired|Stale|Missing|Broken)/.test(line));
    const positions = new Set(rows.map((row) => row.search(/\d+$/)));
    expect(positions.size).toBe(1);
  });

  it("reports unowned, orphaned, and broken-reference context", async () => {
    const dir = makeProject({
      manifest: {
        id: "t",
        collections: { policies: "./context/policies/**" },
        roles: { support: { include: ["policies.refunds"] } }
      },
      objects: {
        "context/policies/refunds.md": { id: "policies.refunds", type: "policy", owner: "support", content: "a", references: ["policies.ghost"] },
        "context/policies/lost.md": { id: "policies.lost", type: "policy", content: "nobody can see me" }
      }
    });
    const oc = await OpenContext.load(dir);
    const codes = oc.validate().map((finding) => finding.code);

    expect(codes).toContain("missing-owner");
    expect(codes).toContain("orphaned");
    expect(codes).toContain("broken-reference");
  });

  it("gives every finding a remediation an author can act on", async () => {
    const dir = makeProject({
      manifest: { id: "t", collections: { policies: "./context/policies/**" }, roles: { s: { include: ["policies.*"] } } },
      objects: { "context/policies/a.md": { id: "policies.a", type: "policy", content: "a" } }
    });
    const oc = await OpenContext.load(dir);
    const findings = oc.validate();

    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.message, `${finding.code} has no message`).toBeTruthy();
      expect(finding.remediation, `${finding.code} has no remediation`).toBeTruthy();
    }
  });
});

describe("audit", () => {
  it("records a resolution to a file sink when enabled", async () => {
    const dir = makeProject({
      manifest: {
        id: "t",
        collections: { policies: "./context/policies/**" },
        roles: { everyone: { include: ["*"] } },
        audit: { context_reads: true, sink: "file://./audit/events.ndjson" }
      },
      objects: { "context/policies/a.md": { id: "policies.a", type: "policy", content: "a" } }
    });

    const oc = await OpenContext.load(dir);
    const scope = oc.scope({ role: "everyone" });
    const result = oc.resolve({ role: "everyone", at: AT, explain: true });

    expect(isAuditEnabled(oc.manifest, "context.resolve")).toBe(true);

    const ctx = { manifest: oc.manifest, dir: oc.dir, scope };
    const event = eventForBundle(ctx, result.bundle, result.excluded.length);
    const written = recordEvent(ctx, event);

    expect(written.written).toBe(true);
    const line = JSON.parse(readFileSync(join(dir, "audit/events.ndjson"), "utf8").trim());
    expect(line.event).toBe("context.resolve");
    expect(line.bundle.digest).toBe(result.bundle.digest);
    expect(line.actor.roles).toContain("everyone");
  });

  it("records nothing when audit is not configured", async () => {
    const dir = makeProject({
      manifest: { id: "t", collections: { policies: "./context/policies/**" } },
      objects: { "context/policies/a.md": { id: "policies.a", type: "policy", content: "a" } }
    });
    const oc = await OpenContext.load(dir);

    expect(isAuditEnabled(oc.manifest, "context.read")).toBe(false);
    const ctx = { manifest: oc.manifest, dir: oc.dir };
    expect(recordEvent(ctx, buildEvent("context.read", ctx)).written).toBe(false);
  });
});

describe("writes", () => {
  it("adds an object into the matching collection directory", async () => {
    const dir = makeProject({
      manifest: { id: "t", collections: { policies: "./context/policies/**" } },
      objects: { "context/policies/a.md": { id: "policies.a", type: "policy", content: "a" } }
    });

    const oc = await OpenContext.load(dir);
    const result = oc.add({ id: "policies.returns", type: "policy", title: "Returns", content: "Within 14 days." });

    expect(result.file).toBe("context/policies/returns.md");
    expect(existsSync(join(dir, result.file))).toBe(true);

    const reloaded = await oc.reload();
    expect(reloaded.get("policies.returns")?.title).toBe("Returns");
  });

  it("supersedes without destroying the previous version", async () => {
    const dir = makeProject({
      manifest: { id: "t", collections: { pricing: "./context/pricing/**" } },
      objects: {
        "context/pricing/enterprise.md": {
          id: "pricing.enterprise",
          type: "policy",
          version: 1,
          authority: "reference",
          content: "1800"
        }
      }
    });

    const oc = await OpenContext.load(dir);
    const result = oc.supersede("pricing.enterprise", { changes: { content: "2500" } });

    expect(result.object.version).toBe(2);
    expect(result.object.supersedes).toEqual(["pricing.enterprise@1"]);
    // History survives: the old file is still on disk.
    expect(existsSync(join(dir, "context/pricing/enterprise.md"))).toBe(true);
    expect(existsSync(join(dir, result.file))).toBe(true);

    const reloaded = await oc.reload();
    const history = await reloaded.history("pricing.enterprise");
    expect(history.entries.map((entry) => entry.version)).toEqual([1, 2]);
    expect(history.entries[0]!.lifecycle).toBe("superseded");
  });
});

describe("launch acceptance criteria", () => {
  it("walks the full flow: init, conflict, staleness, resolve, explain, replace the agent", async () => {
    const dir = scratch();
    initProject(dir, { id: "acme", name: "ACME Corporation" });

    // 3-6: a valid repository with mission, policy, procedure, decisions, two roles.
    let oc = await OpenContext.load(dir);
    expect(oc.validate({ strict: true })).toEqual([]);
    expect(Object.keys(oc.manifest.roles ?? {})).toEqual(["support", "engineering"]);

    // 7: introduce a conflict deliberately and have it detected.
    oc.add(
      {
        id: "policies.refunds-rewrite",
        type: "policy",
        layer: "L3",
        owner: "support",
        authority: "canonical",
        conflicts_with: ["policies.refunds"],
        canonical_source: true,
        content: "Refunds within 60 days.",
        updated: new Date().toISOString()
      },
      { allowPromotion: true }
    );
    oc = await oc.reload();
    const conflictCodes = oc.validate().map((finding) => finding.code);
    expect(conflictCodes).toContain("conflict-ambiguous");

    // 8: mark something stale and have it detected.
    oc.supersede("policies.refunds-rewrite", {
      changes: { updated: isoDaysAgo(400, new Date()), content: "Refunds within 60 days." },
      allowPromotion: true
    });
    oc = await oc.reload();
    expect(oc.doctor().findings.map((finding) => finding.code)).toContain("stale");

    // 9-11: resolve for an agent, explain it, and get a digest with provenance.
    const supportAgent = oc.resolve({ agent: "support-agent", task: "customer asked for a refund", explain: true });
    expect(supportAgent.bundle.objects.length).toBeGreaterThan(0);
    expect(supportAgent.bundle.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(supportAgent.bundle.provenance?.length).toBe(supportAgent.bundle.objects.length);
    expect(supportAgent.excluded.length).toBeGreaterThan(0);

    // 12: replace the consumer and resolve the same context. This is the whole
    // point — the agent is replaceable, the context is not.
    const replacement = oc.resolve({ role: "support", task: "customer asked for a refund" });
    expect(replacement.bundle.objects.map((object) => object.id)).toEqual(
      supportAgent.bundle.objects.map((object) => object.id)
    );

    // 13: the same bundle is consumable in every required format.
    for (const format of ["json", "yaml", "markdown"] as const) {
      expect(renderBundle(supportAgent.bundle, format).length).toBeGreaterThan(0);
    }
    expect(JSON.parse(renderBundle(supportAgent.bundle, "json")).digest).toBe(supportAgent.bundle.digest);
  });
});
