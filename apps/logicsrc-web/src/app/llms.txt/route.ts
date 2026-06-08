const SITE_URL = (process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "");

// GET /llms.txt — concise, link-rich orientation for LLM crawlers
// (https://llmstxt.org spec).
export function GET(): Response {
  const body = `# LogicSRC

> Open schemas, primitives, and conventions for coordination between humans, AI agents, plugins, payment systems, and hosted products. LogicSRC defines the shared language; products can implement it without owning the standard. A Profullstack, Inc. open-specification project.

## Core

- [Home](${SITE_URL}/): Overview, standards surface, schemas, CLI, and reference implementations.
- [Docs](${SITE_URL}/docs): Specification guides and conventions.
- [OpenSpec](${SITE_URL}/openspec): LogicSRC vs OpenSpec.dev comparison and compatibility mode.
- [Blog](${SITE_URL}/blog): Project notes and release announcements.
- [Blog RSS](${SITE_URL}/blog/rss.xml): Machine-readable feed of posts.

## Standards & products

- [AgentSwarm](${SITE_URL}/agent-swarm): Provider-neutral agent orchestration, model routing, and cost controls.
- [AgentByte](${SITE_URL}/agentbyte): Agent screening sessions, policy events, and APIs.
- [Credential Sharing](${SITE_URL}/credential-sharing): Source/target credential diffs, approval, sync, rollback, and audit.

## Company & legal

- [About](${SITE_URL}/about): What LogicSRC is and who maintains it (Profullstack, Inc.).
- [Hire Us](${SITE_URL}/hire-us): Implementation help at $250/week for accepted LogicSRC work.
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
