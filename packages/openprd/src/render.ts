import { stringify as toYaml } from "yaml";
import type { PrdDocument, ValidationReport } from "./types.js";

export type ReportFormat = "text" | "json" | "yaml" | "markdown";

export function renderReport(report: ValidationReport, format: ReportFormat = "text"): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "yaml") return toYaml(report).trimEnd();

  if (format === "markdown") {
    const lines = [
      `# OpenPRD validation ${report.ok ? "passed" : "failed"}`,
      "",
      `- documents: ${report.checked.documents}`,
      `- requirements: ${report.checked.requirements}`,
      `- errors: ${report.counts.error}`,
      `- warnings: ${report.counts.warning}`,
      `- info: ${report.counts.info}`,
      ""
    ];
    if (report.findings.length > 0) {
      lines.push("| severity | code | file | line | message |", "| --- | --- | --- | --- | --- |");
      for (const f of report.findings) {
        lines.push(
          `| ${f.severity} | ${f.code} | ${f.file ?? ""} | ${f.line ?? ""} | ${f.message.replace(/\|/g, "\\|")} |`
        );
      }
    }
    return lines.join("\n");
  }

  const lines: string[] = [];
  lines.push(`  ✓ ${report.checked.documents} PRD${report.checked.documents === 1 ? "" : "s"}`);
  lines.push(`  ✓ ${report.checked.requirements} requirements`);

  for (const f of report.findings) {
    const mark = f.severity === "error" ? "✗" : f.severity === "warning" ? "!" : "·";
    const where = [f.file, f.line ? `line ${f.line}` : null].filter(Boolean).join(":");
    lines.push(`  ${mark} [${f.severity}] ${f.code} ${where ? `${where} — ` : ""}${f.message}`);
    if (f.hint) lines.push(`      hint: ${f.hint}`);
  }

  lines.push(
    report.ok
      ? "OpenPRD collection is valid."
      : `OpenPRD collection is INVALID (${report.counts.error} error(s), ${report.counts.warning} warning(s)).`
  );
  return lines.join("\n");
}

/** Human-readable single-document view for `logicsrc prd show`. */
export function renderDocument(doc: PrdDocument, format: "text" | "json" | "yaml" | "markdown" = "text"): string {
  const fm = doc.frontMatter;

  if (format === "json") return JSON.stringify(doc, null, 2);
  if (format === "yaml") return toYaml(doc).trimEnd();
  if (format === "markdown") return `---\n${doc.frontMatterRaw}\n---\n${doc.body}`;

  const lines = [
    `${fm.id ?? doc.filePrefix}  ${fm.title ?? "(untitled)"}`,
    `status: ${fm.status}${fm["superseded-by"] ? ` (superseded by ${fm["superseded-by"]})` : ""}`,
    `file: ${doc.file}`,
    `authors: ${(fm.authors ?? []).join(", ") || "(none)"}`,
    ...(fm.repo ? [`repo: ${fm.repo}`] : []),
    ...(fm.tags?.length ? [`tags: ${fm.tags.join(", ")}`] : []),
    ...(fm.created || fm.updated ? [`dates: created ${fm.created ?? "?"}, updated ${fm.updated ?? "?"}`] : []),
    "",
    "sections:"
  ];

  for (const section of doc.sections) {
    lines.push(`  ${section.empty ? "·" : "✓"} ${section.name}${section.empty ? " (empty)" : ""}`);
  }

  if (doc.requirements.length > 0) {
    lines.push("", `requirements (${doc.requirements.length}):`);
    for (const requirement of doc.requirements) {
      const priority = requirement.priority ?? "--";
      lines.push(`  ${requirement.id.padEnd(5)} [${priority}] ${truncate(requirement.text, 90)}`);
    }
  }

  return lines.join("\n");
}

function truncate(value: string, max: number): string {
  const plain = value.replace(/\*\*(.*?)\*\*/g, "$1").replace(/`([^`]*)`/g, "$1");
  return plain.length <= max ? plain : `${plain.slice(0, max - 1)}…`;
}
