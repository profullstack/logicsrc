import type { ReactNode } from "react";
import { renderInstallCommand } from "@/lib/install-command";
import { NAV_GROUPS } from "@/lib/nav";

/**
 * The site chrome for every standalone route. The sidebar comes from
 * lib/nav.ts, the same array the home page renders, so the two cannot drift.
 * `active` is a label or an href; either marks the current entry.
 */
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
        {/* Same markup the homepage uses, so the two can never drift apart.
            Static content from a module constant -- nothing user-supplied. */}
        <div dangerouslySetInnerHTML={{ __html: renderInstallCommand("rail") }} />
        <nav aria-label="LogicSRC sections">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="nav-group-block">
              <span className="nav-group">{group.label}</span>
              {group.items.map((item) => {
                const isActive = item.label === active || item.href === active;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={isActive ? "active" : undefined}
                    aria-current={isActive ? "page" : undefined}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noreferrer" : undefined}
                  >
                    {item.label}
                  </a>
                );
              })}
            </div>
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
            <a href="/specs" style={{ color: "inherit" }}>Specs</a>
            <a href="/docs" style={{ color: "inherit" }}>Docs</a>
            <a href="/blog/rss.xml" style={{ color: "inherit" }}>RSS</a>
            <a href="/llms.txt" style={{ color: "inherit" }}>llms.txt</a>
            <a href="/terms" style={{ color: "inherit" }}>Terms</a>
            <a href="/privacy" style={{ color: "inherit" }}>Privacy</a>
          </span>
        </footer>
      </section>
    </main>
  );
}
