import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { publicClient } from "@/lib/supabase";

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
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px 24px" }}>
      <p style={{ marginBottom: 32 }}>
        <Link href="/blog" style={{ color: "#5b6b7a", textDecoration: "none" }}>
          ← Blog
        </Link>
      </p>
      <article>
        <h1 style={{ fontSize: 38, fontWeight: 800, margin: "0 0 8px" }}>
          {post.title}
        </h1>
        <div style={{ color: "#8a95a0", fontSize: 14, marginBottom: 32 }}>
          {formatDate(post.published_at)}
        </div>
        {post.featured_image?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.featured_image.url}
            alt={post.title}
            style={{ width: "100%", borderRadius: 12, margin: "0 0 32px" }}
          />
        ) : null}
        <div
          className="blog-content"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
      </article>
    </main>
  );
}
