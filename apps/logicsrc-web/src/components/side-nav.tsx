"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV_GROUPS } from "@/lib/nav";
import { FAMILIES, allSpecs, familyOfSpec, familyTree, type Family } from "@/lib/specs";

/**
 * The sidebar, broad first, drilling down in place. The four groups are
 * always shown. Under Specs, the family the current page belongs to unfolds
 * to its specs, and the spec the page belongs to unfolds to its blocks, so
 * the sidebar shows where you are and what is beside you without leaving the
 * page. Rendered on the server too, so the unfolded state is in the HTML.
 */
function currentFamily(pathname: string): { family?: Family; specSlug?: string } {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "specs" && parts[1]) return { family: FAMILIES.find((f) => f.slug === parts[1]) };
  const slug =
    parts[0] === "docs" && parts[1]
      ? allSpecs().find((x) => x.doc === `/docs/${parts[1]}`)?.slug
      : allSpecs().find((x) => x.landing === `/${parts[0]}`)?.slug;
  if (!slug) return {};
  return { family: familyOfSpec(slug), specSlug: slug };
}

export function SideNav(): ReactNode {
  const pathname = usePathname() ?? "/";
  const { family: open, specSlug } = currentFamily(pathname);
  const openParent = specSlug ? allSpecs().find((x) => x.slug === specSlug)?.parent ?? specSlug : undefined;

  const isCurrent = (href: string): boolean => href === pathname;

  return (
    <nav aria-label="LogicSRC sections">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="nav-group-block">
          <span className="nav-group">{group.label}</span>
          {group.items.map((item) => {
            const family = group.label === "Specs" ? FAMILIES.find((f) => `/specs/${f.slug}` === item.href) : undefined;
            const unfolded = family && open && family.slug === open.slug;
            const active = isCurrent(item.href) || (family && open?.slug === family.slug && pathname.startsWith("/specs/"));
            return (
              <div key={item.href} className={unfolded ? "nav-branch open" : "nav-branch"}>
                <a
                  href={item.href}
                  className={active ? "active" : undefined}
                  aria-current={isCurrent(item.href) ? "page" : undefined}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noreferrer" : undefined}
                >
                  {item.label}
                </a>
                {unfolded ? (
                  <div className="nav-children">
                    {familyTree(family).map(({ spec, children }) => {
                      const href = spec.landing ?? spec.doc ?? "/specs";
                      const here = spec.slug === specSlug || children.some((c) => c.slug === specSlug);
                      return (
                        <div key={spec.slug}>
                          <a href={href} className={spec.slug === specSlug ? "active" : undefined} aria-current={spec.slug === specSlug ? "page" : undefined}>
                            {spec.name}
                          </a>
                          {children.length > 0 && (here || openParent === spec.slug) ? (
                            <div className="nav-children">
                              {children.map((c) => (
                                <a
                                  key={c.slug}
                                  href={c.landing ?? c.doc ?? href}
                                  className={c.slug === specSlug ? "active" : undefined}
                                  aria-current={c.slug === specSlug ? "page" : undefined}
                                >
                                  {c.name}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
