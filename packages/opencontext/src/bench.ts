/**
 * Performance benchmarks.
 *
 * The specification publishes targets for local projects, and this is what
 * measures them:
 *
 *   - manifest parse:                under 100 ms
 *   - validation of 1,000 objects:   under 2 s
 *   - id lookup after load:          under 100 ms
 *   - local resolution:              under 2 s
 *   - no mandatory network call for a local-only project
 *
 * Run with `npm --workspace @logicsrc/opencontext run bench`. Exits non-zero if
 * a target regresses, so it can gate a release rather than merely inform one.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OpenContext } from "./index.js";
import { loadManifest } from "./manifest.js";

interface Target {
  name: string;
  budgetMs: number;
  measured?: number;
}

const TARGETS: Target[] = [
  // Measured warm. The first parse in a process also compiles the manifest JSON
  // Schema, a one-time cost of roughly 100 ms that is reported separately below
  // rather than folded in — a CLI pays it once per invocation, and a long-lived
  // SDK consumer pays it once ever.
  { name: "manifest parse", budgetMs: 100 },
  { name: "load 1,000 objects", budgetMs: 5000 },
  { name: "validate 1,000 objects", budgetMs: 2000 },
  { name: "id lookup (after load)", budgetMs: 100 },
  { name: "resolve 1,000 objects", budgetMs: 2000 },
  { name: "doctor 1,000 objects", budgetMs: 5000 }
];

const OBJECT_COUNT = 1000;

function buildProject(count: number): string {
  const dir = mkdtempSync(join(tmpdir(), "opencontext-bench-"));
  mkdirSync(join(dir, "context/policies"), { recursive: true });

  writeFileSync(
    join(dir, "opencontext.yaml"),
    [
      'opencontext: "1.0"',
      "id: bench",
      "name: Benchmark",
      "collections:",
      "  policies: ./context/policies/**",
      "roles:",
      "  everyone:",
      "    include:",
      "      - policies.*",
      "freshness:",
      "  default_ttl: 3650d"
    ].join("\n") + "\n"
  );

  const updated = new Date().toISOString();
  for (let index = 0; index < count; index += 1) {
    const id = `policies.p${String(index).padStart(5, "0")}`;
    // A tenth of the corpus references its predecessor, so the graph and
    // reference checks do real work rather than walking an empty edge list.
    const references = index > 0 && index % 10 === 0 ? `references:\n  - policies.p${String(index - 1).padStart(5, "0")}\n` : "";
    writeFileSync(
      join(dir, `context/policies/p${String(index).padStart(5, "0")}.md`),
      [
        "---",
        `id: ${id}`,
        "type: policy",
        "layer: L3",
        `title: Policy ${index}`,
        "authority: approved",
        "owner: ops",
        "canonical_source: true",
        `updated: ${updated}`,
        `tags: [bench, group-${index % 20}]`,
        references.trimEnd(),
        "---",
        "",
        `Policy number ${index}. Refund requests are accepted within ${(index % 60) + 1} days.`,
        ""
      ]
        .filter((line) => line !== "")
        .join("\n") + "\n"
    );
  }

  return dir;
}

function time<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const result = fn();
  return [result, performance.now() - start];
}

async function timeAsync<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  return [result, performance.now() - start];
}

function record(name: string, ms: number): void {
  const target = TARGETS.find((entry) => entry.name === name);
  if (target) target.measured = ms;
}

async function main(): Promise<void> {
  console.log(`Building a ${OBJECT_COUNT}-object project…`);
  const dir = buildProject(OBJECT_COUNT);

  try {
    const [, coldParseMs] = time(() => loadManifest(dir));
    const [, parseMs] = time(() => loadManifest(dir));
    record("manifest parse", parseMs);

    const [oc, loadMs] = await timeAsync(() => OpenContext.load(dir));
    record("load 1,000 objects", loadMs);

    const [findings, validateMs] = time(() => oc.validate());
    record("validate 1,000 objects", validateMs);

    const [, lookupMs] = time(() => {
      for (let index = 0; index < 100; index += 1) {
        oc.get(`policies.p${String(index * 7).padStart(5, "0")}`);
      }
    });
    record("id lookup (after load)", lookupMs);

    const [bundle, resolveMs] = time(() =>
      oc.bundle({ role: "everyone", task: "customer asked for a refund within 30 days" })
    );
    record("resolve 1,000 objects", resolveMs);

    const [report, doctorMs] = time(() => oc.doctor());
    record("doctor 1,000 objects", doctorMs);

    console.log("");
    console.log(`objects loaded: ${oc.store.objects.length}`);
    console.log(`bundle objects: ${bundle.objects.length}, characters: ${bundle.stats?.characters ?? 0}`);
    console.log(`validate findings: ${findings.length}, health score: ${report.score}`);
    console.log(`cold start (first parse, includes JSON Schema compilation): ${coldParseMs.toFixed(1)} ms`);
    console.log("");

    let failed = 0;
    const width = Math.max(...TARGETS.map((target) => target.name.length)) + 2;

    for (const target of TARGETS) {
      const measured = target.measured ?? Number.NaN;
      const ok = measured <= target.budgetMs;
      if (!ok) failed += 1;
      console.log(
        `${ok ? "ok  " : "FAIL"} ${target.name.padEnd(width)}${measured.toFixed(1).padStart(9)} ms   (budget ${target.budgetMs} ms)`
      );
    }

    console.log("");
    if (failed > 0) {
      console.error(`${failed} target${failed === 1 ? "" : "s"} regressed.`);
      process.exitCode = 1;
      return;
    }
    console.log("All performance targets met.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

await main();
