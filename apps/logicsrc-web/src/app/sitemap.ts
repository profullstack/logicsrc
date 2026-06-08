import type { MetadataRoute } from "next";
import { publicClient } from "@/lib/supabase";
import { DOC_SLUGS } from "@/lib/docs";

export const dynamic = "force-dynamic";

function baseUrl(): string {
  return (process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "");
}

// Static routes preserved from the legacy public/sitemap.xml.
const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/docs", changeFrequency: "weekly", priority: 0.9 },
  { path: "/openspec", changeFrequency: "weekly", priority: 0.8 },
  { path: "/agent-swarm", changeFrequency: "weekly", priority: 0.8 },
  { path: "/agentbyte", changeFrequency: "weekly", priority: 0.8 },
  { path: "/credential-sharing", changeFrequency: "weekly", priority: 0.8 },
  { path: "/hire-us", changeFrequency: "weekly", priority: 0.8 },
  { path: "/blog", changeFrequency: "daily", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.4 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = baseUrl();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
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

  return [...staticEntries, ...docEntries, ...postEntries];
}
