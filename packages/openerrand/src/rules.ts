/**
 * The field rules: what to do with each control on a page. Pure, so every
 * matching rule of the spec is a unit test.
 *
 * 1. Id first, label second: every rule with an `id` is tried before any
 *    rule's `label`.
 * 2. The first fitting rule decides. An id match is final even when it skips
 *    or cannot act; a label match that cannot act lets the next rule try.
 * 3. A page step's own rules come before the errand's (the caller passes them
 *    concatenated in that order).
 * 4. Choices before text is the driver's job: it calls this for selects,
 *    radios and checkboxes, reads the page again, then calls it for the rest.
 * 5. An unmatched required field stops the run: the driver's job, given null.
 */

import type { Inputs } from "./inputs.js";
import type { Field, Rule } from "./types.js";
import { escapeRegExp, re, templateNames } from "./util.js";

export type Action =
  | { kind: "text"; value: string; secret: boolean; sharedSecret: boolean }
  | { kind: "select"; value: string; text: string; secret: boolean; sharedSecret: boolean }
  | { kind: "check" }
  | { kind: "skip" }
  | { kind: "gate"; step: string };

export interface Decision {
  rule: Rule;
  /** null when an id rule matched but could not act: the field is then unmatched, and the reason says why. */
  action: Action | null;
  reason?: string;
}

const CHOICE_TYPES = new Set(["select-one", "radio", "checkbox"]);

export function isChoice(field: Field): boolean {
  return CHOICE_TYPES.has(field.type);
}

/** The digit at the end of a field's id: `Ssn2` is part 2. */
function partIndex(field: Field): number | undefined {
  const m = /(\d)\s*$/.exec(field.id) ?? /(\d)\s*$/.exec(field.name);
  return m ? Number(m[1]) : undefined;
}

function templateFlags(template: string, inputs: Inputs): { secret: boolean; sharedSecret: boolean } {
  const names = templateNames(template);
  return {
    secret: names.some((n) => inputs.sensitivity(n) === "secret"),
    sharedSecret: names.some((n) => n === inputs.sharedSecret),
  };
}

function fill(template: string, inputs: Inputs): string | null {
  let missing = false;
  const value = template.replace(/\{\{\s*([a-z][a-z0-9_.]*)\s*\}\}/g, (_, name: string) => {
    const v = inputs.get(name);
    if (v === undefined) missing = true;
    return v ?? "";
  });
  return missing ? null : value;
}

/** What one rule does to one field, or why it cannot. */
export function act(rule: Rule, field: Field, inputs: Inputs, peek = false): { action: Action | null; reason?: string } {
  const how = rule.do;
  if ("skip" in how) return { action: { kind: "skip" } };
  if ("gate" in how) return { action: { kind: "gate", step: how.gate } };
  if ("check" in how) {
    if (how.check === true) return { action: { kind: "check" } };
    return re(how.check.label).test(field.label) ? { action: { kind: "check" } } : { action: null, reason: "its label is not the one to tick" };
  }
  if ("text" in how) {
    const value = fill(how.text, inputs);
    if (value === null) return { action: null, reason: `${how.text} has no value` };
    const flags = templateFlags(how.text, inputs);
    if (how.split) {
      // A value spread over boxes 3, 2 and 4 wide: the box's own digit says which part.
      const part = partIndex(field);
      if (part !== undefined && part >= 1 && part <= how.split.length) {
        const start = how.split.slice(0, part - 1).reduce((a, b) => a + b, 0);
        return { action: { kind: "text", value: value.slice(start, start + how.split[part - 1]!), ...flags } };
      }
    }
    return { action: { kind: "text", value, ...flags } };
  }
  if ("select" in how) {
    for (const pattern of how.select) {
      let missing = false;
      const source = pattern.replace(/\{\{\s*([a-z][a-z0-9_.]*)\s*\}\}/g, (_, name: string) => {
        const v = inputs.get(name);
        if (v === undefined) missing = true;
        return escapeRegExp(v ?? "");
      });
      if (missing) continue;
      const compiled = new RegExp(source, "i");
      const option = field.options?.find((o) => o.value !== "" && (compiled.test(o.text) || compiled.test(o.value)));
      if (option) {
        const flags = how.select.reduce((acc, p) => {
          const f = templateFlags(p, inputs);
          return { secret: acc.secret || f.secret, sharedSecret: acc.sharedSecret || f.sharedSecret };
        }, { secret: false, sharedSecret: false });
        return { action: { kind: "select", value: option.value, text: option.text, ...flags } };
      }
    }
    return { action: null, reason: "no option matches" };
  }
  if ("choose" in how) {
    const qa = inputs.qa.get(how.choose);
    const option = qa?.choose(field.options ?? [], peek, field.selector);
    return option
      ? { action: { kind: "select", value: option.value, text: option.text, secret: false, sharedSecret: false } }
      : { action: null, reason: "no unused question to choose" };
  }
  if ("answer" in how) {
    const qa = inputs.qa.get(how.answer);
    const labelIndex = /answer\s*(\d)/i.exec(field.label)?.[1];
    const answer = qa?.answerFor(`${field.question ?? ""} ${field.label}`, partIndex(field) ?? (labelIndex ? Number(labelIndex) : undefined));
    return answer ? { action: { kind: "text", value: answer, secret: true, sharedSecret: false } } : { action: null, reason: "no answer for this question" };
  }
  return { action: null, reason: "unknown action" };
}

/**
 * The first rule whose pattern and type fit, and what it does. null when no
 * rule fits at all. `peek` decides without recording anything (a security
 * question is not used up), for a caller that only wants to know.
 */
export function decide(rules: readonly Rule[], field: Field, inputs: Inputs, peek = false): Decision | null {
  const haystack = `${field.id} ${field.name} ${field.label}`;
  for (const rule of rules) {
    if (!rule.id || (rule.types && !rule.types.includes(field.type as never))) continue;
    if (!re(rule.id).test(field.id)) continue;
    const { action, reason } = act(rule, field, inputs, peek);
    return { rule, action, ...(reason ? { reason } : {}) };
  }
  for (const rule of rules) {
    if (!rule.label || (rule.types && !rule.types.includes(field.type as never))) continue;
    if (!re(rule.label).test(haystack)) continue;
    const { action } = act(rule, field, inputs, peek);
    if (action) return { rule, action };
  }
  return null;
}

/** How a field is named in logs and errors: its label, type and whether it is required. Never its value. */
export function describeField(field: Field): string {
  return `${field.label || field.name || field.id || field.selector} (${field.type}${field.required ? ", required" : ""})`;
}
