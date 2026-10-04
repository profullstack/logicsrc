import type { ErrorObject } from "ajv";

// Called only after the JSON Schema has checked the shape. These are the
// OpenErrand rules that need sibling values: every reference resolves, every
// template names an input that exists, and nothing personal or secret can be
// rendered onto a hand-off card.

type Source = { from: string; input?: string };
type Input = { type: string; sensitivity: "public" | "personal" | "secret"; role?: string; sources: Source[] };
type Action = { text?: string; gate?: string; choose?: string; answer?: string };
type Rule = { do: Action };
type Step = { id: string; kind: string; rules?: Rule[]; handoff?: string; resume?: string };
type Errand = {
  inputs?: Record<string, Input>;
  rules?: Rule[];
  steps: Step[];
  outcomes: Array<{ name: string; then?: string }>;
  outputs?: { vault?: { when?: string; keys: Record<string, string> }; downloads?: Array<{ to: string; when?: string }> };
  handoffs?: Record<string, { title: string; steps: string[]; command?: string }>;
};

/** Step kinds a runner must hand to a person. */
export const GATE_KINDS = ["declare", "identity-proofing", "code", "mail", "captcha"] as const;

/** Names a hand-off card may use: none of them is a person's data. */
export const HANDOFF_BUILTINS = ["expires_on", "errand.title", "site.name"] as const;

const TEMPLATE = /\{\{\s*([a-z][a-z0-9_.]*)\s*\}\}/g;

export function templateNames(text: string): string[] {
  return [...text.matchAll(TEMPLATE)].map((m) => m[1]!);
}

export function validateOpenErrandReferences(data: unknown): ErrorObject[] {
  const errand = data as Errand;
  const errors: ErrorObject[] = [];
  function report(keyword: string, instancePath: string, message: string) {
    errors.push({ keyword, instancePath, schemaPath: "#/openerrand-semantics", params: {}, message });
  }

  const inputs = errand.inputs ?? {};
  const steps = new Map<string, Step>();
  errand.steps.forEach((step, i) => {
    if (steps.has(step.id)) report("uniqueStep", `/steps/${i}/id`, "duplicates an existing step id");
    steps.set(step.id, step);
  });
  const outcomes = new Set<string>();
  errand.outcomes.forEach((outcome, i) => {
    if (outcomes.has(outcome.name)) report("uniqueOutcome", `/outcomes/${i}/name`, "duplicates an existing outcome name");
    outcomes.add(outcome.name);
  });
  const handoffs = errand.handoffs ?? {};

  for (const [name, input] of Object.entries(inputs)) {
    const path = `/inputs/${name}`;
    if (input.role === "shared-secret" && input.sensitivity !== "secret") {
      report("sharedSecretSensitivity", `${path}/sensitivity`, "a shared secret is always sensitivity secret");
    }
    if (input.type === "qa-set" && input.sensitivity === "public") {
      report("qaSetSensitivity", `${path}/sensitivity`, "security answers are never public");
    }
    input.sources.forEach((source, j) => {
      if ((source.from === "derive" || source.from === "candidate") && (!source.input || !(source.input in inputs) || source.input === name)) {
        report("inputReference", `${path}/sources/${j}/input`, "must name another input of this errand");
      }
      if (source.from === "candidate" && source.input && inputs[source.input]?.role !== "shared-secret") {
        report("candidateReference", `${path}/sources/${j}/input`, "a candidate part comes from a shared-secret input");
      }
    });
  }

  function checkTemplate(text: string, path: string) {
    for (const name of templateNames(text)) {
      if (!(name in inputs)) report("templateReference", path, `{{${name}}} is not an input of this errand`);
    }
  }

  function checkRules(rules: Rule[] | undefined, base: string) {
    rules?.forEach((rule, i) => {
      const path = `${base}/${i}/do`;
      const action = rule.do;
      if (action.text !== undefined) checkTemplate(action.text, `${path}/text`);
      if (action.gate !== undefined) {
        const target = steps.get(action.gate);
        if (!target || !(GATE_KINDS as readonly string[]).includes(target.kind)) {
          report("gateReference", `${path}/gate`, "must name a declare, identity-proofing, code, mail or captcha step");
        }
      }
      for (const key of ["choose", "answer"] as const) {
        const name = action[key];
        if (name !== undefined && inputs[name]?.type !== "qa-set") {
          report("qaSetReference", `${path}/${key}`, "must name a qa-set input");
        }
      }
    });
  }
  checkRules(errand.rules, "/rules");
  errand.steps.forEach((step, i) => checkRules(step.rules, `/steps/${i}/rules`));

  errand.steps.forEach((step, i) => {
    if (step.handoff !== undefined && !(step.handoff in handoffs)) {
      report("handoffReference", `/steps/${i}/handoff`, "must name a hand-off card of this errand");
    }
  });
  errand.outcomes.forEach((outcome, i) => {
    if (outcome.then !== undefined && !steps.has(outcome.then)) {
      report("stepReference", `/outcomes/${i}/then`, "must name a step of this errand");
    }
  });

  const vault = errand.outputs?.vault;
  if (vault) {
    if (vault.when !== undefined && !outcomes.has(vault.when)) report("outcomeReference", "/outputs/vault/when", "must name an outcome");
    for (const [key, value] of Object.entries(vault.keys)) checkTemplate(value, `/outputs/vault/keys/${key}`);
  }
  errand.outputs?.downloads?.forEach((download, i) => {
    if (download.when !== undefined && !outcomes.has(download.when)) report("outcomeReference", `/outputs/downloads/${i}/when`, "must name an outcome");
    checkTemplate(download.to, `/outputs/downloads/${i}/to`);
  });

  // A hand-off card is shared on purpose: it may name built-ins and public
  // inputs, and nothing a person would not post on a fridge.
  for (const [id, card] of Object.entries(handoffs)) {
    const texts: Array<[string, string]> = [
      [`/handoffs/${id}/title`, card.title],
      ...card.steps.map((step, i): [string, string] => [`/handoffs/${id}/steps/${i}`, step]),
      ...(card.command !== undefined ? [[`/handoffs/${id}/command`, card.command] as [string, string]] : [])
    ];
    for (const [path, text] of texts) {
      for (const name of templateNames(text)) {
        if ((HANDOFF_BUILTINS as readonly string[]).includes(name)) continue;
        const input = inputs[name];
        if (!input) report("templateReference", path, `{{${name}}} is not an input or a hand-off built-in`);
        else if (input.sensitivity !== "public") report("handoffSensitivity", path, `{{${name}}} is ${input.sensitivity} and never goes on a hand-off card`);
      }
    }
  }

  return errors;
}
