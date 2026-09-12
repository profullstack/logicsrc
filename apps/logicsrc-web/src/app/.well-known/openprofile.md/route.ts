const SITE_URL = (process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "");

// GET /.well-known/openprofile.md: LogicSRC's own OpenProfile.md, the file the
// spec at /openprofile says a domain serves for itself. Relays in the OpenMCP
// catalog name this URL as their operator, so it has to resolve.
export function GET(): Response {
  const body = `# LogicSRC

- **Kind**: organization
- **Handle**: @logicsrc
- **Web**: ${SITE_URL}
- **Email**: support@logicsrc.com
- **Avatar**: ${SITE_URL}/icon.svg
- **Parent**: [Profullstack, Inc.](https://profullstack.com)

Open coordination standards for humans, AI agents, plugins, payment systems and hosted products.

## Accounts

- [GitHub](https://github.com/profullstack/logicsrc)
- [GitHub org](https://github.com/logicsrc)
- [Blog](${SITE_URL}/blog)
- [OpenMCP catalog](https://openmcp.logicsrc.com)
- [Obscura relay](https://obscura.openmcp.logicsrc.com)

## Topics

- open standards, coordination, ai agents, mcp, openmcp, openprofile, openresume, openjob, opencreds, asdlc, credential sharing, agent orchestration

## Projects

- [OpenMCP](${SITE_URL}/openmcp): an open catalog of MCP relays, live at https://openmcp.logicsrc.com
- [OpenProfile.md](${SITE_URL}/openprofile): one Markdown file for who and where, people and agents alike
- [ASDLC](${SITE_URL}/asdlc): the agentic software development lifecycle
- [OpenCreds](${SITE_URL}/opencreds): end-to-end encrypted credential sharing
- [Docs](${SITE_URL}/docs): every specification LogicSRC publishes

## Contact

- Support: support@logicsrc.com
- Security: security@profullstack.com
- Privacy: privacy@profullstack.com
`;
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
