import { describe, expect, it, vi } from "vitest";
import { familyOfSpec } from "../src/lib/specs";
import { listDocs, readDoc } from "../src/lib/docs";
import { GET as llms } from "../src/app/llms.txt/route";
import { GET as llmsFull } from "../src/app/llms-full.txt/route";
import sitemap from "../src/app/sitemap";
import { EXIT_CODES, TARGETS } from "../src/app/openpkg/data";

// Spec discovery must work even when the optional blog database is offline.
vi.mock("../src/lib/supabase", () => ({ publicClient: () => { throw new Error("offline"); } }));

const doc = readDoc("openpkg") ?? "";

/** The first-column `code` cells of the table under a heading line. */
function tableKeys(heading: string): string[] {
  const start = doc.indexOf(`\n${heading}\n`);
  expect(start, `docs/openpkg.md has a ${heading} section`).toBeGreaterThan(-1);
  const next = doc.indexOf("\n#", start + 1);
  const section = doc.slice(start, next === -1 ? undefined : next);
  return section
    .split("\n")
    .map((line) => line.match(/^\| `([^`]+)` \|/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1]);
}

describe("OpenPkg public discovery", () => {
  it("is registered in the process family with a 1.0 Draft specification", () => {
    expect(familyOfSpec("openpkg")?.slug).toBe("process");
    expect(listDocs()).toContainEqual(expect.objectContaining({ slug: "openpkg", title: "OpenPkg" }));
    expect(doc).toMatch(/Status: \*\*1\.0 Draft\*\*/);
  });

  it("is in the LLM feeds and the sitemap", async () => {
    const text = await llms().text();
    expect(text).toMatch(/\[OpenPkg\]\(https:\/\/[^)]+\/(docs\/)?openpkg\)/);
    expect(text).toContain("/docs/openpkg");
    expect(await llmsFull().text()).toContain(doc.trim());
    const entries = await sitemap();
    expect(entries.some((entry) => new URL(entry.url).pathname === "/docs/openpkg")).toBe(true);
  });
});

describe("OpenPkg: the spec and its landing page agree", () => {
  it("lists the same exit codes", () => {
    expect(EXIT_CODES.map(([code]) => code)).toEqual(tableKeys("### 6.2 Exit codes"));
    expect(tableKeys("### 6.2 Exit codes")).toEqual(["0", "1", "2", "3", "4", "5", "130"]);
  });

  it("defines every target document the page lists, in order", () => {
    const headings = [...doc.matchAll(/^### 3\.\d .*?: `([^`]+)`$/gm)].map((m) => m[1]);
    expect(TARGETS.map(([path]) => path)).toEqual(headings);
  });

  it("names the reference implementation and the guide", () => {
    expect(doc).toContain("https://github.com/profullstack/w3bs.org/tree/main/package-manager");
    expect(doc).toContain("https://w3bs.org/docs/package-manager.md");
    expect(doc).toContain("without permission");
  });

  it("has no em dashes", () => {
    expect(doc).not.toContain(String.fromCharCode(0x2014));
    expect(readDoc("openpkg")).toBeTruthy();
  });
});
