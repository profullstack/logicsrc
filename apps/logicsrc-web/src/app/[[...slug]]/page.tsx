import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { renderPageMarkup } from "@/lib/page-markup";
import { HomeInteractivity } from "@/components/home-interactivity";

// The legacy SPA served the same single page for every top-level path and just
// scrolled to the matching section. We preserve those URLs (they are canonical
// in sitemap.xml) by rendering the same page for each known route and 404ing
// anything else.
// /about and /docs are now real routes (app/about, app/docs); the rest still
// render the homepage SPA scrolled to their section.
const ROUTE_META: Record<string, { title: string; description: string }> = {
  openspec: {
    title: "LogicSRC vs OpenSpec.dev · LogicSRC",
    description: "How LogicSRC's coordination standard compares with OpenSpec.dev, including MCP and agent support.",
  },
  "credential-sharing": {
    title: "Credential Sharing · LogicSRC",
    description: "Source/target credential diffs, approval, sync, rollback, and audit across .env, Doppler, Railway, and GitHub Secrets.",
  },
  "hire-us": {
    title: "Hire Us · LogicSRC",
    description: "Implementation help for LogicSRC, AgentSwarm, and Credential Sharing at $250/week for accepted work, paid via CoinPay.",
  },
  terms: { title: "Terms · LogicSRC", description: "LogicSRC terms of use." },
  privacy: { title: "Privacy · LogicSRC", description: "LogicSRC privacy notes." },
  "agent-swarm": {
    title: "AgentSwarm · LogicSRC",
    description: "Provider-neutral agent orchestration with model routing, cost controls, and GitHub integration.",
  },
  agentbyte: {
    title: "AgentByte · LogicSRC",
    description: "Agent screening sessions, AI-assisted humans, policy events, and APIs.",
  },
};

const KNOWN_ROUTES = new Set(Object.keys(ROUTE_META));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const key = slug?.[0];
  if (key && ROUTE_META[key]) {
    return {
      title: ROUTE_META[key].title,
      description: ROUTE_META[key].description,
      alternates: { canonical: `/${key}` },
    };
  }
  return {};
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
      <div id="app" dangerouslySetInnerHTML={{ __html: renderPageMarkup() }} />
      <HomeInteractivity />
    </>
  );
}
