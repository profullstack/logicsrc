import type { ReactNode } from "react";

// Mirrors the rail/nav from page-markup.ts so standalone routes (e.g. /blog)
// share the site chrome. Anchor links point at the homepage sections.
const NAV: Array<{ href: string; label: string; external?: boolean }> = [
  { href: "/#overview", label: "Overview" },
  { href: "/#schemas", label: "Schemas" },
  { href: "/agent-swarm", label: "Soon" },
  { href: "/agentbyte", label: "AgentByte" },
  { href: "/credential-sharing", label: "Credentials" },
  { href: "/teams", label: "Teams" },
  { href: "/#cli", label: "CLI" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
  { href: "/openspec", label: "OpenSpec" },
  { href: "/pricing", label: "Pricing" },
  { href: "/hire-us", label: "Hire Us" },
  { href: "/about", label: "About" },
  { href: "https://github.com/profullstack/logicsrc", label: "GitHub ↗", external: true },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/#reference", label: "Reference" },
];

export function SiteShell({
  children,
  active,
}: {
  children: ReactNode;
  active?: string;
}): ReactNode {
  return (
    <main className="shell">
      <aside className="rail">
        <a className="brand" href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="mark">LS</span>
          <div>
            <strong>LogicSRC</strong>
            <small>Open coordination standards</small>
          </div>
        </a>
        <nav aria-label="LogicSRC sections">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={item.label === active ? "active" : undefined}
              aria-current={item.label === active ? "page" : undefined}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noreferrer" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <section className="workspace">
        {children}
        <footer
          style={{
            maxWidth: "72rem",
            margin: "2rem auto 0",
            padding: "1.25rem 0",
            borderTop: "1px solid #d9ded4",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            justifyContent: "space-between",
            fontSize: "0.85rem",
            color: "#5b6b7a",
          }}
        >
          <span>© {new Date().getFullYear()} Profullstack, Inc. · LogicSRC</span>
          <span style={{ display: "flex", gap: "0.75rem" }}>
            <a href="/docs" style={{ color: "inherit" }}>Docs</a>
            <a href="/blog/rss.xml" style={{ color: "inherit" }}>RSS</a>
            <a href="/terms" style={{ color: "inherit" }}>Terms</a>
            <a href="/privacy" style={{ color: "inherit" }}>Privacy</a>
          </span>
        </footer>
      </section>
    </main>
  );
}
