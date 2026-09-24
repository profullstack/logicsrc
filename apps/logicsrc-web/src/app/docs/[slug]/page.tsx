import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { marked } from "marked";
import { DOC_SLUGS, docExcerpt, docSubtitle, docTitle, readDoc } from "@/lib/docs";
import { composeTitle, contentMetadata, notFoundMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { sanitizeRenderedHtml } from "@/lib/html";

// Statically generate one page per curated doc at build time.
export function generateStaticParams(): Array<{ slug: string }> {
  return DOC_SLUGS.map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const md = readDoc(slug);
  if (!md) return notFoundMetadata("doc");
  // Every spec's H1 is just its name, so "OpenStream" alone was the whole
  // title. The subject line comes from the registry (or the guide list).
  const name = docTitle(md, slug);
  const subtitle = docSubtitle(slug);
  return contentMetadata({
    title: subtitle ? composeTitle(name, subtitle) : name,
    description:
      docExcerpt(md) || `${name}: ${subtitle}. Part of the LogicSRC open-standards surface.`,
    path: `/docs/${slug}`,
    type: "article",
  });
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ReactNode> {
  const { slug } = await params;
  const md = readDoc(slug);
  if (!md) notFound();

  const rawHtml = await marked.parse(md);
  const html = sanitizeRenderedHtml(rawHtml);

  return (
    <SiteShell active="Docs" crumbTitle={docTitle(md, slug)}>
      <article className="band" style={{ maxWidth: "48rem" }}>
        <p style={{ marginBottom: "1.5rem" }}>
          <Link href="/docs" style={{ color: "#5b6b7a", textDecoration: "none" }}>
            ← Docs
          </Link>
        </p>
        <div
          className="blog-content"
          style={{ lineHeight: 1.7 }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </SiteShell>
  );
}
