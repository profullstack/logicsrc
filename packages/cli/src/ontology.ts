import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import {
  buildOntologyPackage,
  createOntologyEngine,
  diffChangeSet,
  exportJsonLd,
  initOntologyPackage,
  loadOntologyPackage,
  localActor,
  proposerActor,
  readOnlyActor,
  renderReport,
  verifyPackageDigest,
  type Actor,
  type ChangeOperation,
  type OntologyEngine,
  type QueryBody,
  type ReportFormat
} from "@logicsrc/openontology";

/**
 * Exit codes, stable for CI (R144):
 *   0 ok · 1 validation failed · 2 usage error · 3 not found · 4 denied/approval
 */
export const EXIT = { ok: 0, invalid: 1, usage: 2, notFound: 3, denied: 4 } as const;

type Format = "table" | "json" | "yaml" | "markdown" | "ndjson";

function emit(data: unknown, format: Format): void {
  switch (format) {
    case "json":
      console.log(JSON.stringify(data, null, 2));
      return;
    case "yaml":
      console.log(toYaml(data));
      return;
    case "ndjson":
      for (const row of Array.isArray(data) ? data : [data]) console.log(JSON.stringify(row));
      return;
    case "markdown": {
      const rows = Array.isArray(data) ? data : [data];
      if (rows.length === 0) {
        console.log("_No rows._");
        return;
      }
      const columns = [...new Set(rows.flatMap((r) => Object.keys(r as object)))];
      console.log(`| ${columns.join(" | ")} |`);
      console.log(`| ${columns.map(() => "---").join(" | ")} |`);
      for (const row of rows) {
        console.log(`| ${columns.map((c) => formatCell((row as Record<string, unknown>)[c])).join(" | ")} |`);
      }
      return;
    }
    default: {
      const rows = Array.isArray(data) ? data : [data];
      if (rows.length === 0) {
        console.log("(no rows)");
        return;
      }
      console.table(rows);
    }
  }
}

function formatCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replace(/\|/g, "\\|");
}

function fail(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

/**
 * Resolve the actor from flags.
 *
 * `--as agent` deliberately cannot be talked into apply rights — the policy
 * layer denies agent applies outright, and this is only choosing which
 * already-bounded role the command runs as.
 */
function resolveActor(options: { as?: string; actor?: string }): Actor {
  const id = options.actor ?? (options.as === "agent" ? "agent:cli" : "local");
  switch (options.as) {
    case "agent":
      return proposerActor(id);
    case "reader":
      return readOnlyActor(id, "human");
    default:
      return localActor(id);
  }
}

function openEngine(dir: string, options: { as?: string; actor?: string }): OntologyEngine {
  try {
    return createOntologyEngine({
      package: loadOntologyPackage(resolve(dir)),
      actor: resolveActor(options),
      client: "logicsrc-cli"
    });
  } catch (error) {
    return fail((error as Error).message, EXIT.usage);
  }
}

function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    const err = error as Error & { code?: string };
    const code =
      err.code === "OO-A-DENIED" || err.code === "OO-A-APPROVAL-REQUIRED"
        ? EXIT.denied
        : err.code === "OO-A-NOT-FOUND"
          ? EXIT.notFound
          : EXIT.invalid;
    return fail(err.message, code);
  }
}

export function registerOntologyCommands(program: Command): void {
  const ontology = program
    .command("ontology")
    .description("LogicSRC OpenOntology: author, validate, query, and govern domain knowledge.");

  const actorOptions = <T extends Command>(cmd: T): T =>
    cmd
      .option("--as <role>", "run as local | agent | reader", "local")
      .option("--actor <id>", "actor id recorded on events and claims") as T;

  /* ── authoring ──────────────────────────────────────────────────────── */

  ontology
    .command("init")
    .argument("<id>", "package id, lowercase kebab-case")
    .option("--dir <dir>", "target directory (defaults to ./<id>)")
    .option("--namespace <uri>", "base IRI compact ids canonicalize against")
    .option("--maintainer <id>", "maintainer identity (mailto:, did:, https:)")
    .option("--license <spdx>", "package license", "CC-BY-4.0")
    .description("Create a starter package with example types, data, and a saved query.")
    .action((id: string, options) => {
      const dir = resolve(options.dir ?? `./${id}`);
      const result = initOntologyPackage(dir, {
        id,
        namespace: options.namespace,
        maintainer: options.maintainer,
        license: options.license
      });
      console.log(`Created ${dir}/openontology.yaml`);
      console.log(
        `Created ${result.counts.entityTypes} entity types, ${result.counts.relationshipTypes} relationship types, ` +
          `${result.counts.entities} entities, ${result.counts.claims} claims, ${result.counts.sources} sources.`
      );
      console.log(`\nNext: logicsrc ontology validate ${dir} --strict`);
    });

  ontology
    .command("validate")
    .argument("[dir]", "package directory", ".")
    .option("--strict", "fail on unknown types, predicates, and unnamespaced extensions")
    .option("--max-excerpt <n>", "excerpt length that triggers a policy finding", "500")
    .option("--format <format>", "text, json, yaml, or markdown", "text")
    .description("Validate schema, graph, provenance, and package integrity without modifying files.")
    .action((dir: string, options) => {
      const pkg = guard(() => loadOntologyPackage(resolve(dir)));
      const built = buildOntologyPackage(pkg);
      const report = createOntologyEngine({ package: pkg, actor: localActor() }).validateOntologyPackage({
        strict: options.strict === true,
        maxExcerptLength: Number.parseInt(options.maxExcerpt, 10),
        expectedDigest: built.digest
      });
      console.log(renderReport(report, options.format as ReportFormat));
      if (!report.ok) process.exit(EXIT.invalid);
    });

  ontology
    .command("lint")
    .argument("[dir]", "package directory", ".")
    .option("--format <format>", "text, json, yaml, or markdown", "text")
    .description("Report warnings, policy findings, and style issues without failing on them.")
    .action((dir: string, options) => {
      const pkg = guard(() => loadOntologyPackage(resolve(dir)));
      const report = createOntologyEngine({ package: pkg, actor: localActor() }).validateOntologyPackage();
      const advisory = { ...report, findings: report.findings.filter((f) => f.severity !== "error") };
      console.log(renderReport(advisory, options.format as ReportFormat));
    });

  ontology
    .command("build")
    .argument("[dir]", "package directory", ".")
    .option("--out <file>", "write the canonical JSON build artifact here")
    .option("--format <format>", "json or yaml", "json")
    .description("Compile to canonical JSON and compute the deterministic package digest.")
    .action((dir: string, options) => {
      const built = guard(() => buildOntologyPackage(loadOntologyPackage(resolve(dir))));
      if (options.out) {
        writeFileSync(resolve(options.out), `${JSON.stringify(built, null, 2)}\n`, "utf8");
        console.log(`Wrote ${resolve(options.out)}`);
      }
      console.log(`digest: ${built.digest}`);
      for (const file of built.files) console.log(`  ${file.digest}  ${file.path} (${file.count})`);
    });

  ontology
    .command("inspect")
    .argument("[dir]", "package directory", ".")
    .option("--format <format>", "table, json, yaml, or markdown", "table")
    .description("Show package identity, counts, and integrity at a glance.")
    .action((dir: string, options) => {
      const pkg = guard(() => loadOntologyPackage(resolve(dir)));
      const built = buildOntologyPackage(pkg);
      emit(
        {
          id: pkg.manifest.id,
          version: pkg.manifest.version,
          namespace: pkg.manifest.namespace,
          license: pkg.manifest.license,
          entityTypes: pkg.schema.entityTypes.length,
          relationshipTypes: pkg.schema.relationships.length,
          entities: pkg.data.entities.length,
          claims: pkg.data.claims.length,
          sources: pkg.data.sources.length,
          savedQueries: pkg.schema.queries.length,
          digest: built.digest,
          digestVerified: verifyPackageDigest(built).ok
        },
        options.format as Format
      );
    });

  /* ── entities and claims ────────────────────────────────────────────── */

  const entity = ontology.command("entity").description("Inspect and resolve entities.");

  actorOptions(
    entity
      .command("get")
      .argument("<id>", "entity id")
      .option("--dir <dir>", "package directory", ".")
      .option("--format <format>", "table, json, yaml, or markdown", "json")
      .description("Fetch one entity, following merge redirects.")
  ).action((id: string, options) => {
    const e = openEngine(options.dir, options);
    emit(guard(() => e.getEntity(id)), options.format as Format);
  });

  actorOptions(
    entity
      .command("list")
      .option("--dir <dir>", "package directory", ".")
      .option("--type <type>", "filter by entity type")
      .option("--limit <n>", "maximum rows", "50")
      .option("--format <format>", "table, json, yaml, markdown, or ndjson", "table")
      .description("List entities.")
  ).action((options) => {
    const e = openEngine(options.dir, options);
    const rows = e.store
      .listEntities({ type: options.type, limit: Number.parseInt(options.limit, 10) })
      .map((item) => ({ id: item.id, type: item.type, name: item.canonicalName, status: item.status ?? "active" }));
    emit(rows, options.format as Format);
  });

  actorOptions(
    entity
      .command("find")
      .argument("<text>", "name, alias, or id")
      .option("--dir <dir>", "package directory", ".")
      .option("--type <type>", "restrict to an entity type")
      .option("--format <format>", "table, json, yaml, or markdown", "table")
      .description("Rank candidate matches with the evidence for each (never a silent match).")
  ).action((text: string, options) => {
    const e = openEngine(options.dir, options);
    emit(
      e.findEntities({ text, type: options.type }).map((match) => ({
        id: match.entity.id,
        name: match.entity.canonicalName,
        score: match.score,
        matchedOn: match.matchedOn,
        evidence: match.evidence
      })),
      options.format as Format
    );
  });

  actorOptions(
    entity
      .command("merge")
      .argument("<source>", "entity id to merge away (kept as a redirect)")
      .argument("<target>", "surviving entity id")
      .option("--dir <dir>", "package directory", ".")
      .option("--reason <text>", "why the two are the same")
      .description("Propose a merge. Merges always require curator approval before they apply.")
  ).action((source: string, target: string, options) => {
    const e = openEngine(options.dir, options);
    const cs = guard(() =>
      e.createOntologyChangeSet({
        title: `Merge ${source} into ${target}`,
        rationale: options.reason,
        operations: [{ op: "merge-entity", source, target, reason: options.reason }]
      })
    );
    console.log(`Proposed change set ${cs.id} (merge requires approval).`);
    console.log(`Review with: logicsrc ontology changeset diff ${cs.id} --dir ${options.dir}`);
  });

  const claim = ontology.command("claim").description("Inspect and propose claims.");

  actorOptions(
    claim
      .command("get")
      .argument("<id>", "claim id")
      .option("--dir <dir>", "package directory", ".")
      .option("--format <format>", "table, json, yaml, or markdown", "json")
      .description("Fetch one claim with its effective status.")
  ).action((id: string, options) => {
    const e = openEngine(options.dir, options);
    emit(guard(() => e.getClaim(id)), options.format as Format);
  });

  actorOptions(
    claim
      .command("list")
      .option("--dir <dir>", "package directory", ".")
      .option("--subject <id>", "filter by subject entity")
      .option("--predicate <id>", "filter by predicate")
      .option("--status <list>", "comma-separated claim statuses", "asserted")
      .option("--limit <n>", "maximum rows", "50")
      .option("--format <format>", "table, json, yaml, markdown, or ndjson", "table")
      .description("List claims with their status, time, and source count.")
  ).action((options) => {
    const e = openEngine(options.dir, options);
    const rows = e.store
      .listClaims({
        subject: options.subject,
        predicate: options.predicate,
        status: options.status.split(",").map((s: string) => s.trim()),
        limit: Number.parseInt(options.limit, 10)
      })
      .map((item) => ({
        id: item.id,
        subject: item.subject,
        predicate: item.predicate,
        object: "entity" in item.object ? item.object.entity : item.object.value,
        status: item.status,
        confidence: item.confidence ?? "",
        validFrom: item.validTime?.from ?? "",
        sources: item.sources?.length ?? 0
      }));
    emit(rows, options.format as Format);
  });

  actorOptions(
    claim
      .command("history")
      .argument("<id>", "claim id")
      .option("--dir <dir>", "package directory", ".")
      .option("--format <format>", "table, json, yaml, or markdown", "table")
      .description("Show the append-only status history of a claim.")
  ).action((id: string, options) => {
    const e = openEngine(options.dir, options);
    emit(guard(() => e.claimHistory(id)), options.format as Format);
  });

  for (const [name, description] of [
    ["propose", "Propose a new claim as a change set."],
    ["assert", "Propose a claim for immediate application (still policy-checked)."]
  ] as const) {
    actorOptions(
      claim
        .command(name)
        .requiredOption("--subject <id>", "subject entity id")
        .requiredOption("--predicate <id>", "relationship or property id")
        .option("--object-entity <id>", "object entity id (relationship claim)")
        .option("--object-value <value>", "object value (property claim)")
        .option("--dir <dir>", "package directory", ".")
        .option("--source <id>", "source id backing the claim")
        .option("--first-party", "declare this a manual first-party assertion")
        .option("--confidence <n>", "confidence between 0 and 1")
        .option("--valid-from <iso>", "start of domain valid time")
        .option("--run <id>", "LogicSRC run id (required for agent actors)")
        .description(description)
    ).action((options) => {
      if (!options.objectEntity && options.objectValue === undefined) {
        fail("Provide --object-entity or --object-value", EXIT.usage);
      }
      const e = openEngine(options.dir, options);
      const value: Record<string, unknown> = {
        subject: options.subject,
        predicate: options.predicate,
        object: options.objectEntity
          ? { entity: options.objectEntity }
          : { value: coerce(options.objectValue) },
        ...(options.source ? { sources: [options.source] } : {}),
        ...(options.firstParty ? { firstParty: true } : {}),
        ...(options.confidence ? { confidence: Number.parseFloat(options.confidence) } : {}),
        ...(options.validFrom ? { validTime: { from: options.validFrom, to: null } } : {})
      };
      const cs = guard(() =>
        e.createOntologyChangeSet({
          title: `${options.subject} ${options.predicate} ${options.objectEntity ?? options.objectValue}`,
          operations: [{ op: "assert-claim", value }],
          runId: options.run
        })
      );
      // R143: writes land as a proposal; nothing is applied by a bare command.
      console.log(`Proposed change set ${cs.id} (status: ${cs.status}).`);
    });
  }

  for (const [name, op, description] of [
    ["dispute", "dispute-claim", "Dispute an existing claim."],
    ["retract", "retract-claim", "Retract an existing claim."]
  ] as const) {
    actorOptions(
      claim
        .command(name)
        .argument("<id>", "target claim id")
        .option("--dir <dir>", "package directory", ".")
        .option("--reason <text>", "why")
        .description(description)
    ).action((id: string, options) => {
      const e = openEngine(options.dir, options);
      const cs = guard(() =>
        e.createOntologyChangeSet({
          title: `${name} ${id}`,
          rationale: options.reason,
          operations: [{ op, target: id, reason: options.reason } as ChangeOperation]
        })
      );
      console.log(`Proposed change set ${cs.id} (status: ${cs.status}).`);
    });
  }

  /* ── query ──────────────────────────────────────────────────────────── */

  const query = ontology.command("query").description("Run and explain portable queries.");

  actorOptions(
    query
      .command("list")
      .option("--dir <dir>", "package directory", ".")
      .option("--format <format>", "table, json, yaml, or markdown", "table")
      .description("List saved queries.")
  ).action((options) => {
    const e = openEngine(options.dir, options);
    emit(
      e.getOntologySchema().queries.map((q) => ({ id: q.id, label: q.label ?? "", description: q.description })),
      options.format as Format
    );
  });

  actorOptions(
    query
      .command("run")
      .argument("<query>", "saved query id or path to a query file")
      .option("--dir <dir>", "package directory", ".")
      .option("--param <key=value...>", "bind a saved-query parameter")
      .option("--as-of <iso>", "evaluate against domain valid time")
      .option("--status <list>", "comma-separated claim statuses", "asserted")
      .option("--limit <n>", "maximum rows")
      .option("--format <format>", "table, json, yaml, markdown, or ndjson", "table")
      .description("Run a saved or file-based query.")
  ).action((queryRef: string, options) => {
    const e = openEngine(options.dir, options);
    const body = loadQuery(e, queryRef);
    const result = guard(() =>
      e.queryOntology(
        {
          ...body,
          ...(options.asOf ? { asOf: options.asOf } : {}),
          ...(options.limit ? { limit: Number.parseInt(options.limit, 10) } : {}),
          include: {
            ...body.include,
            claimStatus: options.status.split(",").map((s: string) => s.trim())
          }
        },
        parseParams(options.param)
      )
    );

    emit(
      result.rows.map((row) => ({ ...row.bindings, claims: row.claims.length })),
      options.format as Format
    );
    if (result.explanation.truncated) {
      console.error("note: results were truncated by the row limit");
    }
  });

  actorOptions(
    query
      .command("explain")
      .argument("<query>", "saved query id or path to a query file")
      .option("--dir <dir>", "package directory", ".")
      .option("--row <n>", "which result row to explain", "0")
      .option("--param <key=value...>", "bind a saved-query parameter")
      .option("--format <format>", "table, json, yaml, or markdown", "markdown")
      .description("Show the claims, sources, and evidence behind one answer.")
  ).action((queryRef: string, options) => {
    const e = openEngine(options.dir, options);
    const result = guard(() => e.queryOntology(loadQuery(e, queryRef), parseParams(options.param)));
    const explanation = guard(() =>
      e.explainOntologyResult(result.id, Number.parseInt(options.row, 10))
    );

    if (options.format !== "markdown") {
      emit(explanation, options.format as Format);
      return;
    }

    console.log(`### Why this row is present\n`);
    console.log(`Ontology: \`${explanation.ontology}\``);
    console.log(`Claim statuses included: ${explanation.claimStatus.join(", ")}`);
    if (explanation.asOf) console.log(`As of: ${explanation.asOf}`);
    console.log("");
    explanation.claims.forEach((entry, index) => {
      const object = "entity" in entry.claim.object ? entry.claim.object.entity : entry.claim.object.value;
      console.log(`${index + 1}. \`${entry.claim.subject}\` —${entry.claim.predicate}→ \`${object}\``);
      console.log(`   - status: ${entry.claim.status}, confidence: ${entry.claim.confidence ?? "n/a"}`);
      console.log(`   - asserted by ${entry.claim.assertedBy} at ${entry.claim.assertedAt}`);
      for (const source of entry.sources) console.log(`   - source: ${source.title ?? source.id} <${source.uri}>`);
      for (const ev of entry.evidence) console.log(`   - evidence: ${ev.id} (${ev.selector.type})`);
      for (const h of entry.history) console.log(`   - ${h.at} ${h.status} by ${h.by}`);
    });
  });

  /* ── change sets ────────────────────────────────────────────────────── */

  const changeset = ontology.command("changeset").description("Propose, review, approve, and apply changes.");

  actorOptions(
    changeset
      .command("list")
      .option("--dir <dir>", "package directory", ".")
      .option("--format <format>", "table, json, yaml, or markdown", "table")
      .description("List change sets in this session.")
  ).action((options) => {
    const e = openEngine(options.dir, options);
    emit(
      e.store.listChangeSets().map((cs) => ({
        id: cs.id,
        title: cs.title,
        status: cs.status,
        operations: cs.operations.length,
        createdBy: cs.createdBy
      })),
      options.format as Format
    );
  });

  actorOptions(
    changeset
      .command("create")
      .requiredOption("--file <path>", "JSON or YAML file containing operations")
      .requiredOption("--title <text>", "change set title")
      .option("--dir <dir>", "package directory", ".")
      .option("--rationale <text>", "why this change is proposed")
      .option("--format <format>", "table, json, yaml, or markdown", "json")
      .description("Create a change set from a file of operations.")
  ).action((options) => {
    const e = openEngine(options.dir, options);
    const operations = readOperations(options.file);
    const cs = guard(() =>
      e.createOntologyChangeSet({ title: options.title, rationale: options.rationale, operations })
    );
    emit(cs, options.format as Format);
  });

  actorOptions(
    changeset
      .command("diff")
      .argument("<file>", "change set file (JSON or YAML)")
      .option("--dir <dir>", "package directory", ".")
      .option("--format <format>", "text, json, yaml, or markdown", "text")
      .description("Show the semantic impact of a change set: counts, warnings, affected queries.")
  ).action((file: string, options) => {
    const e = openEngine(options.dir, options);
    const changeSet = readChangeSet(file);
    const diff = guard(() => diffChangeSet(e.store, changeSet));

    if (options.format !== "text") {
      emit(diff, options.format as Format);
      return;
    }

    console.log(`Change set: ${diff.title}\n`);
    for (const [label, count] of Object.entries(diff.summary)) {
      if (count > 0) console.log(`+ ${count} ${label.replace(/([A-Z])/g, " $1").toLowerCase()}`);
    }
    for (const warning of diff.warnings) console.log(`! ${warning.message}`);
    if (diff.affectedQueries.length > 0) {
      console.log("\nAffected saved queries");
      for (const q of diff.affectedQueries) console.log(`  ${q.id}: result count ${q.before} → ${q.after}`);
    }
    console.log(`\nApproval policy\n  ${diff.requiredApprovals} approval(s) required`);
  });

  actorOptions(
    changeset
      .command("apply")
      .argument("<file>", "change set file (JSON or YAML)")
      .option("--dir <dir>", "package directory", ".")
      .option("--approve", "record an approval from this actor first")
      .option("--format <format>", "table, json, yaml, or markdown", "json")
      .description("Apply a change set. Approval policy is enforced; --yolo cannot bypass it.")
  ).action((file: string, options) => {
    const e = openEngine(options.dir, options);
    const source = readChangeSet(file);
    const created = guard(() =>
      e.createOntologyChangeSet({
        title: source.title,
        rationale: source.rationale,
        operations: source.operations,
        requiredApprovals: source.requiredApprovals
      })
    );
    if (options.approve) guard(() => e.approveOntologyChangeSet(created.id));
    const applied = guard(() => e.applyOntologyChangeSet(created.id));
    emit(
      {
        changeSet: applied.changeSet.id,
        revision: applied.revision,
        addedEntities: applied.addedEntities.length,
        addedClaims: applied.addedClaims.length,
        events: applied.events.length
      },
      options.format as Format
    );
    console.error(
      "note: this in-memory session is not written back to disk; use the SDK or a persistent adapter to persist."
    );
  });

  /* ── interop and audit ──────────────────────────────────────────────── */

  actorOptions(
    ontology
      .command("export")
      .option("--dir <dir>", "package directory", ".")
      .option("--format <format>", "json or jsonld", "jsonld")
      .option("--out <file>", "write to a file instead of stdout")
      .description("Export the package, reporting any fields the target format cannot carry.")
  ).action((options) => {
    const pkg = guard(() => loadOntologyPackage(resolve(options.dir)));
    const output =
      options.format === "json"
        ? { document: buildOntologyPackage(pkg), lossy: [] as Array<{ objectId: string; fields: string[] }> }
        : exportJsonLd(pkg);

    // R178: never hide a lossy export behind a success message.
    if (output.lossy.length > 0) {
      console.error(`warning: ${output.lossy.length} object(s) have fields this format cannot carry:`);
      for (const entry of output.lossy.slice(0, 10)) {
        console.error(`  ${entry.objectId}: ${entry.fields.join(", ")}`);
      }
      if (output.lossy.length > 10) console.error(`  ... and ${output.lossy.length - 10} more`);
    }

    const text = `${JSON.stringify(output.document, null, 2)}\n`;
    if (options.out) {
      writeFileSync(resolve(options.out), text, "utf8");
      console.log(`Wrote ${resolve(options.out)}`);
      return;
    }
    process.stdout.write(text);
  });

  actorOptions(
    ontology
      .command("import")
      .requiredOption("--file <path>", "JSON-LD document to import")
      .option("--dir <dir>", "package directory", ".")
      .option("--propose", "emit the operations as a change set proposal", true)
      .option("--format <format>", "table, json, yaml, or markdown", "json")
      .description("Import JSON-LD as proposed operations. Imports never apply directly.")
  ).action((options) => {
    const e = openEngine(options.dir, options);
    const document = readJsonOrYaml(options.file) as Record<string, unknown>;
    const result = guard(() => e.importOntology({ format: "jsonld", document }));
    emit(
      { entities: result.entities, claims: result.claims, proposedOperations: result.operations.length },
      options.format as Format
    );
  });

  actorOptions(
    ontology
      .command("audit")
      .option("--dir <dir>", "package directory", ".")
      .option("--limit <n>", "maximum events", "50")
      .option("--format <format>", "table, json, yaml, markdown, or ndjson", "table")
      .description("Show the event log for this session.")
  ).action((options) => {
    const e = openEngine(options.dir, options);
    emit(
      e.listEvents({ limit: Number.parseInt(options.limit, 10) }).map((event) => ({
        at: event.at,
        type: event.type,
        actor: event.actor,
        subject: event.subject ?? "",
        revision: event.revision ?? ""
      })),
      options.format as Format
    );
  });
}

/* ── helpers ──────────────────────────────────────────────────────────── */

function coerce(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value !== "" && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

function parseParams(pairs: string[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const pair of pairs ?? []) {
    const index = pair.indexOf("=");
    if (index < 0) fail(`--param expects key=value, got ${JSON.stringify(pair)}`, EXIT.usage);
    out[pair.slice(0, index)] = coerce(pair.slice(index + 1));
  }
  return out;
}

function readJsonOrYaml(path: string): unknown {
  const raw = readFileSync(resolve(path), "utf8");
  if (path.toLowerCase().endsWith(".json") || path.toLowerCase().endsWith(".jsonld")) {
    return JSON.parse(raw) as unknown;
  }
  return parseYaml(raw) as unknown;
}

function readOperations(path: string): ChangeOperation[] {
  const parsed = readJsonOrYaml(path);
  const operations = Array.isArray(parsed)
    ? parsed
    : ((parsed as { operations?: unknown[] }).operations ?? []);
  if (!Array.isArray(operations) || operations.length === 0) {
    fail(`${path} contains no operations`, EXIT.usage);
  }
  return operations as ChangeOperation[];
}

function readChangeSet(path: string): {
  id: string;
  title: string;
  rationale?: string;
  operations: ChangeOperation[];
  requiredApprovals?: number;
  createdAt: string;
  createdBy: string;
  status: "proposed";
  openontology: string;
  kind: "ChangeSet";
} {
  const parsed = readJsonOrYaml(path) as Record<string, unknown>;
  const operations = Array.isArray(parsed) ? (parsed as unknown as ChangeOperation[]) : readOperations(path);
  return {
    openontology: "0.1",
    kind: "ChangeSet",
    id: (parsed.id as string) ?? `changeset:${path}`,
    title: (parsed.title as string) ?? "Untitled change set",
    rationale: parsed.rationale as string | undefined,
    operations,
    requiredApprovals: parsed.requiredApprovals as number | undefined,
    createdAt: (parsed.createdAt as string) ?? new Date().toISOString(),
    createdBy: (parsed.createdBy as string) ?? "local",
    status: "proposed"
  };
}

function loadQuery(engine: OntologyEngine, ref: string): QueryBody {
  const saved = engine.getOntologySchema().queries.find((q) => q.id === ref);
  if (saved) return saved.query;

  const parsed = readJsonOrYaml(ref) as Record<string, unknown>;
  return (parsed.query ?? parsed) as QueryBody;
}
