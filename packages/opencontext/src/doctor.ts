/**
 * Context health.
 *
 * `doctor` is validation plus the questions that only make sense against a
 * clock: what has gone stale, what expired, what is overdue for review, whose
 * sources have broken. Context rot is quiet — nothing fails, agents just start
 * answering from last year's pricing — so the score exists to make the rot
 * visible on a dashboard and to give CI something to fail on.
 *
 * The formula is documented and configurable, because an undocumented score is
 * a number people learn to ignore:
 *
 *     deduction = Σ (weight[code] × affected objects) / max(objects, 1)
 *     score     = clamp(100 − deduction × 100, 0, 100)
 *
 * A weight is "how much of the repository's health one instance of this problem
 * costs". A single broken canonical conflict in a ten-object repository costs
 * far more than one in a thousand-object repository, which is the intent.
 */

import type { ContextStore, Diagnostic, DiagnosticCode, DiagnosticReport } from "./types.js";
import { computeLifecycle, isReviewOverdue } from "./lifecycle.js";
import { isSuperseded, resolveSupersession } from "./authority.js";
import { sortDiagnostics, validateStore, type ValidateOptions } from "./validate.js";
import { resolveAsOf } from "./time.js";
import { SPEC_VERSION } from "./manifest.js";

/**
 * Default weights.
 *
 * Anything that makes the resolver produce a *wrong* answer costs the most:
 * duplicate canonical objects, unsettleable conflicts, broken supersession.
 * Anything that merely makes it produce an *incomplete* answer costs less.
 */
export const DEFAULT_WEIGHTS: Partial<Record<DiagnosticCode, number>> = {
  "schema-invalid": 1.0,
  "manifest-invalid": 1.0,
  "duplicate-id": 1.0,
  "duplicate-canonical": 1.0,
  "conflict-ambiguous": 1.0,
  "broken-supersession": 0.8,
  "supersession-cycle": 0.8,
  "secret-detected": 1.0,
  "untrusted-canonical": 0.8,
  "path-traversal": 1.0,
  "unknown-scheme": 0.6,
  "source-unavailable": 0.6,
  "broken-reference": 0.5,
  "multiple-active-versions": 0.4,
  "conflict-declared": 0.3,
  "expired": 0.4,
  "missing-provenance": 0.3,
  "missing-digest": 0.2,
  "invalid-permission": 0.3,
  "unknown-role": 0.5,
  "role-cycle": 0.8,
  "missing-owner": 0.2,
  "stale": 0.15,
  "review-overdue": 0.15,
  "orphaned": 0.1,
  "unapproved": 0.1,
  "empty-scope": 0.1,
  "not-yet-valid": 0.05,
  "unknown-authority": 0.5,
  "unknown-extension": 0.1
};

export interface DoctorOptions extends ValidateOptions {
  at?: string | Date;
}

export function doctor(store: ContextStore, options: DoctorOptions = {}): DiagnosticReport {
  const asOf = resolveAsOf(options.at);
  const findings: Diagnostic[] = [...validateStore(store, options)];

  const supersession = resolveSupersession(store.objects, store.byId);

  for (const entry of store.objects) {
    const object = entry.object;
    if (isSuperseded(object, supersession.superseded)) continue;

    const lifecycle = computeLifecycle(object, { asOf, manifest: store.manifest });

    if (lifecycle === "stale") {
      findings.push({
        code: "stale",
        severity: store.manifest.freshness?.stale_is_error ? "error" : "warning",
        message: `${object.id} is stale — last updated ${object.updated ?? "never"}.`,
        id: object.id,
        file: entry.file,
        field: "updated",
        remediation: `Review it and bump updated, extend its ttl, or supersede it.`
      });
    }

    if (lifecycle === "expired") {
      findings.push({
        code: "expired",
        severity: "error",
        message: `${object.id} expired on ${object.expires}.`,
        id: object.id,
        file: entry.file,
        field: "expires",
        remediation: `Renew it, supersede it, or remove the expiry if it should be durable.`
      });
    }

    if (lifecycle === "future") {
      findings.push({
        code: "not-yet-valid",
        severity: "info",
        message: `${object.id} is not valid until ${object.valid_from}.`,
        id: object.id,
        file: entry.file,
        field: "valid_from"
      });
    }

    if (isReviewOverdue(object, asOf, store.manifest)) {
      findings.push({
        code: "review-overdue",
        severity: "warning",
        message: `${object.id} is overdue for review${object.review?.next_review ? ` (due ${object.review.next_review})` : ""}.`,
        id: object.id,
        file: entry.file,
        field: "review",
        remediation: `Review it and set review.last_review, or push review.next_review out deliberately.`
      });
    }
  }

  const sorted = sortDiagnostics(findings);
  const score = computeScore(sorted, store);
  const failOn = store.manifest.health?.fail_on ?? "error";
  const minimum = store.manifest.health?.minimum_score;

  const ok =
    !sorted.some((finding) => severityAtLeast(finding.severity, failOn)) &&
    (minimum === undefined || score >= minimum);

  return {
    opencontext: SPEC_VERSION,
    ok,
    generated_at: new Date().toISOString(),
    namespace: store.manifest.id,
    score,
    counts: countBy(sorted, store),
    findings: sorted
  };
}

export function computeScore(findings: Diagnostic[], store: ContextStore): number {
  const weights = { ...DEFAULT_WEIGHTS, ...(store.manifest.health?.weights ?? {}) } as Record<string, number>;
  const denominator = Math.max(store.objects.length, 1);

  let deduction = 0;
  for (const finding of findings) {
    deduction += weights[finding.code] ?? 0.1;
  }

  const score = 100 - (deduction / denominator) * 100;
  return Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;
}

function severityAtLeast(severity: string, threshold: string): boolean {
  const order = { error: 0, warning: 1, info: 2 } as Record<string, number>;
  return (order[severity] ?? 3) <= (order[threshold] ?? 0);
}

function countBy(findings: Diagnostic[], store: ContextStore): Record<string, number> {
  const count = (code: DiagnosticCode): number => findings.filter((finding) => finding.code === code).length;
  return {
    objects: store.objects.length,
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length,
    stale: count("stale"),
    expired: count("expired"),
    conflicting: count("conflict-ambiguous") + count("conflict-declared") + count("duplicate-canonical"),
    orphaned: count("orphaned"),
    missing_owner: count("missing-owner"),
    broken_sources: count("source-unavailable") + count("unknown-scheme")
  };
}

/** The human-readable health report. */
export function renderHealth(report: DiagnosticReport, store: ContextStore): string {
  const lines: string[] = [];
  const counts = report.counts ?? {};

  lines.push("OpenContext Health");
  lines.push("────────────────────────────────");

  // Named entries first: these are the objects a reader looks for by name.
  const named = store.objects
    .filter((entry) => !entry.collection)
    .slice(0, 8);

  for (const entry of named) {
    const issues = report.findings.filter((finding) => finding.id === entry.object.id);
    const worst = issues.find((finding) => finding.severity === "error") ?? issues[0];
    const status = worst
      ? `${worst.severity === "error" ? "✗" : "⚠"} ${worst.code}`
      : `✓ ${entry.object.authority ?? "current"}`;
    lines.push(`${column(entry.object.title ?? entry.object.id)}${status}`);
  }

  if (named.length > 0) lines.push("");

  const rows: Array<[string, number]> = [
    ["Orphaned context", counts.orphaned ?? 0],
    ["Conflicting context", counts.conflicting ?? 0],
    ["Expired context", counts.expired ?? 0],
    ["Stale context", counts.stale ?? 0],
    ["Missing owners", counts.missing_owner ?? 0],
    ["Broken sources", counts.broken_sources ?? 0]
  ];
  for (const [label, value] of rows) {
    lines.push(`${column(label)}${value}`);
  }

  lines.push("");
  lines.push(`Context health: ${report.score ?? 100}%`);

  if (report.findings.length > 0) {
    lines.push("");
    for (const finding of report.findings.slice(0, 40)) {
      const marker = finding.severity === "error" ? "✗" : finding.severity === "warning" ? "⚠" : "·";
      const where = finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})` : "";
      lines.push(`  ${marker} ${finding.code}: ${finding.message}${where}`);
      if (finding.remediation) lines.push(`      → ${finding.remediation}`);
    }
    if (report.findings.length > 40) {
      lines.push(`  … and ${report.findings.length - 40} more. Use --format json for the full report.`);
    }
  }

  return `${lines.join("\n")}\n`;
}

const COLUMN_WIDTH = 24;

/** Pad to the report column, truncating long titles so the second column stays aligned. */
function column(label: string): string {
  if (label.length >= COLUMN_WIDTH) return `${label.slice(0, COLUMN_WIDTH - 2)}… `;
  return label.padEnd(COLUMN_WIDTH);
}
