"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { crumbsFor } from "@/lib/crumbs";

/**
 * The trail at the top of every page, derived from the path and the spec
 * registry. Rendered on the server too (usePathname works during SSR), so the
 * HTML carries it, plus a BreadcrumbList for search engines.
 */
export function Breadcrumbs({ leaf }: { leaf?: string }): ReactNode {
  const pathname = usePathname() ?? "/";
  const crumbs = crumbsFor(pathname, leaf);
  if (crumbs.length === 0) return null;
  const site = "https://logicsrc.com";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: `${site}${c.href}`
    }))
  };
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href + c.label}>
              {last ? (
                <span aria-current="page">{c.label}</span>
              ) : (
                <a href={c.href}>{c.label}</a>
              )}
            </li>
          );
        })}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </nav>
  );
}
