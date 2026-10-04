import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readDoc } from "../src/lib/docs";
import { SENSITIVITY, SOURCES, STEPS } from "../src/app/openerrand/data";

// The landing page restates the spec's tables, and the site serves the worked
// example and the publisher index. These tests keep all of them in step with
// docs/openerrand.md and the schema fixtures.

const doc = readDoc("openerrand") ?? "";
const root = resolve(__dirname, "../../..");
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

/** The first-column `code` cells of the table under a heading. */
function tableKeys(heading: string): string[] {
  const start = doc.indexOf(`\n${heading}\n`);
  expect(start, `docs/openerrand.md has a ${heading} section`).toBeGreaterThan(-1);
  const next = doc.slice(start + 1).search(/\n#{2,3} /);
  const section = doc.slice(start, next === -1 ? undefined : start + 1 + next);
  return section
    .split("\n")
    .map((line) => line.match(/^\| `([^`]+)` \|/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1]);
}

describe("OpenErrand: the spec, its landing page and its published files agree", () => {
  it("lists the same step kinds, sensitivity classes and sources, in the same order", () => {
    expect(STEPS.map(([kind]) => kind)).toEqual(tableKeys("## Steps"));
    expect(SENSITIVITY.map(([name]) => name)).toEqual(tableKeys("### Sensitivity"));
    expect(SOURCES.map(([name]) => name)).toEqual(tableKeys("### Sources"));
  });

  it("gives every gate kind its own section", () => {
    for (const gate of ["declare", "identity-proofing", "code", "mail", "captcha"]) {
      expect(doc).toContain(`\n### \`${gate}\`\n`);
    }
  });

  it("prints the fixture as the worked example, and the site serves the same bytes", () => {
    const fixture = json("packages/schemas/fixtures/openerrand/ftb-register-business.json");
    const section = doc.slice(doc.indexOf("\n## Worked example\n"));
    const example = section.match(/```json\n([\s\S]*?)\n```/);
    expect(example, "the worked example's JSON").not.toBeNull();
    expect(JSON.parse(example![1])).toEqual(fixture);
    expect(json("apps/logicsrc-web/public/examples/openerrand/ftb-register-business.json")).toEqual(fixture);
    expect(fixture.id).toBe("https://logicsrc.com/examples/openerrand/ftb-register-business.json");
  });

  it("serves the publisher index that lists the worked example", () => {
    const index = json("apps/logicsrc-web/public/.well-known/openerrand.json");
    expect(index).toEqual(json("packages/schemas/fixtures/openerrand/index.json"));
    expect(index.errands.map((e: { url: string }) => e.url)).toContain("https://logicsrc.com/examples/openerrand/ftb-register-business.json");
  });

  it("numbers its runner rules without gaps", () => {
    const numbers = [...doc.matchAll(/^### (\d+)\. /gm)].map((m) => Number(m[1]));
    expect(numbers.length).toBe(13);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it("has no em dashes", () => {
    expect(doc).not.toContain(String.fromCharCode(0x2014));
  });
});
