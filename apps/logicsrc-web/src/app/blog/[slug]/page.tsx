import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { publicClient } from "@/lib/supabase";
import { SiteShell } from "@/components/site-shell";
import { AdUnit } from "@/components/ad-unit";
import { sanitizeRenderedHtml } from "@/lib/html";

export const dynamic = "force-dynamic";

type PostRow = {
  slug: string;
  title: string;
  excerpt: string | null;
  html: string;
  featured_image: { url?: string } | null;
  published_at: string;
  updated_at: string;
  // A guest post syndicated from another blog carries the original URL here.
  // When set, it is the canonical for search engines and is shown to readers,
  // so a cross-post never competes with its source for the same words.
  canonical_url: string | null;
  // Stored as jsonb: an object like { name, url }, or occasionally a bare
  // string. Never rendered directly, or an object prints as [object Object].
  author: { name?: string; url?: string } | string | null;
};

/** A display name from the jsonb author, whatever shape it took. */
function authorName(author: PostRow["author"]): string {
  if (!author) return "";
  if (typeof author === "string") return author;
  return typeof author.name === "string" ? author.name : "";
}

const SITE_URL = (process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "");

async function loadPost(slug: string): Promise<PostRow | null> {
  try {
    const supabase = publicClient();
    const { data } = await supabase
      .from("blog_posts")
      .select("slug, title, excerpt, html, featured_image, published_at, updated_at, canonical_url, author")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    return (data as PostRow | null) ?? null;
  } catch {
    return null;
  }
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
    // A guest post points its canonical at the original; an original post is
    // canonical to itself.
    alternates: { canonical: post.canonical_url ?? `/blog/${post.slug}` },
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

  const canonical = post.canonical_url ?? `${SITE_URL}/blog/${post.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.featured_image?.url ? [post.featured_image.url] : undefined,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    url: `${SITE_URL}/blog/${post.slug}`,
    // For a guest post this is the original; search engines follow it.
    mainEntityOfPage: canonical,
    ...(authorName(post.author) ? { author: { "@type": "Person", name: authorName(post.author) } } : {}),
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
  const byline = authorName(post.author);
  let originHost = "";
  if (post.canonical_url) {
    try {
      originHost = new URL(post.canonical_url).host;
    } catch {
      originHost = "";
    }
  }
  const html = sanitizeRenderedHtml(post.html);

  return (
    <SiteShell active="Blog">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
          {byline ? ` · ${byline}` : ""}
          {post.canonical_url ? (
            <>
              {" · "}
              <a href={post.canonical_url} rel="noreferrer" style={{ color: "#5b6b7a" }}>
                Originally published{originHost ? ` on ${originHost}` : ""}
              </a>
            </>
          ) : null}
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
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <div style={{ display: "flex", justifyContent: "center", marginTop: "2.5rem" }}>
          <AdUnit slot="709f4f1d-667a-4888-9040-90f5f65120f2" format="banner_300x250" />
        </div>
      </article>
    </SiteShell>
  );
}
