import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { marked } from "marked";
import { DOC_SLUGS, docExcerpt, docTitle, readDoc } from "@/lib/docs";
import { SiteShell } from "@/components/site-shell";

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
  if (!md) return { title: "Not found · LogicSRC" };
  return {
    title: `${docTitle(md, slug)} · LogicSRC Docs`,
    description: docExcerpt(md) || undefined,
    alternates: { canonical: `/docs/${slug}` },
  };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ReactNode> {
  const { slug } = await params;
  const md = readDoc(slug);
  if (!md) notFound();

  const html = await marked.parse(md);

  return (
    <SiteShell active="Docs">
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
