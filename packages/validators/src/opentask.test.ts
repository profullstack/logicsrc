import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertSchemaKind, validate } from "./index.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const json = (path: string) => JSON.parse(read(path));
const blocks = (path: string) => [...read(path).matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]!);
const example = () => json("../../schemas/fixtures/opentask/export-a-task-as-moshscript.json");
const workflow = () => json("../../schemas/fixtures/openworkflow/release-a-package.json");

function errorAt(kind: "opentask" | "openworkflow", data: unknown, keyword: string, path: string) {
  const result = validate(kind, data);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ keyword, instancePath: path }));
}

describe("OpenTask", () => {
  it("registers the schemas and validates the fixtures", () => {
    for (const kind of ["opentask", "openworkflow", "openworkflow-index"]) expect(assertSchemaKind(kind)).toBe(kind);
    expect(validate("opentask", json("../../schemas/fixtures/opentask/smallest.json"))).toMatchObject({ ok: true });
    expect(validate("opentask", example())).toMatchObject({ ok: true });
    expect(validate("openworkflow", workflow())).toMatchObject({ ok: true });
    expect(validate("openworkflow-index", json("../../schemas/fixtures/openworkflow/index.json"))).toMatchObject({ ok: true });
  });

  it("matches the examples printed in the specifications", () => {
    const task = blocks("../../../docs/opentask.md").map((b) => JSON.parse(b));
    expect(task[0]).toEqual(json("../../schemas/fixtures/opentask/smallest.json"));
    expect(task.at(-1)).toEqual(example());
    const flow = blocks("../../../docs/openworkflow.md").map((b) => JSON.parse(b));
    expect(flow[0]).toEqual(workflow());
    expect(flow.at(-1)).toEqual(json("../../schemas/fixtures/openworkflow/index.json"));
  });

  it("refuses coordinates and typed text", () => {
    const t = example();
    t.steps[0].x = 120;
    errorAt("opentask", t, "additionalProperties", "/steps/0");
    const u = example();
    u.steps[1].text = "hunter2";
    errorAt("opentask", u, "pattern", "/steps/1/text");
  });

  it("checks numbering, apps, placeholders and examples", () => {
    const t = example();
    t.steps[2].n = 7;
    t.steps[0].app = "Firefox";
    t.steps[1].target.name = "{{nope}}";
    t.parameters.push({ name: "password", sensitivity: "secret", example: "x" });
    errorAt("opentask", t, "stepNumber", "/steps/2/n");
    errorAt("opentask", t, "unknownApp", "/steps/0/app");
    errorAt("opentask", t, "unknownParameter", "/steps/1");
    errorAt("opentask", t, "sensitiveExample", "/parameters/1/example");
  });

  it("publishes a failed demonstration only as failed", () => {
    const t = example();
    t.source.outcome = "failure";
    errorAt("opentask", t, "unsuccessfulSource", "/status");
    t.status = "failed";
    expect(validate("opentask", t)).toMatchObject({ ok: true });
  });
});

describe("OpenWorkflow", () => {
  it("takes inline tasks and checks them", () => {
    const w = workflow();
    w.tasks.push({ task: example(), after: ["write-the-changelog"] });
    expect(validate("openworkflow", w)).toMatchObject({ ok: true });
    w.tasks[2].task.steps[0].n = 2;
    errorAt("openworkflow", w, "stepNumber", "/tasks/2/task/steps/0/n");
  });

  it("checks ids and after", () => {
    const w = workflow();
    w.tasks[0].after = ["write-the-changelog"];
    errorAt("openworkflow", w, "unknownAfter", "/tasks/0/after");
    const d = workflow();
    d.tasks[1].id = "bump-the-version";
    d.tasks[1].after = [];
    errorAt("openworkflow", d, "duplicateTask", "/tasks/1");
    const s = workflow();
    s.tasks[1].after = ["write-the-changelog"];
    errorAt("openworkflow", s, "selfAfter", "/tasks/1/after");
  });

  it("refuses a reference without a digest", () => {
    const w = workflow();
    delete w.tasks[0].sha256;
    expect(validate("openworkflow", w).ok).toBe(false);
  });
});
