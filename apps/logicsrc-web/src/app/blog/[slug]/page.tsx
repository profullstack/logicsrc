import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { publicClient } from "@/lib/supabase";
import { SiteShell } from "@/components/site-shell";

export const dynamic = "force-dynamic";

type PostRow = {
  slug: string;
  title: string;
  excerpt: string | null;
  html: string;
  featured_image: { url?: string } | null;
  published_at: string;
};

async function loadPost(slug: string): Promise<PostRow | null> {
  const supabase = publicClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("slug, title, excerpt, html, featured_image, published_at")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return (data as PostRow | null) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return { title: "Not found · LogicSRC" };
  return {
    title: `${post.title} · LogicSRC`,
    description: post.excerpt ?? undefined,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      type: "article",
      images: post.featured_image?.url ? [post.featured_image.url] : undefined,
    },
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ReactNode> {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) notFound();

  return (
    <SiteShell active="Blog">
      <article className="band" style={{ maxWidth: "48rem" }}>
        <p style={{ marginBottom: "1.5rem" }}>
          <Link href="/blog" style={{ color: "#5b6b7a", textDecoration: "none" }}>
            ← Blog
          </Link>
        </p>
        <h1 style={{ fontSize: "2.2rem", margin: "0 0 0.5rem", color: "#101418" }}>
          {post.title}
        </h1>
        <div style={{ color: "#5b6b7a", fontSize: "0.85rem", marginBottom: "2rem" }}>
          {formatDate(post.published_at)}
        </div>
        {post.featured_image?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.featured_image.url}
            alt={post.title}
            style={{ width: "100%", borderRadius: "0.75rem", margin: "0 0 2rem" }}
          />
        ) : null}
        <div
          className="blog-content"
          style={{ lineHeight: 1.7 }}
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
      </article>
    </SiteShell>
  );
}
