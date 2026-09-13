import type { MetadataRoute } from "next";
import { publicClient } from "@/lib/supabase";
import { DOC_SLUGS } from "@/lib/docs";
import { FAMILIES, allSpecs } from "@/lib/specs";
import { SKILL_SLUGS } from "@/lib/skills";

export const dynamic = "force-dynamic";

function baseUrl(): string {
  return (process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "");
}

type Route = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

// The site's own pages. Spec landing pages come from the registry in
// lib/specs.ts, so a new spec is never missing here.
const STATIC_ROUTES: Route[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/specs", changeFrequency: "weekly", priority: 0.9 },
  { path: "/docs", changeFrequency: "weekly", priority: 0.9 },
  { path: "/openontology/explore", changeFrequency: "daily", priority: 0.7 },
  { path: "/hire-us", changeFrequency: "weekly", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.7 },
  { path: "/blog", changeFrequency: "daily", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.4 },
];

function specRoutes(): Route[] {
  const families: Route[] = FAMILIES.map((f) => ({
    path: `/specs/${f.slug}`,
    changeFrequency: "weekly",
    priority: 0.9,
  }));
  const landings: Route[] = allSpecs()
    .filter((s) => s.landing)
    .map((s) => ({ path: s.landing as string, changeFrequency: "weekly", priority: 0.9 }));
  return [...families, ...landings];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = baseUrl();

  const staticEntries: MetadataRoute.Sitemap = [...STATIC_ROUTES, ...specRoutes()].map((route) => ({
    url: `${base}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const docEntries: MetadataRoute.Sitemap = DOC_SLUGS.map((slug) => ({
    url: `${base}/docs/${slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  let postEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = publicClient();
    const { data } = await supabase
      .from("blog_posts")
      .select("slug, published_at, updated_at")
      .eq("status", "published")
      .order("published_at", { ascending: false });
    postEntries = (data ?? []).map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at ?? post.published_at),
      changeFrequency: "weekly",
      priority: 0.6,
    }));
  } catch {
    // If the DB is unreachable, still serve the static sitemap.
    postEntries = [];
  }

  const skills: MetadataRoute.Sitemap = SKILL_SLUGS.map((slug) => ({
    url: `${base}/openskill/${slug}`, changeFrequency: "monthly", priority: 0.6
  }));
  return [...staticEntries, ...docEntries, ...skills, ...postEntries];
}
