import type { ErrorObject } from "ajv";

// Called only after the JSON Schema has checked the shape. These are the
// OpenTask and OpenWorkflow rules that need sibling values: steps numbered
// from 1 with no gaps, placeholders and apps that resolve, no example on a
// value that is personal or secret, and `after` naming only earlier tasks.

type Parameter = { name: string; sensitivity: "public" | "personal" | "secret"; example?: string };
type Step = { n: number; app?: string; text?: string; window?: string; target?: { role?: string; name?: string }; note?: string };
type Task = {
  id: string;
  apps: Array<{ name: string }>;
  parameters?: Parameter[];
  steps: Step[];
  source: { outcome?: string };
  status: string;
};
type Entry = { task?: Task; id?: string; after?: string[] };
type Workflow = { tasks: Entry[] };

const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

function issue(keyword: string, instancePath: string, message: string): ErrorObject {
  return { keyword, instancePath, schemaPath: "#/opentask-semantics", params: {}, message };
}

export function validateOpenTask(data: unknown, base = ""): ErrorObject[] {
  const task = data as Task;
  const errors: ErrorObject[] = [];
  const params = new Map((task.parameters ?? []).map((p) => [p.name, p]));
  const apps = new Set(task.apps.map((a) => a.name));

  if (params.size !== (task.parameters ?? []).length)
    errors.push(issue("uniqueParameters", `${base}/parameters`, "parameter names must be unique"));
  (task.parameters ?? []).forEach((p, i) => {
    if (p.sensitivity !== "public" && p.example !== undefined)
      errors.push(issue("sensitiveExample", `${base}/parameters/${i}/example`, `a ${p.sensitivity} parameter never carries an example`));
  });
  task.steps.forEach((step, i) => {
    const at = `${base}/steps/${i}`;
    if (step.n !== i + 1) errors.push(issue("stepNumber", `${at}/n`, `step ${i + 1} is numbered ${step.n}`));
    if (step.app !== undefined && !apps.has(step.app))
      errors.push(issue("unknownApp", `${at}/app`, `"${step.app}" is not in apps`));
    for (const text of [step.text, step.window, step.target?.role, step.target?.name, step.note]) {
      for (const m of (text ?? "").matchAll(PLACEHOLDER))
        if (!params.has(m[1]!)) errors.push(issue("unknownParameter", at, `{{${m[1]}}} is not a declared parameter`));
    }
  });
  if (task.source.outcome && task.source.outcome !== "success" && task.status !== "failed")
    errors.push(issue("unsuccessfulSource", `${base}/status`, `a demonstration with outcome ${task.source.outcome} is published only as failed`));
  return errors;
}

export function validateOpenWorkflow(data: unknown): ErrorObject[] {
  const workflow = data as Workflow;
  const errors: ErrorObject[] = [];
  const seen = new Set<string>();
  workflow.tasks.forEach((entry, i) => {
    const at = `/tasks/${i}`;
    const id = entry.task?.id ?? entry.id!;
    if (entry.task) errors.push(...validateOpenTask(entry.task, `${at}/task`));
    for (const dep of entry.after ?? []) {
      if (dep === id) errors.push(issue("selfAfter", `${at}/after`, `${id} cannot wait on itself`));
      else if (!seen.has(dep)) errors.push(issue("unknownAfter", `${at}/after`, `"${dep}" is not an earlier task in this workflow`));
    }
    if (seen.has(id)) errors.push(issue("duplicateTask", at, `task id "${id}" appears twice`));
    seen.add(id);
  });
  return errors;
}
