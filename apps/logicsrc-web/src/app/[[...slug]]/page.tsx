import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { renderPageMarkup } from "@/lib/page-markup";
import { HomeInteractivity } from "@/components/home-interactivity";

// The legacy SPA served the same single page for every top-level path and just
// scrolled to the matching section. We preserve those URLs (they are canonical
// in sitemap.xml) by rendering the same page for each known route and 404ing
// anything else.
const KNOWN_ROUTES = new Set([
  "docs",
  "blog",
  "openspec",
  "credential-sharing",
  "hire-us",
  "about",
  "terms",
  "privacy",
  "agent-swarm",
  "agentbyte"
]);

export default async function Page({
  params
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<ReactNode> {
  const { slug } = await params;
  if (slug && slug.length > 0) {
    if (slug.length > 1 || !KNOWN_ROUTES.has(slug[0])) {
      notFound();
    }
  }

  return (
    <>
      <div id="app" dangerouslySetInnerHTML={{ __html: renderPageMarkup() }} />
      <HomeInteractivity />
    </>
  );
}
