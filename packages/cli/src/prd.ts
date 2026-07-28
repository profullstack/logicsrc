import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { stringify as toYaml } from "yaml";
import {
  checkTransition,
  createPrd,
  findPrd,
  initPrdCollection,
  loadPrdCollection,
  nextPrdNumber,
  nextStatuses,
  prdToTasks,
  renderDocument,
  renderIndex,
  renderReport,
  reportFor,
  rewriteFrontMatter,
  summarize,
  validatePrdCollection,
  validateTasks,
  writeIndex,
  type PrdDocument,
  type PrdStatus,
  type Priority,
  type ReportFormat
} from "@logicsrc/openprd";

/** Stable exit codes for CI: 0 ok · 1 invalid · 2 usage · 3 not found. */
export const PRD_EXIT = { ok: 0, invalid: 1, usage: 2, notFound: 3 } as const;

type Format = "table" | "json" | "yaml" | "markdown" | "ndjson";

const DEFAULT_DIR = "./prd";

function fail(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

function emit(data: unknown, format: Format): void {
  switch (format) {
    case "json":
      console.log(JSON.stringify(data, null, 2));
      return;
    case "yaml":
      console.log(toYaml(data).trimEnd());
      return;
    case "ndjson":
      for (const row of Array.isArray(data) ? data : [data]) console.log(JSON.stringify(row));
      return;
    case "markdown": {
      const rows = (Array.isArray(data) ? data : [data]) as Array<Record<string, unknown>>;
      if (rows.length === 0) {
        console.log("_No rows._");
        return;
      }
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      console.log(`| ${columns.join(" | ")} |`);
      console.log(`| ${columns.map(() => "---").join(" | ")} |`);
      for (const row of rows) {
        console.log(`| ${columns.map((c) => String(row[c] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
      }
      return;
    }
    default: {
      const rows = Array.isArray(data) ? data : [data];
      if (rows.length === 0) {
        console.log("(no PRDs)");
        return;
      }
      console.table(rows);
    }
  }
}

function open(dir: string) {
  try {
    return loadPrdCollection(resolve(dir));
  } catch (error) {
    return fail((error as Error).message, PRD_EXIT.usage);
  }
}

function mustFind(dir: string, ref: string): { doc: PrdDocument; dir: string } {
  const collection = open(dir);
  const doc = findPrd(collection, ref);
  if (!doc) {
    fail(
      `No PRD matching "${ref}" in ${collection.dir}. Known ids: ${
        collection.documents.map((d) => d.frontMatter.id ?? d.filePrefix).join(", ") || "(none)"
      }`,
      PRD_EXIT.notFound
    );
  }
  return { doc, dir: collection.dir };
}

function splitList(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items && items.length > 0 ? items : undefined;
}

export function registerPrdCommands(program: Command): void {
  const prd = program
    .command("prd")
    .description("OpenPRD: numbered product requirements documents with a fixed shape and lifecycle.");

  prd
    .command("init")
    .argument("[dir]", "collection directory", DEFAULT_DIR)
    .option("--title <text>", "heading for the generated index")
    .description("Create a prd/ collection with the OpenPRD template and an index.")
    .action((dir: string, options) => {
      const result = initPrdCollection(resolve(dir), { title: options.title });
      for (const file of result.created) console.log(`Created ${result.dir}/${file}`);
      for (const file of result.skipped) console.log(`Kept existing ${result.dir}/${file}`);
      console.log(`\nNext: logicsrc prd new "Short imperative title"`);
    });

  prd
    .command("new")
    .argument("<title>", "imperative title — start with a verb")
    .option("--dir <dir>", "collection directory", DEFAULT_DIR)
    .option("--author <list>", "comma-separated authors")
    .option("--status <status>", "initial status", "Draft")
    .option("--repo <owner/name>", "target repository")
    .option("--tags <list>", "comma-separated tags")
    .option("--owner <did>", "accountable owner")
    .option("--discussion <url>", "URL of the discussion thread")
    .option("--supersedes <id>", "four-digit id this PRD replaces")
    .description("Create the next numbered PRD from the template.")
    .action((title: string, options) => {
      try {
        const result = createPrd(resolve(options.dir), {
          title,
          authors: splitList(options.author),
          status: options.status as PrdStatus,
          repo: options.repo,
          tags: splitList(options.tags),
          owner: options.owner,
          discussion: options.discussion,
          supersedes: options.supersedes
        });
        writeIndex(resolve(options.dir));
        console.log(`Created ${result.path}`);
        console.log(`Assigned id ${result.id}. Index updated.`);
        console.log(`\nNext: fill in the eight sections, then logicsrc prd validate ${options.dir}`);
      } catch (error) {
        fail((error as Error).message, PRD_EXIT.usage);
      }
    });

  prd
    .command("list")
    .option("--dir <dir>", "collection directory", DEFAULT_DIR)
    .option("--status <list>", "comma-separated statuses to include")
    .option("--tag <tag>", "only PRDs carrying this tag")
    .option("--format <format>", "table, json, yaml, markdown, or ndjson", "table")
    .description("List the PRDs in a collection.")
    .action((options) => {
      const collection = open(options.dir);
      const statuses = splitList(options.status);
      const rows = collection.documents
        .map(summarize)
        .filter((row) => !statuses || statuses.includes(row.status))
        .filter((row) => !options.tag || row.tags.split(", ").includes(options.tag));
      emit(rows, options.format as Format);
    });

  prd
    .command("show")
    .argument("<ref>", "id, number, slug, or filename")
    .option("--dir <dir>", "collection directory", DEFAULT_DIR)
    .option("--format <format>", "text, json, yaml, or markdown", "text")
    .description("Show one PRD: front-matter, sections, and requirements.")
    .action((ref: string, options) => {
      const { doc } = mustFind(options.dir, ref);
      console.log(renderDocument(doc, options.format as "text" | "json" | "yaml" | "markdown"));
    });

  prd
    .command("validate")
    .argument("[dir]", "collection directory", DEFAULT_DIR)
    .option("--strict", "treat lint warnings as errors")
    .option("--format <format>", "text, json, yaml, or markdown", "text")
    .option("--id <ref>", "validate a single PRD instead of the collection")
    .description("Check conformance: filename, front-matter, id match, and the eight sections.")
    .action((dir: string, options) => {
      if (options.id) {
        const { doc } = mustFind(dir, options.id);
        const report = reportFor(doc, { strict: options.strict === true });
        console.log(renderReport(report, options.format as ReportFormat));
        if (!report.ok) process.exit(PRD_EXIT.invalid);
        return;
      }

      const collection = open(dir);
      const report = validatePrdCollection(collection, {
        strict: options.strict === true,
        expectedIndex: renderIndex(collection)
      });
      console.log(renderReport(report, options.format as ReportFormat));
      if (!report.ok) process.exit(PRD_EXIT.invalid);
    });

  prd
    .command("lint")
    .argument("[dir]", "collection directory", DEFAULT_DIR)
    .option("--format <format>", "text, json, yaml, or markdown", "text")
    .description("Report warnings and suggestions without failing on them.")
    .action((dir: string, options) => {
      const collection = open(dir);
      const report = validatePrdCollection(collection, { expectedIndex: renderIndex(collection) });
      const advisory = {
        ...report,
        ok: true,
        findings: report.findings.filter((finding) => finding.severity !== "error")
      };
      console.log(renderReport(advisory, options.format as ReportFormat));
    });

  prd
    .command("index")
    .argument("[dir]", "collection directory", DEFAULT_DIR)
    .option("--write", "write prd/README.md instead of printing it")
    .option("--title <text>", "heading for the index")
    .description("Generate the collection index from the PRDs on disk.")
    .action((dir: string, options) => {
      if (!options.write) {
        console.log(renderIndex(open(dir), { title: options.title }));
        return;
      }
      const result = writeIndex(resolve(dir), { title: options.title });
      console.log(result.changed ? `Wrote ${result.path}` : `${result.path} already up to date`);
    });

  prd
    .command("status")
    .argument("<ref>", "id, number, slug, or filename")
    .argument("[status]", "new status; omit to list the allowed next steps")
    .option("--dir <dir>", "collection directory", DEFAULT_DIR)
    .option("--superseded-by <id>", "required when moving to Superseded")
    .option("--dry-run", "show what would change without writing")
    .description("Move a PRD through the lifecycle, enforcing the allowed transitions.")
    .action((ref: string, status: string | undefined, options) => {
      const { doc } = mustFind(options.dir, ref);
      const from = doc.frontMatter.status;

      if (!status) {
        const allowed = nextStatuses(from);
        console.log(`${doc.file} is ${from}.`);
        console.log(allowed.length ? `Allowed next: ${allowed.join(", ")}` : "This status is terminal.");
        return;
      }

      const check = checkTransition(from, status as PrdStatus, {
        supersededBy: options.supersededBy ?? doc.frontMatter["superseded-by"]
      });
      if (!check.ok) {
        fail(`Cannot move ${doc.file} from ${from} to ${status}: ${check.reason}`, PRD_EXIT.usage);
      }

      const today = new Date().toISOString().slice(0, 10);
      const updates: Record<string, string | null> = { status, updated: today };
      if (options.supersededBy) updates["superseded-by"] = options.supersededBy;

      if (options.dryRun) {
        console.log(`${doc.file}: ${from} → ${status} (updated: ${today})`);
        if (options.supersededBy) console.log(`  superseded-by: ${options.supersededBy}`);
        console.log("(dry run; nothing written)");
        return;
      }

      const source = readFileSync(doc.path, "utf8");
      writeFileSync(doc.path, rewriteFrontMatter(source, updates), "utf8");
      writeIndex(resolve(options.dir));
      console.log(`${doc.file}: ${from} → ${status}`);
    });

  prd
    .command("next")
    .argument("[dir]", "collection directory", DEFAULT_DIR)
    .description("Print the next free four-digit id.")
    .action((dir: string) => {
      console.log(nextPrdNumber(open(dir)));
    });

  prd
    .command("tasks")
    .argument("<ref>", "id, number, slug, or filename")
    .option("--dir <dir>", "collection directory", DEFAULT_DIR)
    .option("--creator <did>", "LogicSRC DID for the created tasks")
    .option("--board <path>", "board path, e.g. /prd/0001")
    .option("--priority <list>", "only these priorities, e.g. P0,P1")
    .option("--format <format>", "json, ndjson, yaml, or table", "json")
    .description("Map each requirement onto a LogicSRC task document (the optional bridge).")
    .action((ref: string, options) => {
      const { doc } = mustFind(options.dir, ref);
      const { tasks, skipped } = prdToTasks(doc, {
        creator: options.creator,
        board: options.board,
        priorities: splitList(options.priority) as Priority[] | undefined
      });

      const problems = validateTasks(tasks);
      if (problems.length > 0) {
        for (const problem of problems) {
          console.error(`task ${problem.index} is not a valid logicsrc.task: ${problem.errors.join("; ")}`);
        }
        process.exit(PRD_EXIT.invalid);
      }

      if (options.format === "table") {
        emit(
          tasks.map((task) => ({ title: task.title, board: task.board, creator: task.creator_did })),
          "table"
        );
      } else {
        emit(tasks, options.format as Format);
      }

      for (const entry of skipped) {
        console.error(`skipped ${entry.requirement}: ${entry.reason}`);
      }
    });

  prd
    .command("export")
    .argument("[dir]", "collection directory", DEFAULT_DIR)
    .option("--format <format>", "json, ndjson, yaml, or markdown", "json")
    .option("--out <file>", "write to a file instead of stdout")
    .description("Export the parsed collection for other tools.")
    .action((dir: string, options) => {
      const collection = open(dir);
      const payload = collection.documents.map((doc) => ({
        id: doc.frontMatter.id ?? doc.filePrefix,
        file: doc.file,
        frontMatter: doc.frontMatter,
        sections: doc.sections.map((section) => ({ name: section.name, empty: section.empty })),
        requirements: doc.requirements
      }));

      if (options.out) {
        const text =
          options.format === "ndjson"
            ? `${payload.map((row) => JSON.stringify(row)).join("\n")}\n`
            : options.format === "yaml"
              ? `${toYaml(payload)}`
              : `${JSON.stringify(payload, null, 2)}\n`;
        writeFileSync(resolve(options.out), text, "utf8");
        console.log(`Wrote ${resolve(options.out)}`);
        return;
      }

      emit(payload, options.format as Format);
    });
}
