import type { ReactNode } from "react";
import { renderInstallCommand } from "@/lib/install-command";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SideNav } from "@/components/side-nav";

/**
 * The site chrome for every standalone route: the sidebar that unfolds to
 * where you are (components/side-nav.tsx), and the breadcrumb trail at the
 * top of the page (components/breadcrumbs.tsx), both derived from the spec
 * registry and the path. `crumbTitle` names the last crumb when the
 * registry cannot, such as a blog post's title. `active` is kept for
 * callers that still pass it and is no longer needed.
 */
export function SiteShell({
  children,
  crumbTitle,
}: {
  children: ReactNode;
  active?: string;
  crumbTitle?: string;
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
        <SideNav />
      </aside>
      <section className="workspace">
        <Breadcrumbs leaf={crumbTitle} />
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
          {/* Member of the Profullstack OpenWebring (/openwebring): the ring reads these three links. */}
          <span style={{ display: "flex", gap: "0.75rem", width: "100%" }}>
            <a href="https://rssamplifier.com/ring/profullstack/previous?from=https://logicsrc.com/blog" style={{ color: "inherit" }}>
              ← previous
            </a>
            <a href="https://rssamplifier.com/ring/profullstack" style={{ color: "inherit" }}>Profullstack ring</a>
            <a href="https://rssamplifier.com/ring/profullstack/random" style={{ color: "inherit" }}>random</a>
            <a href="https://rssamplifier.com/ring/profullstack/next?from=https://logicsrc.com/blog" style={{ color: "inherit" }}>
              next →
            </a>
          </span>
        </footer>
      </section>
    </main>
  );
}
