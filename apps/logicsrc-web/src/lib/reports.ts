import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Benchmark reports published alongside a spec, at docs/<spec>/reports/.
// Each report is a machine-readable <id>.json (the canonical artifact,
// produced by a reference implementation and committed on a release) and a
// rendered <id>.md that this site displays. Read at build time, so the
// deployed image has no runtime filesystem dependency.
const DOCS_DIR = resolve(process.cwd(), "../../docs");

// Specs that carry a reports section. Kept explicit so a stray directory
// never becomes a route.
export const REPORTED_SPECS = ["openstream"] as const;
export type ReportedSpec = (typeof REPORTED_SPECS)[number];

export function hasReports(spec: string): spec is ReportedSpec {
  return (REPORTED_SPECS as readonly string[]).includes(spec);
}

function reportsDir(spec: string): string {
  return resolve(DOCS_DIR, spec, "reports");
}

const ID = /^[a-z0-9][a-z0-9._-]{0,80}$/;

/** The report ids published for a spec, newest first by filename. */
export function reportIds(spec: string): string[] {
  if (!hasReports(spec)) return [];
  const dir = reportsDir(spec);
  if (!existsSync(dir)) return [];
  const ids = new Set<string>();
  for (const name of readdirSync(dir)) {
    const m = /^(.+)\.json$/.exec(name);
    if (m && ID.test(m[1] as string)) ids.add(m[1] as string);
  }
  return [...ids].sort().reverse();
}

export interface ReportEnvironment {
  runtime: string;
  zstd: string;
  zlib: string;
  os: string;
  arch: string;
  cpu: string;
  cores: number;
  memoryGiB: number;
}

export interface ReportModeSummary {
  mode: string;
  level: number;
  wireBytes: number;
  savingsPercent: number;
  roundTrip: boolean;
  encodeMs: number;
  decodeMs: number;
}

export interface Report {
  schema: number;
  spec: string;
  specVersion: string;
  generatedAt: string;
  implementation: { name: string; version: string };
  environment: ReportEnvironment;
  summary: { corpusBytes: number; byMode: ReportModeSummary[] };
  caveats: string[];
  // Other fields (samples, policy, envelope) are present in the JSON but not
  // needed for the listing; the detail page renders the committed Markdown.
  [key: string]: unknown;
}

export function readReportJson(spec: string, id: string): Report | null {
  if (!hasReports(spec) || !ID.test(id)) return null;
  try {
    return JSON.parse(readFileSync(resolve(reportsDir(spec), `${id}.json`), "utf8")) as Report;
  } catch {
    return null;
  }
}

export function readReportMarkdown(spec: string, id: string): string | null {
  if (!hasReports(spec) || !ID.test(id)) return null;
  try {
    return readFileSync(resolve(reportsDir(spec), `${id}.md`), "utf8");
  } catch {
    return null;
  }
}

export interface ReportSummary {
  id: string;
  generatedAt: string;
  implementation: string;
  /** The best round-tripping saving on the corpus, for the listing line. */
  headline: string;
}

export function listReports(spec: string): ReportSummary[] {
  const out: ReportSummary[] = [];
  for (const id of reportIds(spec)) {
    const r = readReportJson(spec, id);
    if (!r) continue;
    const best = r.summary?.byMode
      ?.filter((m) => m.roundTrip && m.mode !== "stored")
      .sort((a, b) => b.savingsPercent - a.savingsPercent)[0];
    out.push({
      id,
      generatedAt: r.generatedAt,
      implementation: `${r.implementation.name} ${r.implementation.version}`,
      headline: best ? `${best.mode} saved ${best.savingsPercent}% across the corpus` : "no codec beat stored on this corpus",
    });
  }
  return out;
}
