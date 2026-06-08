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
  featured_image: { url?: string } | null;
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
    .select("slug, title, excerpt, featured_image, published_at")
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
          <p style={{ color: "#5b6b7a" }}>No posts yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {posts.map((post) => {
              const thumb = post.featured_image?.url;
              return (
                <li
                  key={post.slug}
                  style={{
                    padding: "1.25rem 0",
                    borderTop: "1px solid #e3e6e0",
                  }}
                >
                  <Link
                    href={`/blog/${post.slug}`}
                    style={{
                      display: "flex",
                      gap: "1rem",
                      color: "inherit",
                      textDecoration: "none",
                      alignItems: "flex-start",
                    }}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        style={{
                          width: "160px",
                          height: "100px",
                          objectFit: "cover",
                          borderRadius: "0.5rem",
                          flexShrink: 0,
                          border: "1px solid #e3e6e0",
                        }}
                      />
                    ) : null}
                    <div style={{ minWidth: 0 }}>
                      <h3
                        style={{
                          margin: "0 0 0.35rem",
                          fontSize: "1.25rem",
                          color: "#101418",
                        }}
                      >
                        {post.title}
                      </h3>
                      <div
                        style={{
                          color: "#5b6b7a",
                          fontSize: "0.85rem",
                          marginBottom: "0.5rem",
                        }}
                      >
                        {formatDate(post.published_at)}
                      </div>
                      {post.excerpt ? (
                        <p style={{ color: "#41505d", margin: 0 }}>{post.excerpt}</p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SiteShell>
  );
}
