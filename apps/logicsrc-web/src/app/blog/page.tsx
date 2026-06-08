import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { publicClient } from "@/lib/supabase";

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
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px 24px" }}>
      <p style={{ marginBottom: 32 }}>
        <Link href="/" style={{ color: "#5b6b7a", textDecoration: "none" }}>
          ← LogicSRC
        </Link>
      </p>
      <h1 style={{ fontSize: 40, fontWeight: 800, margin: "0 0 8px" }}>Blog</h1>
      <p style={{ color: "#5b6b7a", margin: "0 0 40px" }}>
        Project notes for LogicSRC OpenSpec standards, AgentSwarm, AgentByte,
        SDKs, MCP, and reference implementations.{" "}
        <a href="/blog/rss.xml" style={{ color: "#5b6b7a" }}>
          RSS
        </a>
      </p>

      {posts.length === 0 ? (
        <p style={{ color: "#5b6b7a" }}>No posts yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {posts.map((post) => (
            <li
              key={post.slug}
              style={{ padding: "20px 0", borderTop: "1px solid #e3e6e0" }}
            >
              <Link
                href={`/blog/${post.slug}`}
                style={{ color: "#101418", textDecoration: "none" }}
              >
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>
                  {post.title}
                </h2>
              </Link>
              <div style={{ color: "#8a95a0", fontSize: 14, marginBottom: 8 }}>
                {formatDate(post.published_at)}
              </div>
              {post.excerpt ? (
                <p style={{ color: "#41505d", margin: 0 }}>{post.excerpt}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
