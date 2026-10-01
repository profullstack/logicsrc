import { describe, expect, it } from "vitest";
import { readDoc } from "../src/lib/docs";
import { CONF, EXIT_CODES, PHASES, SETTINGS } from "../src/app/openinstall/data";

// The landing page restates the spec's tables. These tests keep the two, and
// the spec's own worked example, from drifting apart.

const doc = readDoc("openinstall") ?? "";

/** The first-column `code` cells of the table under a `## heading`. */
function tableKeys(heading: string): string[] {
  const start = doc.indexOf(`\n## ${heading}\n`);
  expect(start, `docs/openinstall.md has a ## ${heading} section`).toBeGreaterThan(-1);
  const next = doc.indexOf("\n## ", start + 1);
  const section = doc.slice(start, next === -1 ? undefined : next);
  return section
    .split("\n")
    .map((line) => line.match(/^\| `([^`]+)` \|/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1]);
}

function confKeys(conf: string): string[] {
  return conf
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.slice(0, line.indexOf("=")));
}

describe("OpenInstall: the spec and its landing page agree", () => {
  it("lists the same settings, in the same order", () => {
    expect(SETTINGS.map(([key]) => key)).toEqual(tableKeys("Settings"));
  });

  it("lists the same phases and exit codes", () => {
    expect(PHASES.map(([name]) => name)).toEqual(tableKeys("Phases"));
    expect(EXIT_CODES.map(([code]) => code)).toEqual(tableKeys("Exit codes"));
    expect(tableKeys("Exit codes")).toEqual(["0", "1", "3"]);
  });

  it("uses only documented settings in the worked example, which the page shows verbatim", () => {
    const documented = new Set(tableKeys("Settings"));
    const fence = doc.match(/```\n(# bin\/install\.conf[^`]*?)```/);
    expect(fence, "the worked example's install.conf").not.toBeNull();
    const example = fence![1].trim();
    expect(example).toBe(CONF);
    for (const key of confKeys(example)) expect(documented.has(key), key).toBe(true);
  });

  it("numbers its conformance rules without gaps", () => {
    const numbers = [...doc.matchAll(/^### (\d+)\. /gm)].map((m) => Number(m[1]));
    expect(numbers.length).toBeGreaterThanOrEqual(10);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it("names the ownership marker the reference script writes", () => {
    expect(doc).toContain("`# managed by bin/install.sh`");
  });

  it("has no em dashes", () => {
    expect(doc).not.toContain(String.fromCharCode(0x2014));
  });
});
