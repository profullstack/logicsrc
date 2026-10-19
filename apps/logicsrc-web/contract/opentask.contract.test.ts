import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readDoc } from "../src/lib/docs";
import { ACTIONS, RULES as TASK_RULES, SENSITIVITY } from "../src/app/opentask/data";
import { ORDERS, RULES as WORKFLOW_RULES } from "../src/app/openworkflow/data";

// The /opentask and /openworkflow landing pages restate the specs' lists, and
// the site serves the worked examples and a workflow index. These tests keep
// all of them in step with docs/opentask.md, docs/openworkflow.md and the
// schema fixtures.

const task = readDoc("opentask") ?? "";
const workflow = readDoc("openworkflow") ?? "";
const root = resolve(__dirname, "../../..");
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

/** The text of a section, from its heading to the next heading of level 2 or 3. */
function section(doc: string, heading: string): string {
  const start = doc.indexOf(`\n${heading}\n`);
  expect(start, `the doc has a ${heading} section`).toBeGreaterThan(-1);
  const next = doc.slice(start + 1).search(/\n#{2,3} /);
  return doc.slice(start, next === -1 ? undefined : start + 1 + next);
}

/** The bold titles of a numbered rule list, without their closing period. */
function ruleTitles(doc: string): string[] {
  return [...section(doc, "## Runner rules").matchAll(/^(\d+)\. \*\*(.+?)\.\*\*/gm)].map((m) => m[2]);
}

/** The first JSON block in a section. */
function firstJson(doc: string, heading: string): unknown {
  const m = section(doc, heading).match(/```json\n([\s\S]*?)\n```/);
  expect(m, `${heading} has a JSON block`).not.toBeNull();
  return JSON.parse(m![1]);
}

describe("OpenTask: the spec, its landing page and its published files agree", () => {
  it("lists the same step actions, in the same order", () => {
    const row = section(task, "## Steps")
      .split("\n")
      .find((line) => line.startsWith("| `action` |"));
    expect(row, "the Steps table has an action row").toBeDefined();
    expect([...row!.split("|")[3].matchAll(/`([^`]+)`/g)].map((m) => m[1])).toEqual([...ACTIONS]);
  });

  it("lists the same sensitivity classes, in the same order", () => {
    const line = section(task, "## Parameters")
      .split("\n")
      .find((l) => l.startsWith("- `sensitivity`"));
    expect(line).toBeDefined();
    expect([...line!.matchAll(/`(public|personal|secret)`/g)].map((m) => m[1])).toEqual(SENSITIVITY.map(([name]) => name));
  });

  it("shows the seven runner rules under the spec's own titles", () => {
    expect(TASK_RULES.map(([title]) => title)).toEqual(ruleTitles(task));
    expect(TASK_RULES.length).toBe(7);
  });

  it("prints the fixture as the worked example, and the site serves the same bytes", () => {
    const fixture = json("packages/schemas/fixtures/opentask/export-a-task-as-moshscript.json");
    expect(firstJson(task, "## Worked example")).toEqual(fixture);
    expect(json("apps/logicsrc-web/public/examples/opentask/export-a-task-as-moshscript.json")).toEqual(fixture);
  });

  it("has no em dashes", () => {
    expect(task).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("OpenWorkflow: the spec, its landing page and its published files agree", () => {
  it("lists the same orders", () => {
    const row = section(workflow, "## The workflow file")
      .split("\n")
      .find((line) => line.startsWith("| `order` |"));
    expect(row).toBeDefined();
    for (const [name] of ORDERS) expect(row).toContain(`\`${name}\``);
  });

  it("shows the five runner rules under the spec's own titles", () => {
    expect(WORKFLOW_RULES.map(([title]) => title)).toEqual(ruleTitles(workflow));
    expect(WORKFLOW_RULES.length).toBe(5);
  });

  it("prints the fixtures as its examples, and the site serves the same bytes", () => {
    const fixture = json("packages/schemas/fixtures/openworkflow/release-a-package.json");
    expect(firstJson(workflow, "## The workflow file")).toEqual(fixture);
    expect(firstJson(workflow, "## The index")).toEqual(json("packages/schemas/fixtures/openworkflow/index.json"));
    expect(json("apps/logicsrc-web/public/examples/openworkflow/release-a-package.json")).toEqual(fixture);
  });

  it("serves a publisher index that lists the example from this site", () => {
    const index = json("apps/logicsrc-web/public/.well-known/openworkflow.json");
    const fixtureIndex = json("packages/schemas/fixtures/openworkflow/index.json");
    expect(index.type).toBe(fixtureIndex.type);
    expect(index.version).toBe(fixtureIndex.version);
    expect(index.publisher).toBe("https://logicsrc.com");
    expect(index.workflows).toEqual([
      { ...fixtureIndex.workflows[0], url: "https://logicsrc.com/examples/openworkflow/release-a-package.json" }
    ]);
  });

  it("has no em dashes", () => {
    expect(workflow).not.toContain(String.fromCharCode(0x2014));
  });
});
