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

- [ASDLC](${SITE_URL}/asdlc): The Agentic Software Development Lifecycle: nine phases for building software when agents work in parallel and CI/CD is the only gate, with conformance levels and the ratchet rule.
- [OpenMCP](${SITE_URL}/openmcp): An open catalog of MCP relays. Live catalog at https://openmcp.logicsrc.com; CLI installs with \`curl -fsSL https://openmcp.logicsrc.com/install.sh | sh\`.
- [OpenProfile.md](${SITE_URL}/openprofile): One Markdown file for who and where, people and agents alike. This site's own is at ${SITE_URL}/.well-known/openprofile.md.
- [OpenProfile.md](${SITE_URL}/openprofile): One Markdown file that says who you are and where you are, for people and agents alike: identity block, accounts, topics, reshare terms and operator, discovered at /.well-known/openprofile.md or through rel="openprofile".
- [OpenMCP](${SITE_URL}/openmcp): An open catalog of MCP relays: a relay serves /.well-known/openmcp.json, a catalog probes it and lists only what it found, and clients reach every relay through the catalog's REST, its own MCP endpoint, or signed webhooks.
- [OpenAccess](${SITE_URL}/openaccess): OAuth 2.1 with a grant you can carry: one hub account per person or agent, apps keep their own users and link them once, grants delegate narrower to agents, and a subscription bought in one app is honoured by every app that honours the product. Reference hub at openaccess.logicsrc.com.
- [OpenCPU](${SITE_URL}/opencpu): The compute block of an OpenServer offer: threads against cores, the processor by its vendor name, dedicated, shared or burstable allocation, and a range that says what a buyer can add at checkout and for how much.
- [OpenMemory](${SITE_URL}/openmemory): The memory block of an OpenServer offer: RAM in mebibytes, DDR generation, ECC as three states, reserved or balloonable allocation, and a range priced per step.
- [OpenGPU](${SITE_URL}/opengpu): The gpu block of an OpenServer offer: the card by its vendor name, count and VRAM per device, interconnect, passthrough, MIG, vGPU or shared access, and a range over count.
- [OpenBandwidth](${SITE_URL}/openbandwidth): The network block of an OpenServer offer: port speed, transfer, unmetered, 95th percentile or flat metering, overage, IPv4 and IPv6 addresses as a priced resource, DDoS scrubbing, and a range.
- [AgentSwarm](${SITE_URL}/agent-swarm): Provider-neutral agent orchestration, model routing, and cost controls.
- [AgentByte](${SITE_URL}/agentbyte): Agent screening sessions, policy events, and APIs.
- [Credential Sharing](${SITE_URL}/credential-sharing): End-to-end-encrypted team vaults, plus source/target credential diffs, approval, sync, rollback, and audit.

## Company & legal

- [About](${SITE_URL}/about): What LogicSRC is and who maintains it (Profullstack, Inc.).
- [Hire Us](${SITE_URL}/hire-us): Implementation help at $400/hour for accepted LogicSRC work.
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
