import { describe, expect, it } from "vitest";
import { resolveInputs } from "./inputs.js";
import { decide } from "./rules.js";
import { field, ftbExample } from "./testing.js";
import type { Errand, Rule } from "./types.js";

function errand(inputs: Errand["inputs"], rules: Rule[] = []): Errand {
  return {
    type: "logicsrc.openerrand",
    version: "0.1",
    name: "t",
    title: "t",
    site: { name: "Example", origins: ["https://example.com"], start: ["https://example.com/"] },
    inputs,
    rules,
    steps: [{ id: "form", kind: "page" }],
    outcomes: [{ name: "ok", kind: "success", text: "done" }],
  };
}

async function ftbInputs() {
  const e = ftbExample();
  return {
    errand: e,
    inputs: await resolveInputs(e, {
      overrides: {
        email: "jane@example.com",
        phone: "5555550100",
        first_name: "Jane",
        last_name: "Doe",
        street: "1234 Maple St",
        zip: "95814",
        corp_id: "1234567",
        net_income: "48210",
        tax_year: "2025",
      },
      random: () => 0,
    }),
  };
}

describe("matching: id first, label second", () => {
  it("tries every id rule before any label rule, whatever the order in the file", async () => {
    const e = errand({ name: { type: "string", sensitivity: "personal", sources: [{ from: "literal", value: "Jane" }] } }, [
      { name: "by label", label: "name", do: { text: "label-{{name}}" } },
      { name: "by id", id: "^FstName$", do: { text: "{{name}}" } },
    ]);
    const inputs = await resolveInputs(e);
    const d = decide(e.rules!, field({ id: "FstName", label: "First name" }), inputs);
    expect(d?.rule.name).toBe("by id");
    expect(d?.action).toMatchObject({ kind: "text", value: "Jane" });
  });

  it("an id match is final even when it skips", async () => {
    const { errand: e, inputs } = await ftbInputs();
    const d = decide(e.rules!, field({ id: "MInitial", label: "Middle initial name" }), inputs);
    expect(d?.rule.name).toBe("middle initial");
    expect(d?.action).toEqual({ kind: "skip" });
  });

  it("an id match that cannot act leaves the field unmatched rather than trying labels", async () => {
    const e = errand({ name: { type: "string", sensitivity: "personal", sources: [{ from: "prompt" }] } }, [
      { name: "by id", id: "^FstName$", do: { text: "{{name}}" } },
      { name: "by label", label: "first", do: { text: "x" } },
    ]);
    const inputs = await resolveInputs(e);
    const d = decide(e.rules!, field({ id: "FstName", label: "First name" }), inputs);
    expect(d?.rule.name).toBe("by id");
    expect(d?.action).toBeNull();
    expect(d?.reason).toMatch(/no value/);
  });

  it("a label match that cannot act lets the next rule try", async () => {
    const { errand: e, inputs } = await ftbInputs();
    const radio = field({ id: "RoleInd", name: "Role", type: "radio", label: "Individual" });
    // The role rule only ticks the business representative radio.
    expect(decide(e.rules!, radio, inputs)).toBeNull();
    const business = field({ id: "RoleBus", name: "Role", type: "radio", label: "Business Representative" });
    expect(decide(e.rules!, business, inputs)?.action).toEqual({ kind: "check" });
  });

  it("types limit a rule; a rule without types fits any", async () => {
    const { errand: e, inputs } = await ftbInputs();
    const select = field({ id: "Yr", type: "select-one", label: "Tax year", options: [{ value: "", text: "Select" }, { value: "2024", text: "2024" }, { value: "2025", text: "2025" }] });
    expect(decide(e.rules!, select, inputs)?.action).toMatchObject({ kind: "select", value: "2025" });
    const box = field({ id: "Yr2", type: "tel", label: "Tax year" });
    expect(decide(e.rules!, box, inputs)?.action).toMatchObject({ kind: "text", value: "2025" });
    expect(decide(e.rules!, field({ id: "Yr3", type: "checkbox", label: "Tax year" }), inputs)).toBeNull();
  });

  it("a page step's own rules come first", async () => {
    const e = errand({ a: { type: "string", sensitivity: "public", sources: [{ from: "literal", value: "A" }] } }, [{ name: "errand", label: "code", do: { text: "errand" } }]);
    const inputs = await resolveInputs(e);
    const rules: Rule[] = [{ name: "step", label: "code", do: { text: "{{a}}" } }, ...e.rules!];
    expect(decide(rules, field({ id: "c", label: "Code" }), inputs)?.rule.name).toBe("step");
  });

  it("flags secrets and the shared secret so they are masked and a dry run stops there", async () => {
    const { errand: e, inputs } = await ftbInputs();
    const d = decide(e.rules!, field({ id: "NetInc", type: "text", label: "Net income for tax purposes" }), inputs);
    expect(d?.action).toMatchObject({ kind: "text", value: "48210", secret: true, sharedSecret: true });
    const zip = decide(e.rules!, field({ id: "Zip", type: "text", label: "ZIP code" }), inputs);
    expect(zip?.action).toMatchObject({ value: "95814", secret: false, sharedSecret: false });
  });
});

describe("actions", () => {
  it("split spreads a value over boxes by the digit at the end of the id", async () => {
    const e = errand({ ssn: { type: "string", sensitivity: "secret", sources: [{ from: "literal", value: "123456789" }] } }, [
      { name: "ssn", label: "social security", do: { text: "{{ssn}}", split: [3, 2, 4] } },
    ]);
    const inputs = await resolveInputs(e);
    const parts = [1, 2, 3].map((n) => decide(e.rules!, field({ id: `Ssn${n}`, label: "Social security number" }), inputs)?.action);
    expect(parts.map((p) => (p as { value: string }).value)).toEqual(["123", "45", "6789"]);
  });

  it("select escapes the input inside a pattern and tries patterns in order", async () => {
    const e = errand({ v: { type: "string", sensitivity: "public", sources: [{ from: "literal", value: "a.b" }] } }, [
      { name: "pick", label: "pick", types: ["select-one"], do: { select: ["^{{v}}$", "fallback"] } },
    ]);
    const inputs = await resolveInputs(e);
    const opts = [{ value: "1", text: "aXb" }, { value: "2", text: "a.b" }, { value: "3", text: "fallback" }];
    expect(decide(e.rules!, field({ id: "p", type: "select-one", label: "Pick", options: opts }), inputs)?.action).toMatchObject({ value: "2" });
    const noExact = opts.filter((o) => o.value !== "2");
    expect(decide(e.rules!, field({ id: "p", type: "select-one", label: "Pick", options: noExact }), inputs)?.action).toMatchObject({ value: "3" });
  });

  it("choose picks a different unused question each time and answer finds its answer", async () => {
    const { errand: e, inputs } = await ftbInputs();
    const options = [{ value: "", text: "Select a question" }, { value: "q1", text: "Your first pet?" }, { value: "q2", text: "Your first car?" }, { value: "q3", text: "Your first school?" }];
    const picks = [1, 2, 3].map((n) => decide(e.rules!, field({ id: `SecQ${n}`, type: "select-one", label: `Security question ${n}`, options }), inputs)?.action);
    expect(picks.map((p) => (p as { value: string }).value)).toEqual(["q1", "q2", "q3"]);
    const qa = inputs.qa.get("security")!;
    expect(Object.keys(qa.answers)).toEqual(["Your first pet?", "Your first car?", "Your first school?"]);
    const answer = decide(e.rules!, field({ id: "SecA2", type: "text", label: "Answer 2", question: "Your first car?" }), inputs);
    expect(answer?.action).toMatchObject({ kind: "text", value: qa.answers["Your first car?"], secret: true });
  });

  it("peeking uses nothing up, and a box that comes back keeps its question", async () => {
    const { errand: e, inputs } = await ftbInputs();
    const options = [{ value: "", text: "Select" }, { value: "q1", text: "Pet?" }, { value: "q2", text: "Car?" }];
    const q1 = field({ id: "SecQ1", type: "select-one", label: "Security question 1", options });
    expect(decide(e.rules!, q1, inputs, true)?.action).toMatchObject({ value: "q1" });
    expect(decide(e.rules!, q1, inputs, true)?.action).toMatchObject({ value: "q1" });
    expect(inputs.qa.get("security")!.answers).toEqual({});
    expect(decide(e.rules!, q1, inputs)?.action).toMatchObject({ value: "q1" });
    expect(decide(e.rules!, q1, inputs)?.action).toMatchObject({ value: "q1" });
    expect(decide(e.rules!, field({ id: "SecQ2", type: "select-one", label: "Security question 2", options }), inputs)?.action).toMatchObject({ value: "q2" });
  });

  it("a gate action names its step", async () => {
    const { errand: e, inputs } = await ftbInputs();
    expect(decide(e.rules!, field({ id: "Decl", type: "checkbox", label: "I declare under penalty of perjury" }), inputs)?.action).toEqual({ kind: "gate", step: "declaration" });
    expect(decide(e.rules!, field({ id: "Code", type: "text", label: "Enter the verification code" }), inputs)?.action).toEqual({ kind: "gate", step: "text-code" });
  });
});
