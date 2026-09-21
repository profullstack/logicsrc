import { FAMILIES, GUIDES, familyTree } from "@/lib/specs";

const SITE_URL = (process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "");

// GET /llms.txt — concise, link-rich orientation for LLM crawlers
// (https://llmstxt.org spec). The spec sections are generated from the
// registry in lib/specs.ts, so a new spec appears here without a hand edit.
export function GET(): Response {
  const families = FAMILIES.map((family) => {
    const lines = familyTree(family).flatMap(({ spec, children }) => {
      const url = `${SITE_URL}${spec.landing ?? spec.doc ?? ""}`;
      const doc = spec.doc && spec.landing ? ` Specification: ${SITE_URL}${spec.doc}.` : "";
      const head = `- [${spec.name}](${url}): ${spec.line}.${doc}`;
      const kids = children.map((c) => {
        const kidDoc = c.doc && c.landing ? ` Specification: ${SITE_URL}${c.doc}.` : "";
        return `  - [${c.name}](${SITE_URL}${c.landing ?? c.doc ?? ""}): ${c.line}.${kidDoc}`;
      });
      return [head, ...kids];
    });
    return `## ${family.name}\n\n${family.line}. Family page: ${SITE_URL}/specs/${family.slug}\n\n${lines.join("\n")}`;
  });

  const guides = GUIDES.map((g) => `- [${g.name}](${SITE_URL}/docs/${g.slug})`).join("\n");

  const body = `# LogicSRC

> Open schemas, primitives, and conventions for coordination between humans, AI agents, plugins, payment systems, and hosted products. LogicSRC defines the shared language; products can implement it without owning the standard. A Profullstack, Inc. open-specification project. Every specification is CC BY 4.0.

## Start

- [Home](${SITE_URL}/): Overview.
- [Specs](${SITE_URL}/specs): Every specification, in four families.
- [Docs](${SITE_URL}/docs): Specification text and guides.
- [Blog](${SITE_URL}/blog): Project notes and release announcements.
- [Blog RSS](${SITE_URL}/blog/rss.xml): Machine-readable feed of posts.
- [This site's OpenProfile.md](${SITE_URL}/.well-known/openprofile.md)
- [OpenSkill concept catalog](${SITE_URL}/openskill): Human skills, knowledge and occupations. Each concept page links its portable openskill.md source; these are capability descriptions, not executable agent instructions.
- [OpenSkill Markdown index](${SITE_URL}/openskill/catalog.md): Names, kinds, descriptions and direct links to every published concept record.

${families.join("\n\n")}

## Guides

${guides}

## Company & legal

- [About](${SITE_URL}/about): What LogicSRC is and who maintains it (Profullstack, Inc.).
- [Hire Us](${SITE_URL}/hire-us): Implementation help at $400/hour/agent for accepted LogicSRC work.
- [Pricing](${SITE_URL}/pricing)
- [Terms](${SITE_URL}/terms)
- [Privacy](${SITE_URL}/privacy)
`;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
