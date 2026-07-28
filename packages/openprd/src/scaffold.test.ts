import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { loadPrdCollection, nextPrdNumber, renderIndex } from "./collection.js";
import { parsePrd } from "./parse.js";
import { createPrd, initPrdCollection, TEMPLATE, writeIndex } from "./scaffold.js";
import { deriveCreatorDid, prdToTasks, validateTasks } from "./tasks.js";
import { validatePrdCollection, validatePrdDocument } from "./validate.js";
import { SECTIONS } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "openprd-scaffold-"));
  dirs.push(dir);
  return dir;
}

describe("init", () => {
  it("creates a template and an index", () => {
    const dir = scratch();
    const result = initPrdCollection(dir);
    expect(result.created.sort()).toEqual(["0000-template.md", "README.md"]);
    expect(existsSync(join(dir, "0000-template.md"))).toBe(true);
  });

  it("is idempotent — a second run keeps what is already there", () => {
    const dir = scratch();
    initPrdCollection(dir);
    const second = initPrdCollection(dir);
    expect(second.created).toEqual([]);
    expect(second.skipped.sort()).toEqual(["0000-template.md", "README.md"]);
  });

  it("ships a template that itself conforms to the standard", () => {
    const doc = parsePrd(TEMPLATE, "0000-template.md");
    expect(doc.sections.map((s) => s.name)).toEqual([...SECTIONS]);
    const errors = validatePrdDocument(doc).filter((f) => f.severity === "error");
    expect(errors).toEqual([]);
  });
});

describe("new", () => {
  it("assigns the next free number and writes a conforming PRD", () => {
    const dir = scratch();
    initPrdCollection(dir);

    const first = createPrd(dir, { title: "Do the thing", authors: ["a@example.com"], today: "2026-07-26" });
    expect(first.id).toBe("0001");
    expect(first.file).toBe("0001-do-the-thing.md");

    const doc = parsePrd(readFileSync(first.path, "utf8"), first.path);
    expect(doc.sections.map((s) => s.name)).toEqual([...SECTIONS]);
    expect(validatePrdDocument(doc).filter((f) => f.severity === "error")).toEqual([]);
  });

  it("numbers from what is on disk rather than reserving in advance", () => {
    const dir = scratch();
    initPrdCollection(dir);
    createPrd(dir, { title: "One", today: "2026-07-26" });
    createPrd(dir, { title: "Two", today: "2026-07-26" });
    expect(nextPrdNumber(loadPrdCollection(dir))).toBe("0003");
    const third = createPrd(dir, { title: "Three", today: "2026-07-26" });
    expect(third.id).toBe("0003");
  });

  it("carries front-matter through from the options", () => {
    const dir = scratch();
    initPrdCollection(dir);
    const created = createPrd(dir, {
      title: "Expand the parked-domain service",
      authors: ["anthony@profullstack.com"],
      repo: "profullstack/logicsrc",
      tags: ["growth", "dns"],
      today: "2026-07-26"
    });
    const doc = parsePrd(readFileSync(created.path, "utf8"), created.path);
    expect(doc.frontMatter).toMatchObject({
      id: "0001",
      title: "Expand the parked-domain service",
      status: "Draft",
      repo: "profullstack/logicsrc",
      created: "2026-07-26",
      updated: "2026-07-26"
    });
    expect(doc.frontMatter.tags).toEqual(["growth", "dns"]);
  });

  it("quotes a title containing YAML-significant characters", () => {
    const dir = scratch();
    initPrdCollection(dir);
    const created = createPrd(dir, { title: "Fix: the thing [again]", today: "2026-07-26" });
    const doc = parsePrd(readFileSync(created.path, "utf8"), created.path);
    expect(doc.frontMatter.title).toBe("Fix: the thing [again]");
  });

  it("refuses to overwrite an existing file", () => {
    const dir = scratch();
    initPrdCollection(dir);
    createPrd(dir, { title: "One", today: "2026-07-26" });
    expect(() => createPrd(dir, { title: "One", id: "0001", today: "2026-07-26" })).toThrow(/already exists/);
  });

  it("rejects a title that yields no slug", () => {
    const dir = scratch();
    initPrdCollection(dir);
    expect(() => createPrd(dir, { title: "!!!", today: "2026-07-26" })).toThrow(/slug/);
  });
});

describe("index", () => {
  it("is deterministic and idempotent", () => {
    const dir = scratch();
    initPrdCollection(dir);
    createPrd(dir, { title: "One", today: "2026-07-26" });

    const first = writeIndex(dir);
    expect(first.changed).toBe(true);
    expect(writeIndex(dir).changed).toBe(false);
    expect(renderIndex(loadPrdCollection(dir))).toBe(renderIndex(loadPrdCollection(dir)));
  });

  it("lists every PRD with its status and links to the file", () => {
    const dir = scratch();
    initPrdCollection(dir);
    createPrd(dir, { title: "One", tags: ["growth"], today: "2026-07-26" });
    createPrd(dir, { title: "Two", status: "Review", today: "2026-07-26" });
    writeIndex(dir);

    const index = readFileSync(join(dir, "README.md"), "utf8");
    expect(index).toContain("[0001](./0001-one.md)");
    expect(index).toContain("[0002](./0002-two.md)");
    expect(index).toContain("Review");
    expect(index).toContain("growth");
  });

  it("renders a placeholder row for an empty collection", () => {
    const dir = scratch();
    initPrdCollection(dir);
    expect(renderIndex(loadPrdCollection(dir))).toContain("No PRDs yet");
  });
});

describe("task bridge", () => {
  const dir = (() => {
    const d = scratch();
    initPrdCollection(d);
    createPrd(d, {
      title: "Expand the parked-domain service",
      authors: ["anthony@profullstack.com"],
      repo: "profullstack/logicsrc",
      today: "2026-07-26"
    });
    return d;
  })();

  const doc = () => loadPrdCollection(dir).documents[0]!;

  it("derives a LogicSRC DID from an author email", () => {
    expect(deriveCreatorDid("anthony@profullstack.com")).toBe("anthony.profullstack");
    expect(deriveCreatorDid("already.did")).toBe("already.did");
    expect(deriveCreatorDid(undefined)).toBe("openprd.local");
  });

  it("emits one schema-valid task per requirement", () => {
    const { tasks } = prdToTasks(doc());
    expect(tasks).toHaveLength(doc().requirements.length);
    expect(validateTasks(tasks)).toEqual([]);
    expect(tasks[0]).toMatchObject({
      type: "logicsrc.task",
      board: "/prd/0001",
      creator_did: "anthony.profullstack",
      github_repo: "profullstack/logicsrc",
      status: "draft"
    });
  });

  it("keeps titles inside the schema's 160-character limit", () => {
    const long = "x".repeat(400);
    const parsed = parsePrd(
      `---\nopenprd: "0.2"\nid: "0001"\ntitle: Long\nstatus: Draft\n---\n\n## Requirements\n\n- R1 [P0] ${long}\n`,
      "0001-long.md"
    );
    const { tasks } = prdToTasks(parsed);
    expect(tasks[0]!.title.length).toBeLessThanOrEqual(160);
    expect(validateTasks(tasks)).toEqual([]);
  });

  it("filters by priority and reports what it skipped", () => {
    const parsed = parsePrd(
      `---\nopenprd: "0.2"\nid: "0001"\ntitle: Mixed\nstatus: Draft\n---\n\n## Requirements\n\n- R1 [P0] Must.\n- R2 [P2] Maybe.\n`,
      "0001-mixed.md"
    );
    const { tasks, skipped } = prdToTasks(parsed, { priorities: ["P0"] });
    expect(tasks).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ requirement: "R2" });
  });

  it("records where each task came from", () => {
    const { tasks } = prdToTasks(doc());
    expect(tasks[0]!.description).toMatch(/From OpenPRD 0001 .* line \d+/);
  });
});

/**
 * Dogfood: this repo's own collection and standard document must satisfy the
 * implementation. If the standard changes, these fail first.
 */
describe("this repository", () => {
  const prdDir = join(REPO, "prd");
  const hasCollection = existsSync(join(prdDir, "0001-add-logicsrc-openontology-spec.md"));
  const maybe = hasCollection ? it : it.skip;

  maybe("has a conforming prd/ collection with a current index", () => {
    const collection = loadPrdCollection(prdDir);
    const report = validatePrdCollection(collection, { expectedIndex: renderIndex(collection) });
    const problems = report.findings.filter((f) => f.severity === "error" || f.severity === "warning");
    expect(problems).toEqual([]);
    expect(report.ok).toBe(true);
  });

  maybe("keeps the embedded template identical to docs/openprd/0000-template.md", () => {
    const onDisk = readFileSync(join(REPO, "docs/openprd/0000-template.md"), "utf8");
    expect(TEMPLATE).toBe(onDisk);
  });

  maybe("keeps prd/0000-template.md identical to the embedded template", () => {
    expect(readFileSync(join(prdDir, "0000-template.md"), "utf8")).toBe(TEMPLATE);
  });

  maybe("maps every requirement in PRD 0001 onto a valid task", () => {
    const collection = loadPrdCollection(prdDir);
    const doc = collection.documents.find((d) => d.frontMatter.id === "0001");
    const { tasks } = prdToTasks(doc!);
    expect(tasks.length).toBe(doc!.requirements.length);
    expect(validateTasks(tasks)).toEqual([]);
  });
});

describe("conformance fixtures", () => {
  const fixtures = join(REPO, "packages/schemas/fixtures/openprd");
  const hasFixtures = existsSync(join(fixtures, "conformance.json"));
  const maybe = hasFixtures ? it : it.skip;

  maybe("validates every valid fixture and rejects every invalid one", () => {
    const manifest = JSON.parse(readFileSync(join(fixtures, "conformance.json"), "utf8")) as {
      valid: Array<{ fixture: string; file: string }>;
      invalid: Array<{ fixture: string; file: string; code: string; reason: string }>;
    };

    for (const entry of manifest.valid) {
      const doc = parsePrd(readFileSync(join(fixtures, entry.fixture), "utf8"), entry.file);
      const errors = validatePrdDocument(doc).filter((f) => f.severity === "error");
      expect(errors, `${entry.fixture} should conform`).toEqual([]);
    }

    for (const entry of manifest.invalid) {
      let codes: string[] = [];
      try {
        const doc = parsePrd(readFileSync(join(fixtures, entry.fixture), "utf8"), entry.file);
        codes = validatePrdDocument(doc)
          .filter((f) => f.severity === "error")
          .map((f) => f.code);
      } catch (error) {
        codes = [(error as { code?: string }).code ?? "OP-P-PARSE"];
      }
      expect(codes, `${entry.fixture} should fail with ${entry.code}`).toContain(entry.code);
    }
  });
});

/** Keeps the scratch helper honest: a collection we build must round-trip. */
describe("round trip", () => {
  it("survives init → new → index → load → validate", () => {
    const dir = scratch();
    initPrdCollection(dir);
    createPrd(dir, { title: "Round trip", authors: ["a@example.com"], today: "2026-07-26" });
    writeFileSync(join(dir, "notes.txt"), "ignored by the loader", "utf8");
    writeIndex(dir);

    const collection = loadPrdCollection(dir);
    expect(collection.documents).toHaveLength(1);
    expect(collection.template).not.toBeNull();
    expect(validatePrdCollection(collection, { expectedIndex: renderIndex(collection) }).ok).toBe(true);
  });
});
