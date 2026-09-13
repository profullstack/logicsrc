import { NAV_GROUPS } from "./nav";
import { FAMILIES, GUIDES, allSpecs, familyOfSpec, type Spec } from "./specs";

/**
 * Breadcrumbs for any path, derived from the registry so no page declares
 * them by hand. The trail follows the site's architecture, broad to narrow:
 *
 *   /specs/catalogs      Home › Specs › Catalogs a site serves about itself
 *   /openthreat          Home › Specs › Catalogs … › OpenThreat
 *   /opencpu             Home › Specs › Catalogs … › OpenServer › OpenCPU
 *   /docs/openthreat     Home › Specs › Catalogs … › OpenThreat › Specification
 *   /docs/cli            Home › Docs › CLI
 *   /blog/<slug>         Home › Blog › <leaf, supplied by the page>
 *
 * `leaf` lets a page name the last crumb when the registry cannot (a blog
 * post's title). The home page has no trail.
 */
export type Crumb = { href: string; label: string };

const HOME: Crumb = { href: "/", label: "Home" };

function specTrail(spec: Spec): Crumb[] {
  const family = familyOfSpec(spec.slug);
  const trail: Crumb[] = [HOME, { href: "/specs", label: "Specs" }];
  if (family) trail.push({ href: `/specs/${family.slug}`, label: family.name });
  if (spec.parent) {
    const parent = allSpecs().find((x) => x.slug === spec.parent);
    if (parent) trail.push({ href: parent.landing ?? parent.doc ?? "/specs", label: parent.name });
  }
  trail.push({ href: spec.landing ?? spec.doc ?? "/specs", label: spec.name });
  return trail;
}

function navLabel(path: string): string | null {
  for (const g of NAV_GROUPS) for (const i of g.items) if (i.href === path) return i.label;
  return null;
}

function pretty(segment: string): string {
  return segment.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function crumbsFor(pathname: string, leaf?: string): Crumb[] {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return [];
  const parts = path.split("/").filter(Boolean);

  // /specs and /specs/<family>
  if (parts[0] === "specs") {
    const trail: Crumb[] = [HOME, { href: "/specs", label: "Specs" }];
    const family = parts[1] ? FAMILIES.find((f) => f.slug === parts[1]) : undefined;
    if (family) trail.push({ href: `/specs/${family.slug}`, label: family.name });
    return trail;
  }

  // /docs and /docs/<slug>
  if (parts[0] === "docs") {
    if (!parts[1]) return [HOME, { href: "/docs", label: "Docs" }];
    const spec = allSpecs().find((x) => x.doc === `/docs/${parts[1]}`);
    if (spec) {
      const trail = specTrail(spec);
      // A spec with no landing page: its doc IS the spec crumb already.
      if (spec.landing) trail.push({ href: `/docs/${parts[1]}`, label: "Specification" });
      return trail;
    }
    const guide = GUIDES.find((g) => g.slug === parts[1]);
    return [HOME, { href: "/docs", label: "Docs" }, { href: path, label: leaf ?? guide?.name ?? pretty(parts[1]) }];
  }

  // /<slug> for a spec landing page (one segment), including /openontology/explore under it.
  const spec = allSpecs().find((x) => x.landing === `/${parts[0]}`);
  if (spec) {
    const trail = specTrail(spec);
    if (parts[1]) trail.push({ href: path, label: leaf ?? pretty(parts[1]) });
    return trail;
  }

  // Everything else: Home › <section> [› leaf]
  const trail: Crumb[] = [HOME];
  const first = `/${parts[0]}`;
  trail.push({ href: first, label: navLabel(first) ?? pretty(parts[0]) });
  if (parts.length > 1) trail.push({ href: path, label: leaf ?? pretty(parts[parts.length - 1]) });
  else if (leaf && leaf !== trail[trail.length - 1].label) trail[trail.length - 1] = { href: path, label: leaf };
  return trail;
}

/** The trail as HTML, for the server-string home template's non-root routes. */
export function renderCrumbsHtml(pathname: string): string {
  const crumbs = crumbsFor(pathname);
  if (crumbs.length === 0) return "";
  const items = crumbs
    .map((c, i) =>
      i === crumbs.length - 1
        ? `<li><span aria-current="page">${c.label}</span></li>`
        : `<li><a href="${c.href}">${c.label}</a></li>`
    )
    .join("");
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items}</ol></nav>`;
}
