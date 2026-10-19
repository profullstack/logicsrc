import type { ReactNode } from "react";
import { renderInstallCommand } from "@/lib/install-command";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SideNav } from "@/components/side-nav";
import { Footer } from "@profullstack/footer/react";
import { SITE_FOOTER, SITE_FOOTER_COLOR } from "@/lib/site-footer";

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
        <div style={{ color: SITE_FOOTER_COLOR, marginTop: "2rem" }}>
          <Footer {...SITE_FOOTER} />
        </div>
      </section>
    </main>
  );
}
