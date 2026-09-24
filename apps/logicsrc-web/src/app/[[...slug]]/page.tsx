import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { renderPageMarkup } from "@/lib/page-markup";
import { pageMetadata, specMetadata } from "@/lib/page-meta";
import { HomeInteractivity } from "@/components/home-interactivity";

// The legacy SPA served the same single page for every top-level path and just
// scrolled to the matching section. We preserve those URLs (they are canonical
// in sitemap.xml) by rendering the same page for each known route and 404ing
// anything else.
// /about, /docs, /pricing, /privacy, and /terms are now real routes
// (app/about, app/docs, app/pricing, app/privacy, app/terms); the rest still
// render the homepage SPA scrolled to their section. Every key left here MUST
// have a matching section id in `renderPageMarkup` -- /privacy used to be
// listed without one, so it served the whole homepage and scrolled to a card
// that only described the page that did not exist.
// These render the homepage scrolled to their own section, so with no metadata
// of their own they were published under the homepage's title -- the bug that
// made every shared link read "LogicSRC — Open Coordination Standards".
// openspec, credential-sharing and agentbyte are specs, titled from
// lib/specs.ts; hire-us is one of the site's own pages.
// /agent-swarm was the AgentSwarm placeholder band. It is now the OpenFleet
// spec at app/openfleet; next.config.ts redirects the old path there.
const SPEC_SECTIONS = new Set(["openspec", "credential-sharing", "agentbyte"]);
const SITE_SECTIONS = new Set(["hire-us"]);
const KNOWN_ROUTES = new Set([...SPEC_SECTIONS, ...SITE_SECTIONS]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const key = slug?.[0];
  if (key && SPEC_SECTIONS.has(key)) return specMetadata(`/${key}`);
  if (key && SITE_SECTIONS.has(key)) return pageMetadata(`/${key}`);
  return pageMetadata("/");
}

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
      <div id="app" dangerouslySetInnerHTML={{ __html: renderPageMarkup(slug?.[0] ? `/${slug[0]}` : "/") }} />
      <HomeInteractivity />
    </>
  );
}
