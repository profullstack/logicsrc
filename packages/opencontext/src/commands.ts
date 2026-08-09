/**
 * CLI command definitions, shared by the standalone `opencontext` binary and by
 * `logicsrc context`. Defining them once means the two can never drift, which
 * matters because the specification treats CLI behaviour as a conformance
 * surface.
 *
 * Conventions the specification requires and this file implements:
 *   - readable human output by default, `--format json` for automation
 *   - stable exit codes: 0 ok, 1 invalid, 2 usage, 3 not found
 *   - errors that name the file, object, field, and the fix
 *   - no telemetry, no network unless a source asks for it, no account
 */

import { writeFileSync } from "node:fs";
import type { Command } from "commander";
import { stringify as toYaml } from "yaml";
import { OpenContext } from "./index.js";
import { initProject } from "./scaffold.js";
import { renderBundle, renderExplanation, type BundleFormat } from "./bundle.js";
import { renderHealth } from "./doctor.js";
import { renderDot, renderGraphText } from "./graph.js";
import { renderDiff } from "./history.js";
import { hasFailure } from "./validate.js";
import { buildEvent, eventForBundle, isAuditEnabled, recordEvent } from "./audit.js";
import { ManifestInvalidError, ManifestNotFoundError, SPEC_VERSION } from "./manifest.js";
import { UnknownConsumerError } from "./permissions.js";
import { WriteDeniedError } from "./write.js";
import { UnknownSchemeError } from "./adapters/index.js";
import type { Diagnostic, ResolveOptions } from "./types.js";

/** Stable exit codes for CI: 0 ok · 1 invalid · 2 usage · 3 not found. */
export const EXIT = { ok: 0, invalid: 1, usage: 2, notFound: 3 } as const;

type Format = "table" | "json" | "yaml" | "markdown" | "ndjson" | "dot";

interface GlobalOptions {
  dir?: string;
  format?: Format;
  output?: string;
  offline?: boolean;
  strict?: boolean;
  at?: string;
}

function fail(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

/** Turn the library's typed errors into the exit code and wording a user needs. */
function handle(error: unknown): never {
  if (error instanceof ManifestNotFoundError) fail(error.message, EXIT.notFound);
  if (error instanceof ManifestInvalidError) fail(error.message, EXIT.invalid);
  if (error instanceof UnknownConsumerError) fail(error.message, EXIT.usage);
  if (error instanceof UnknownSchemeError) fail(error.message, EXIT.invalid);
  if (error instanceof WriteDeniedError) fail(error.message, EXIT.invalid);
  fail((error as Error).message ?? String(error), EXIT.invalid);
}

function emit(text: string, options: GlobalOptions): void {
  if (options.output) {
    writeFileSync(options.output, text.endsWith("\n") ? text : `${text}\n`, "utf8");
    console.error(`Wrote ${options.output}`);
    return;
  }
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

function emitData(data: unknown, options: GlobalOptions, renderTable: () => string): void {
  switch (options.format) {
    case "json":
      emit(`${JSON.stringify(data, null, 2)}\n`, options);
      return;
    case "yaml":
      emit(toYaml(data, { lineWidth: 100 }), options);
      return;
    case "ndjson": {
      const rows = Array.isArray(data) ? data : [data];
      emit(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, options);
      return;
    }
    default:
      emit(renderTable(), options);
  }
}

async function open(options: GlobalOptions): Promise<OpenContext> {
  try {
    return await OpenContext.load(options.dir ?? process.cwd(), { offline: options.offline });
  } catch (error) {
    return handle(error);
  }
}

function renderDiagnostics(findings: Diagnostic[]): string {
  if (findings.length === 0) return "No problems found.\n";

  const lines: string[] = [];
  for (const finding of findings) {
    const marker = finding.severity === "error" ? "✗" : finding.severity === "warning" ? "⚠" : "·";
    const where = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : (finding.id ?? "");
    lines.push(`${marker} ${where ? `${where}: ` : ""}${finding.message}`);
    if (finding.field) lines.push(`    field: ${finding.field}`);
    if (finding.expected !== undefined) lines.push(`    expected: ${short(finding.expected)}`);
    if (finding.actual !== undefined) lines.push(`    actual:   ${short(finding.actual)}`);
    if (finding.remediation) lines.push(`    → ${finding.remediation}`);
  }

  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  lines.push("");
  lines.push(`${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}.`);
  return `${lines.join("\n")}\n`;
}

function short(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text && text.length > 100 ? `${text.slice(0, 97)}…` : (text ?? "");
}

function table(rows: Array<Record<string, unknown>>, empty: string): string {
  if (rows.length === 0) return `${empty}\n`;

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length))
  );

  const line = (cells: string[]): string =>
    cells.map((cell, index) => cell.padEnd(widths[index]!)).join("  ").trimEnd();

  return `${[line(columns), line(widths.map((width) => "-".repeat(width))), ...rows.map((row) => line(columns.map((column) => String(row[column] ?? ""))))].join("\n")}\n`;
}

function resolveOptionsFrom(options: Record<string, unknown>): ResolveOptions {
  return {
    agent: options.agent as string | undefined,
    role: options.role as string | string[] | undefined,
    task: options.task as string | undefined,
    at: options.at as string | undefined,
    includeHistorical: options.includeHistorical === true,
    explain: options.explain === true,
    offline: options.offline === true,
    limit: options.limit === undefined ? undefined : Number(options.limit),
    minRelevance: options.minRelevance === undefined ? undefined : Number(options.minRelevance),
    include: options.include as string[] | undefined
  };
}

/**
 * Attach every OpenContext command to `program`.
 *
 * `program` is the root when this is the standalone binary, or the `context`
 * subcommand when hosted inside the LogicSRC CLI.
 */
export function registerContextCommands(program: Command): void {
  const withGlobals = (command: Command): Command =>
    command
      .option("-C, --dir <path>", "project directory or manifest path (default: search upward from cwd)")
      .option("--format <format>", "table, json, yaml, markdown, or ndjson", "table")
      .option("--output <file>", "write to a file instead of stdout")
      .option("--offline", "never reach the network; remote sources are skipped, not silently emptied")
      .option("--at <timestamp>", "resolve as of an RFC 3339 instant or YYYY-MM-DD date");

  // ---- init --------------------------------------------------------------
  program
    .command("init")
    .argument("[dir]", "directory to initialise", ".")
    .option("--id <id>", "namespace id (default: directory name)")
    .option("--name <name>", "organization or project name")
    .option("-y, --yes", "take every default; suitable for agents and scripts")
    .option("--force", "overwrite existing files")
    .description("Create an opencontext.yaml and a context/ tree that validates immediately.")
    .action((dir: string, options) => {
      const result = initProject(dir, { id: options.id, name: options.name, yes: options.yes, force: options.force });
      for (const file of result.created) console.log(`Created ${file}`);
      for (const file of result.skipped) console.log(`Kept existing ${file}`);
      console.log("");
      console.log("Next:");
      console.log("  opencontext validate --strict");
      console.log('  opencontext resolve --role support --task "customer asked for a refund" --explain');
    });

  // ---- validate ----------------------------------------------------------
  withGlobals(program.command("validate"))
    .option("--strict", "also fail on warnings and require namespaced extensions")
    .description("Check the manifest, schemas, references, supersession, and permissions.")
    .action(async (options: GlobalOptions & { strict?: boolean }) => {
      const oc = await open(options);
      const findings = oc.validate({ strict: options.strict });

      emitData(findings, options, () => renderDiagnostics(findings));

      const failOn = options.strict ? "warning" : "error";
      process.exit(hasFailure(findings, failOn) ? EXIT.invalid : EXIT.ok);
    });

  // ---- doctor ------------------------------------------------------------
  withGlobals(program.command("doctor"))
    .option("--strict", "fail on warnings and on the configured minimum score")
    .option("--min-score <score>", "override health.minimum_score")
    .description("Report context health: stale, expired, conflicting, orphaned, unowned, and broken context.")
    .action(async (options: GlobalOptions & { strict?: boolean; minScore?: string }) => {
      const oc = await open(options);
      const report = oc.doctor({ strict: options.strict, at: options.at });

      emitData(report, options, () => renderHealth(report, oc.store));

      const minimum = options.minScore === undefined ? undefined : Number(options.minScore);
      const belowMinimum = minimum !== undefined && (report.score ?? 100) < minimum;
      const failOn = options.strict ? "warning" : "error";
      const failed = hasFailure(report.findings, failOn) || belowMinimum || (options.strict && !report.ok);

      process.exit(failed ? EXIT.invalid : EXIT.ok);
    });

  // ---- get ---------------------------------------------------------------
  withGlobals(program.command("get"))
    .argument("<id>", "object id, optionally pinned as id@version")
    .option("--agent <agent>", "resolve as this agent")
    .option("--role <role...>", "resolve as these roles")
    .description("Print one context object, subject to authorization.")
    .action(async (id: string, options: GlobalOptions & { agent?: string; role?: string[] }) => {
      const oc = await open(options);
      const scope = options.agent || options.role ? oc.scope({ agent: options.agent, role: options.role }) : undefined;
      const object = oc.get(id, scope ? { scope } : {});

      if (!object) {
        // A denied read and a missing object are reported identically on
        // purpose: probing for ids must not reveal what exists.
        fail(`No context object "${id}" is available to this consumer.`, EXIT.notFound);
      }

      if (isAuditEnabled(oc.manifest, "context.read")) {
        recordEvent({ manifest: oc.manifest, dir: oc.dir, scope }, buildEvent("context.read", { manifest: oc.manifest, dir: oc.dir, scope }, { objects: [object.id], outcome: "allowed" }));
      }

      emitData(object, { ...options, format: options.format === "table" ? "yaml" : options.format }, () =>
        toYaml(object, { lineWidth: 100 })
      );
    });

  // ---- list --------------------------------------------------------------
  withGlobals(program.command("list"))
    .option("--agent <agent>", "list what this agent may read")
    .option("--role <role...>", "list what these roles may read")
    .option("--type <type>", "filter by type")
    .option("--layer <layer>", "filter by layer, L0 to L5")
    .option("--authority <authority>", "filter by authority")
    .option("--owner <owner>", "filter by owner")
    .option("--tag <tag>", "filter by tag")
    .option("--include-historical", "include superseded objects")
    .description("List context objects.")
    .action(async (options: GlobalOptions & Record<string, unknown>) => {
      const oc = await open(options);
      const scope =
        options.agent || options.role
          ? oc.scope({ agent: options.agent as string, role: options.role as string[] })
          : undefined;

      const entries = oc.list({
        scope,
        type: options.type as string,
        layer: options.layer as string,
        authority: options.authority as string,
        owner: options.owner as string,
        tag: options.tag as string,
        includeSuperseded: options.includeHistorical === true,
        at: options.at
      });

      emitData(entries, options, () =>
        table(
          entries.map((entry) => ({
            id: entry.id,
            type: entry.type,
            layer: entry.layer ?? "",
            authority: entry.authority ?? "",
            owner: entry.owner ?? "",
            state: entry.lifecycle
          })),
          "(no context objects)"
        )
      );
    });

  // ---- search ------------------------------------------------------------
  withGlobals(program.command("search"))
    .argument("<query>", "search terms")
    .option("--agent <agent>", "search as this agent")
    .option("--role <role...>", "search as these roles")
    .option("--limit <n>", "maximum hits", "20")
    .option("--type <type>", "restrict to a type")
    .description("Lexical search over ids, titles, tags, and content. Results still pass authorization.")
    .action(async (query: string, options: GlobalOptions & Record<string, unknown>) => {
      const oc = await open(options);
      const scope =
        options.agent || options.role
          ? oc.scope({ agent: options.agent as string, role: options.role as string[] })
          : undefined;

      const hits = oc.search(query, {
        scope,
        limit: Number(options.limit ?? 20),
        types: options.type ? [options.type as string] : undefined
      });

      emitData(hits, options, () =>
        hits.length === 0
          ? "No matches.\n"
          : hits
              .map(
                (hit) =>
                  `${hit.id}${hit.title ? `  — ${hit.title}` : ""}\n    score ${hit.score}, matched ${hit.matched.join(", ")}${hit.excerpt ? `\n    ${hit.excerpt}` : ""}`
              )
              .join("\n") + "\n"
      );
    });

  // ---- resolve -----------------------------------------------------------
  withGlobals(program.command("resolve"))
    .option("--agent <agent>", "the consumer to resolve for")
    .option("--role <role...>", "resolve for these roles")
    .option("--task <task>", "the task the context is for; drives relevance ranking")
    .option("--explain", "show why each object was included, excluded, or outranked")
    .option("--include-historical", "include superseded and expired context")
    .option("--limit <n>", "keep only the N most relevant objects; the rest are reported as excluded")
    .option("--min-relevance <n>", "drop objects scoring below this")
    .option("--include <pattern...>", "narrow the scope further; can never widen it")
    .description("Resolve authorized, valid, current context for a consumer and task.")
    .action(async (options: GlobalOptions & Record<string, unknown>) => {
      const oc = await open(options);

      let result;
      try {
        result = oc.resolve(resolveOptionsFrom({ ...options, at: options.at }));
      } catch (error) {
        return handle(error);
      }

      const scope = oc.scope({ agent: options.agent as string, role: options.role as string[] });
      if (isAuditEnabled(oc.manifest, "context.resolve")) {
        const ctx = { manifest: oc.manifest, dir: oc.dir, scope };
        recordEvent(ctx, eventForBundle(ctx, result.bundle, result.excluded.length));
      }

      if (options.explain && (options.format === "table" || options.format === undefined)) {
        emit(renderExplanation(result.bundle, result.excluded), options);
        return;
      }

      const format: BundleFormat =
        options.format === "markdown" ? "markdown" : options.format === "yaml" ? "yaml" : "json";
      emit(renderBundle(result.bundle, format), options);
    });

  // ---- bundle ------------------------------------------------------------
  withGlobals(program.command("bundle"))
    .option("--agent <agent>", "the consumer to resolve for")
    .option("--role <role...>", "resolve for these roles")
    .option("--task <task>", "the task the context is for")
    .option("--include-historical", "include superseded and expired context")
    .option("--limit <n>", "keep only the N most relevant objects")
    .description("Compile a portable Context Bundle. Same resolution as resolve, always the full document.")
    .action(async (options: GlobalOptions & Record<string, unknown>) => {
      const oc = await open(options);
      const bundle = oc.bundle(resolveOptionsFrom(options));
      const format: BundleFormat =
        options.format === "markdown" ? "markdown" : options.format === "yaml" ? "yaml" : "json";
      emit(renderBundle(bundle, format), options);
    });

  // ---- conflicts ---------------------------------------------------------
  withGlobals(program.command("conflicts"))
    .option("--strict", "exit non-zero when any conflict is reported")
    .description("Report duplicate canonical objects, declared conflicts, and broken supersession.")
    .action(async (options: GlobalOptions & { strict?: boolean }) => {
      const oc = await open(options);
      const codes = new Set([
        "duplicate-canonical",
        "conflict-ambiguous",
        "conflict-declared",
        "duplicate-id",
        "broken-supersession",
        "supersession-cycle",
        "multiple-active-versions"
      ]);
      const findings = oc.validate().filter((finding) => codes.has(finding.code));

      emitData(findings, options, () =>
        findings.length === 0 ? "No conflicts.\n" : renderDiagnostics(findings)
      );

      const failed = options.strict ? findings.length > 0 : findings.some((f) => f.severity === "error");
      process.exit(failed ? EXIT.invalid : EXIT.ok);
    });

  // ---- stale -------------------------------------------------------------
  withGlobals(program.command("stale"))
    .option("--strict", "exit non-zero when anything is stale or expired")
    .description("Report context past its freshness window, expired, or overdue for review.")
    .action(async (options: GlobalOptions & { strict?: boolean }) => {
      const oc = await open(options);
      const codes = new Set(["stale", "expired", "review-overdue", "not-yet-valid"]);
      const findings = oc.doctor({ at: options.at }).findings.filter((finding) => codes.has(finding.code));

      emitData(findings, options, () =>
        findings.length === 0 ? "All context is current.\n" : renderDiagnostics(findings)
      );

      const failed = options.strict ? findings.length > 0 : findings.some((f) => f.severity === "error");
      process.exit(failed ? EXIT.invalid : EXIT.ok);
    });

  // ---- history -----------------------------------------------------------
  withGlobals(program.command("history"))
    .argument("<id>", "object id")
    .description("Show the declared version history of an object, and the commits behind it.")
    .action(async (id: string, options: GlobalOptions) => {
      const oc = await open(options);
      const result = await oc.history(id, { at: options.at });

      if (result.entries.length === 0) fail(`No context object "${id}".`, EXIT.notFound);

      emitData(result, options, () => {
        const lines = [`History of ${id}`, ""];
        for (const entry of result.entries) {
          lines.push(
            `  v${entry.version}  ${entry.lifecycle.padEnd(11)}${(entry.authority ?? "").padEnd(11)}${entry.updated ?? ""}${entry.superseded_by ? `  → superseded by ${entry.superseded_by}` : ""}`
          );
        }
        if (result.commits.length > 0) {
          lines.push("", "Commits:");
          for (const commit of result.commits.slice(0, 20)) {
            lines.push(`  ${commit.commit.slice(0, 8)}  ${commit.date.slice(0, 10)}  ${commit.author}  ${commit.subject}`);
          }
        } else if (!result.gitAvailable) {
          lines.push("", "(git is not available here, so only declared history is shown)");
        }
        return `${lines.join("\n")}\n`;
      });
    });

  // ---- diff --------------------------------------------------------------
  withGlobals(program.command("diff"))
    .argument("<from>", "object id or id@version")
    .argument("<to>", "object id or id@version")
    .option("--show-unchanged", "also list objects with no changes")
    .description("Compare two versions of an object, field by field.")
    .action(async (from: string, to: string, options: GlobalOptions & { showUnchanged?: boolean }) => {
      const oc = await open(options);
      const diffs = oc.diff(from, to);
      emitData(diffs, options, () => renderDiff(diffs, { showUnchanged: options.showUnchanged }));
    });

  // ---- graph -------------------------------------------------------------
  withGlobals(program.command("graph"))
    .option("--root <id...>", "restrict to a neighbourhood around these ids")
    .option("--depth <n>", "how many hops from the roots", "2")
    .option("--owners", "include ownership edges")
    .option("--sources", "include source edges")
    .description("Show relationships: references, supersession, conflicts, dependencies, ownership, sources.")
    .action(async (options: GlobalOptions & Record<string, unknown>) => {
      const oc = await open(options);
      const graph = oc.graph({
        roots: options.root as string[] | undefined,
        depth: Number(options.depth ?? 2),
        includeOwners: options.owners === true,
        includeSources: options.sources === true
      });

      if (options.format === "dot") {
        emit(renderDot(graph), options);
        return;
      }
      emitData(graph, options, () => renderGraphText(graph));
    });

  // ---- schema ------------------------------------------------------------
  withGlobals(program.command("schema"))
    .argument("[kind]", "manifest, object, bundle, role, provenance, decision, diagnostic, or audit-event")
    .description("Print a published JSON Schema, or list them.")
    .action(async (kind: string | undefined, options: GlobalOptions) => {
      const kinds = ["manifest", "object", "bundle", "role", "provenance", "decision", "diagnostic", "audit-event"];

      if (!kind) {
        emit(
          `${kinds.map((name) => `${name}  https://logicsrc.com/schemas/opencontext/${name}.schema.json`).join("\n")}\n`,
          options
        );
        return;
      }

      if (!kinds.includes(kind)) {
        fail(`Unknown schema "${kind}". Expected one of: ${kinds.join(", ")}.`, EXIT.usage);
      }

      const { schemas } = await import("@logicsrc/validators");
      const schema = (schemas as Record<string, unknown>)[`opencontext-${kind}`];
      emit(`${JSON.stringify(schema, null, 2)}\n`, options);
    });

  // ---- add ---------------------------------------------------------------
  withGlobals(program.command("add"))
    .argument("<id>", "new object id")
    .requiredOption("--type <type>", "object type, e.g. policy, procedure, decision")
    .option("--title <title>", "human-readable title")
    .option("--content <text>", "inline content; omit to write a stub")
    .option("--layer <layer>", "L0 to L5")
    .option("--authority <authority>", "canonical, approved, reference, observed, inferred, historical", "reference")
    .option("--owner <owner>", "accountable role or team")
    .option("--file <path>", "where to write it")
    .option("--promote", "permit canonical or approved authority; promotion is a governance act")
    .option("--dry-run", "show what would be written")
    .description("Add a context object. Validates schema and authorization before writing.")
    .action(async (id: string, options: GlobalOptions & Record<string, unknown>) => {
      const oc = await open(options);
      try {
        const result = oc.add(
          {
            id,
            type: options.type as string,
            title: options.title as string | undefined,
            layer: options.layer as never,
            authority: options.authority as never,
            owner: options.owner as string | undefined,
            content: (options.content as string | undefined) ?? `TODO: write ${id}.`,
            updated: new Date().toISOString()
          },
          { file: options.file as string | undefined, allowPromotion: options.promote === true, dryRun: options.dryRun === true }
        );
        console.log(`${result.written ? "Created" : "Would create"} ${result.file}`);
      } catch (error) {
        return handle(error);
      }
    });

  // ---- supersede ---------------------------------------------------------
  withGlobals(program.command("supersede"))
    .argument("<id>", "object to supersede")
    .option("--content <text>", "replacement content")
    .option("--title <title>", "replacement title")
    .option("--authority <authority>", "authority for the new version")
    .option("--file <path>", "where to write the new version")
    .option("--promote", "permit canonical or approved authority")
    .option("--dry-run", "show what would be written")
    .description("Write the next version of an object. The previous version stays on disk.")
    .action(async (id: string, options: GlobalOptions & Record<string, unknown>) => {
      const oc = await open(options);
      try {
        const result = oc.supersede(id, {
          changes: {
            ...(options.content ? { content: options.content as string } : {}),
            ...(options.title ? { title: options.title as string } : {}),
            ...(options.authority ? { authority: options.authority as never } : {})
          },
          file: options.file as string | undefined,
          allowPromotion: options.promote === true,
          dryRun: options.dryRun === true
        });
        console.log(`${result.written ? "Wrote" : "Would write"} ${result.file} (${id} v${result.object.version})`);
      } catch (error) {
        return handle(error);
      }
    });

  // ---- version -----------------------------------------------------------
  program
    .command("version")
    .description("Print the OpenContext specification version this implementation supports.")
    .action(() => {
      console.log(SPEC_VERSION);
    });
}
