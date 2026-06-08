import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { publicClient } from "@/lib/supabase";
import { SiteShell } from "@/components/site-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog · LogicSRC",
  description:
    "Project notes for LogicSRC OpenSpec standards, AgentSwarm, AgentByte, SDKs, MCP, and reference implementations.",
  alternates: { types: { "application/rss+xml": "/blog/rss.xml" } },
};

type PostRow = {
  slug: string;
  title: string;
  excerpt: string | null;
  published_at: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogIndex(): Promise<ReactNode> {
  const supabase = publicClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("slug, title, excerpt, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  const posts = (data ?? []) as PostRow[];

  return (
    <SiteShell active="Blog">
      <div className="band">
        <div className="section-head">
          <h2>Blog</h2>
          <p>
            Project notes for LogicSRC OpenSpec standards, AgentSwarm, AgentByte,
            SDKs, MCP, and reference implementations.{" "}
            <a href="/blog/rss.xml">RSS</a>
          </p>
        </div>

        {posts.length === 0 ? (
          <p style={{ color: "#b5beb2" }}>No posts yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {posts.map((post) => (
              <li
                key={post.slug}
                style={{
                  padding: "1.25rem 0",
                  borderTop: "1px solid rgba(245, 247, 244, 0.12)",
                }}
              >
                <Link
                  href={`/blog/${post.slug}`}
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <h3 style={{ margin: "0 0 0.35rem", fontSize: "1.25rem" }}>
                    {post.title}
                  </h3>
                </Link>
                <div
                  style={{ color: "#8a95a0", fontSize: "0.85rem", marginBottom: "0.5rem" }}
                >
                  {formatDate(post.published_at)}
                </div>
                {post.excerpt ? (
                  <p style={{ color: "#b5beb2", margin: 0 }}>{post.excerpt}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SiteShell>
  );
}
