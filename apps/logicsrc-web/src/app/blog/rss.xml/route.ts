import { publicClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostRow = {
  slug: string;
  title: string;
  excerpt: string | null;
  published_at: string;
};

function baseUrl(): string {
  return (process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// GET /blog/rss.xml — RSS 2.0 feed generated from published blog_posts.
export async function GET(): Promise<Response> {
  const base = baseUrl();
  const supabase = publicClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("slug, title, excerpt, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(50);
  const posts = (data ?? []) as PostRow[];

  const items = posts
    .map((post) => {
      const link = `${base}/blog/${post.slug}`;
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid>${escapeXml(link)}</guid>
      <description>${escapeXml(post.excerpt ?? "")}</description>
      <pubDate>${new Date(post.published_at).toUTCString()}</pubDate>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>LogicSRC Blog</title>
    <link>${base}/blog</link>
    <description>Project notes for LogicSRC OpenSpec standards, AgentSwarm, AgentByte, SDKs, MCP, and reference implementations.</description>
    <language>en-us</language>
    <atom:link href="${base}/blog/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
