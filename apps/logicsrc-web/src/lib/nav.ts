import { FAMILIES } from "./specs";

/**
 * The sidebar, broad first. Four groups: where to start, the spec families
 * (each a page that drills down to its specs), the tools, and the company.
 * Rendered by the React SiteShell and by the server-string home page from the
 * same array, so the two cannot drift.
 */
export type NavItem = { href: string; label: string; external?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Start",
    items: [
      { href: "/", label: "Overview" },
      { href: "/specs", label: "Specs" },
      { href: "/docs", label: "Docs" },
      { href: "/blog", label: "Blog" }
    ]
  },
  {
    label: "Specs",
    items: FAMILIES.map((f) => ({ href: `/specs/${f.slug}`, label: f.name }))
  },
  {
    label: "Tools",
    items: [
      { href: "/docs/cli", label: "CLI" },
      { href: "/openspec", label: "OpenSpec.dev mode" },
      { href: "/credential-sharing", label: "Credentials" }
    ]
  },
  {
    label: "Company",
    items: [
      { href: "/pricing", label: "Pricing" },
      { href: "/hire-us", label: "Hire Us" },
      { href: "/about", label: "About" },
      { href: "https://github.com/profullstack/logicsrc", label: "GitHub ↗", external: true },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" }
    ]
  }
];

/** The sidebar as a server-rendered string, for the home page template. */
export function renderNavHtml(activeHref = "/"): string {
  return NAV_GROUPS.map(
    (g) =>
      `<span class="nav-group">${g.label}</span>` +
      g.items
        .map(
          (i) =>
            `<a href="${i.href}"${i.href === activeHref ? ' class="active" aria-current="page"' : ""}${
              i.external ? ' target="_blank" rel="noreferrer"' : ""
            }>${i.label}</a>`
        )
        .join("")
  ).join("");
}
