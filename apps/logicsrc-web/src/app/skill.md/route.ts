const SITE_URL = (process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "");

// GET /skill.md — capability manifest for agents discovering what this site
// exposes.
export function GET(): Response {
  const body = `# LogicSRC Skill

LogicSRC publishes open coordination standards (schemas, primitives, and
conventions) for humans, AI agents, plugins, payment systems, and hosted
products. CommandBoard.run is the reference implementation.

Base URL: ${SITE_URL}

## Resources

- Specification & docs: ${SITE_URL}/docs
- OpenSpec comparison: ${SITE_URL}/openspec
- Schemas, CLI, SDK, TUI, and reference implementations: ${SITE_URL}/
- Blog feed: ${SITE_URL}/blog/rss.xml
- Sitemap: ${SITE_URL}/sitemap.xml
- LLM orientation: ${SITE_URL}/llms.txt

## What you can do here

- Read the LogicSRC coordination schemas and conventions.
- Compare LogicSRC with OpenSpec.dev.
- Request paid implementation help via the Hire Us flow (${SITE_URL}/hire-us),
  billed at $250/week for accepted work and paid through CoinPay.

## Notes

- Public marketing/spec content is open to crawl. The /api/ surface is for
  application use, not crawling.
- Contact: implementation requests via the Hire Us form at ${SITE_URL}/hire-us.
`;
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
