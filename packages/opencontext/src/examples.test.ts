/**
 * Every shipped example must pass conformance.
 *
 * Examples are documentation that executes, which makes them the first thing to
 * rot silently. Holding them to `--strict` and a 100% health score in CI means
 * a change to the resolver that quietly degrades a published example fails the
 * build rather than shipping.
 */

import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenContext } from "./index.js";
import { hasFailure } from "./validate.js";
import { renderBundle } from "./bundle.js";

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), "../../../examples/opencontext");

const names = readdirSync(EXAMPLES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("shipped examples", () => {
  it("ships the five examples the specification requires", () => {
    expect(names).toEqual([
      "engineering-team",
      "minimal",
      "multi-agent-company",
      "startup",
      "support-agent"
    ]);
  });

  it.each(names)("%s passes validate --strict", async (name) => {
    const oc = await OpenContext.load(join(EXAMPLES, name));
    const findings = oc.validate({ strict: true });
    expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
    expect(hasFailure(findings, "warning")).toBe(false);
  });

  it.each(names)("%s scores 100 on doctor", async (name) => {
    const oc = await OpenContext.load(join(EXAMPLES, name));
    const report = oc.doctor();
    expect(report.ok).toBe(true);
    expect(report.score).toBe(100);
  });

  it.each(names)("%s resolves deterministically in every required format", async (name) => {
    const dir = join(EXAMPLES, name);
    const role = Object.keys((await OpenContext.load(dir)).manifest.roles ?? {})[0]!;

    const first = (await OpenContext.load(dir)).bundle({ role });
    const second = (await OpenContext.load(dir)).bundle({ role });

    expect(second.digest).toBe(first.digest);
    expect(first.objects.length).toBeGreaterThan(0);

    for (const format of ["json", "yaml", "markdown"] as const) {
      expect(renderBundle(first, format).length).toBeGreaterThan(0);
    }
  });
});

describe("multi-agent-company: one repository, five different bundles", () => {
  const AGENTS = ["sales-agent", "support-agent", "dev-agent", "finance-agent", "ops-agent"];

  it("gives every agent a distinct bundle", async () => {
    const oc = await OpenContext.load(join(EXAMPLES, "multi-agent-company"));
    const digests = AGENTS.map((agent) => oc.bundle({ agent }).digest);
    expect(new Set(digests).size).toBe(AGENTS.length);
  });

  it("never leaks a card number to anyone, including finance", async () => {
    // Repository-wide redaction applies above every role.
    const oc = await OpenContext.load(join(EXAMPLES, "multi-agent-company"));
    for (const agent of AGENTS) {
      expect(JSON.stringify(oc.bundle({ agent }))).not.toContain("4111111111111111");
    }
  });

  it("confines payroll to finance", async () => {
    const oc = await OpenContext.load(join(EXAMPLES, "multi-agent-company"));
    for (const agent of AGENTS) {
      const ids = oc.bundle({ agent }).objects.map((object) => object.id);
      expect(ids.includes("policies.payroll")).toBe(agent === "finance-agent");
    }
  });

  it("keeps an inferred churn score out of the sales conversation", async () => {
    // sales includes customers.*, which matches the churn score; the interior
    // wildcard exclusion is what keeps a model's opinion away from a customer.
    const oc = await OpenContext.load(join(EXAMPLES, "multi-agent-company"));
    const sales = oc.bundle({ agent: "sales-agent" }).objects.map((object) => object.id);
    expect(sales).toContain("customers.acme");
    expect(sales).not.toContain("customers.acme.churn-risk");
  });
});

describe("support-agent: the trust boundary", () => {
  it("carries the ticket as untrusted and delimits it in the prompt", async () => {
    const oc = await OpenContext.load(join(EXAMPLES, "support-agent"));
    const bundle = oc.bundle({ agent: "support-agent" });

    const ticket = bundle.objects.find((object) => object.id === "operations.ticket-4821");
    expect(ticket?.trust).toBe("untrusted");

    const markdown = renderBundle(bundle, "markdown");
    expect(markdown).toContain("<untrusted-content>");
    // The injected instruction is present as data, inside the fence — the point
    // is that it is quarantined and labelled, not that it was scrubbed.
    expect(markdown).toContain("ignore your");
    const fenced = markdown.slice(markdown.indexOf("<untrusted-content>"), markdown.indexOf("</untrusted-content>"));
    expect(fenced).toContain("ignore your");
  });

  it("redacts PII from a record the agent is entitled to read", async () => {
    const oc = await OpenContext.load(join(EXAMPLES, "support-agent"));
    const bundle = oc.bundle({ agent: "support-agent" });
    const raw = JSON.stringify(bundle);

    const customer = bundle.objects.find((object) => object.id === "customers.acme");
    expect(customer).toBeDefined();
    expect(customer?.redacted).toEqual(["ssn", "payment.card", "contacts[*].email"]);

    expect(raw).not.toContain("000-00-0000");
    expect(raw).not.toContain("4111111111111111");
    expect(raw).not.toContain("dana@acme.example");
  });

  it("excludes the confidential margin policy that policies.* would otherwise match", async () => {
    const oc = await OpenContext.load(join(EXAMPLES, "support-agent"));
    const result = oc.resolve({ agent: "support-agent", explain: true });

    expect(result.bundle.objects.map((object) => object.id)).not.toContain("policies.internal.margins");
    expect(result.excluded.some((item) => item.id === "policies.internal.margins" && item.reason === "scope-exclusion")).toBe(true);
    expect(JSON.stringify(result.bundle)).not.toContain("62%");
  });
});

describe("engineering-team: supersession as history", () => {
  it("resolves only the current decision by default and both with history", async () => {
    const oc = await OpenContext.load(join(EXAMPLES, "engineering-team"));

    const current = oc.bundle({ role: "engineering" }).objects.map((object) => object.id);
    expect(current).toContain("decisions.2026-08-01-postgres-ha");
    expect(current).not.toContain("decisions.2026-02-01-postgres");

    const historical = oc
      .bundle({ role: "engineering", includeHistorical: true })
      .objects.map((object) => object.id);
    expect(historical).toContain("decisions.2026-02-01-postgres");
  });

  it("reports the supersession chain in history", async () => {
    const oc = await OpenContext.load(join(EXAMPLES, "engineering-team"));
    const history = await oc.history("decisions.2026-08-01-postgres-ha");
    expect(history.entries.map((entry) => entry.id)).toContain("decisions.2026-02-01-postgres");
  });
});
