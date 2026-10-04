import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertSchemaKind, validate } from "./index.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const fixture = () => JSON.parse(read("../../schemas/fixtures/openerrand/ftb-register-business.json"));
const doc = read("../../../docs/openerrand.md");

/** Every ```json block in docs/openerrand.md, in order. */
const blocks = [...doc.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]!);

function errorAt(data: unknown, keyword: string, path: string) {
  const result = validate("openerrand", data);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ keyword, instancePath: path }));
}

describe("OpenErrand", () => {
  it("registers both exported schemas and validates the fixtures", () => {
    expect(assertSchemaKind("openerrand")).toBe("openerrand");
    expect(assertSchemaKind("openerrand-index")).toBe("openerrand-index");
    expect(validate("openerrand", fixture())).toMatchObject({ ok: true });
    expect(validate("openerrand-index", JSON.parse(read("../../schemas/fixtures/openerrand/index.json")))).toMatchObject({ ok: true });
  });

  it("validates the smallest errand, the worked example and the index printed in the specification", () => {
    const [smallest, , , index, example] = blocks.map((b) => JSON.parse(b));
    expect(validate("openerrand", smallest)).toMatchObject({ ok: true });
    expect(example).toEqual(fixture());
    expect(validate("openerrand-index", index)).toMatchObject({ ok: true });
  });

  it("puts no personal or secret value in the published example", () => {
    // The repository is public: the example names fields and sources, never a person's data.
    const text = JSON.stringify(fixture());
    expect(text).not.toMatch(/\b\d{3}-?\d{2}-?\d{4}\b/);
    expect(text).not.toMatch(/Jane|Doe|Maple|1234567|48210/);
  });

  it.each([
    ["an unknown key", (f: any) => { f.solver = "2captcha"; }, "additionalProperties", ""],
    ["an input with no sensitivity", (f: any) => { delete f.inputs.email.sensitivity; }, "required", "/inputs/email"],
    ["a shared secret that may be retried", (f: any) => { f.retry.shared_secret = "once"; }, "const", "/retry/shared_secret"],
    ["a gate step without its why", (f: any) => { delete f.steps[2].why; }, "oneOf", "/steps/2"],
    ["a plain http origin", (f: any) => { f.site.origins = ["http://webapp.ftb.ca.gov"]; }, "pattern", "/site/origins/0"]
  ])("rejects %s", (_, mutate, keyword, path) => {
    const f = fixture();
    mutate(f);
    errorAt(f, keyword, path);
  });

  it.each([
    ["a personal input on a hand-off card", (f: any) => { f.handoffs["pin-letter"].steps.push("Mail it to {{street}}"); }, "handoffSensitivity", "/handoffs/pin-letter/steps/3"],
    ["a secret input in a card's command", (f: any) => { f.handoffs["pin-letter"].command = "ftb activate --password {{password}}"; }, "handoffSensitivity", "/handoffs/pin-letter/command"],
    ["a template naming no input", (f: any) => { f.rules[2].do.text = "{{given_name}}"; }, "templateReference", "/rules/2/do/text"],
    ["a gate action pointing at a page step", (f: any) => { f.rules[25].do.gate = "form"; }, "gateReference", "/rules/25/do/gate"],
    ["a shared secret that is only personal", (f: any) => { f.inputs.net_income.sensitivity = "personal"; }, "sharedSecretSensitivity", "/inputs/net_income/sensitivity"],
    ["a choose action on a plain input", (f: any) => { f.rules[14].do.choose = "email"; }, "qaSetReference", "/rules/14/do/choose"],
    ["an outcome that follows a missing step", (f: any) => { f.outcomes[1].then = "pin-postcard"; }, "stepReference", "/outcomes/1/then"],
    ["a mail gate with a missing card", (f: any) => { f.steps[4].handoff = "postcard"; }, "handoffReference", "/steps/4/handoff"],
    ["duplicate step ids", (f: any) => { f.steps[1].id = "bot-check"; }, "uniqueStep", "/steps/1/id"]
  ])("rejects %s", (_, mutate, keyword, path) => {
    const f = fixture();
    mutate(f);
    errorAt(f, keyword, path);
  });

  it("allows public inputs and built-ins on a card", () => {
    const f = fixture();
    f.handoffs["pin-letter"].steps.push("Corporation {{corp_id}} at {{site.name}}: {{errand.title}}");
    expect(validate("openerrand", f)).toMatchObject({ ok: true });
  });
});
