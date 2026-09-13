import { describe, expect, it, vi } from "vitest";
import { familyOfSpec } from "../src/lib/specs";
import { listDocs, readDoc } from "../src/lib/docs";
import { GET as llms } from "../src/app/llms.txt/route";
import { GET as llmsFull } from "../src/app/llms-full.txt/route";
import sitemap from "../src/app/sitemap";

// Spec discovery must work even when the optional blog database is offline.
vi.mock("../src/lib/supabase", () => ({ publicClient: () => { throw new Error("offline"); } }));

describe.each([
  { slug: "openfleet", name: "OpenFleet", family: "process" },
  { slug: "openwall", name: "OpenWall", family: "people" }
])("$name public discovery", ({ slug, name, family }) => {
  it("serves the specification through its family and docs index", () => {
    expect(familyOfSpec(slug)?.slug).toBe(family);
    expect(listDocs()).toContainEqual(expect.objectContaining({ slug, title: name }));
    expect(readDoc(slug)).toContain("0.1 draft");
  });

  it("includes a reachable docs URL and the full contract in the LLM feeds", async () => {
    expect(await llms().text()).toMatch(new RegExp(`\\[${name}\\]\\(https://[^)]+/docs/${slug}\\)`));
    expect(await llmsFull().text()).toContain(readDoc(slug)!.trim());
  });

  it("includes the docs route in the sitemap without a blog connection", async () => {
    const entries = await sitemap();
    expect(entries.some((entry) => new URL(entry.url).pathname === `/docs/${slug}`)).toBe(true);
  });
});
