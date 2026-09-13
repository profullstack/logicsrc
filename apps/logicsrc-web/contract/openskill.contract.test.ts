import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readSkill, SKILL_SLUGS, listSkills, summarizeSkill } from "../src/lib/skills";
import { GET } from "../src/app/openskill/[slug]/openskill.md/route";
import { GET as catalogMarkdown } from "../src/app/openskill/catalog.md/route";
import { buildRedirects } from "../next.config";

describe("OpenSkill capability records", () => {
  it("provides a portable index whose links resolve to the published record sources", async () => {
    const response = catalogMarkdown();
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const body = await response.text();
    const paths = [...body.matchAll(/\]\((https?:\/\/[^)]+\/openskill\/([^/]+)\/openskill\.md)\)/g)];
    expect(paths).toHaveLength(SKILL_SLUGS.length);
    for (const [, , slug] of paths) expect(readSkill(slug)).not.toBeNull();
  });

  it("serves every published record losslessly as cross-origin Markdown", async () => {
    for (const slug of SKILL_SLUGS) {
      const source = readFileSync(resolve(process.cwd(), `../../docs/openskill/${slug}.md`), "utf8");
      const response = await GET(new Request(`https://example.com/openskill/${slug}/openskill.md`), { params: Promise.resolve({ slug }) });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(await response.text()).toBe(source);
    }
  });

  it("does not expose unlisted files or resolve request paths as filesystem paths", async () => {
    for (const slug of ["unknown", "../openprofile", "../../package.json", "__proto__"]) {
      expect(readSkill(slug)).toBeNull();
      const response = await GET(new Request("https://example.com"), { params: Promise.resolve({ slug }) });
      expect(response.status).toBe(404);
    }
  });

  it("keeps knowledge, capabilities and occupations distinct in the catalog", () => {
    const catalog = listSkills();
    expect(catalog.find((c) => c.slug === "logo-design")?.kind).toBe("skill");
    expect(catalog.find((c) => c.slug === "accounting")?.kind).toBe("knowledge");
    expect(catalog.find((c) => c.slug === "accountant")?.kind).toBe("occupation");
    expect(catalog.every((c) => c.name && c.description)).toBe(true);
  });

  it("does not infer a kind or consume metadata from examples or later sections", () => {
    const source = "# Weaving\n\nMake interlaced textiles.\n\n```markdown\n- **Kind**: occupation\n```\n\n## Notes\n\n- **Kind**: knowledge\n";
    expect(summarizeSkill(source, "weaving")).toEqual({ slug: "weaving", name: "Weaving", description: "Make interlaced textiles." });
    expect(summarizeSkill("# Unusual craft\n\n- **Kind**: local-category\n\nA local practice.", "craft").kind).toBe("local-category");
  });

  it("lets the OpenProfile skills path discover the same concept catalog", () => {
    expect(buildRedirects()).toContainEqual({ source: "/openprofile/skills", destination: "/openskill", permanent: true });
  });
});
