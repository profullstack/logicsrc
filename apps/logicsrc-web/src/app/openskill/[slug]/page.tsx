import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { contentMetadata, notFoundMetadata } from "@/lib/page-meta";
import { marked } from "marked";
import { SiteShell } from "@/components/site-shell";
import { sanitizeRenderedHtml } from "@/lib/html";
import { readSkill, SKILL_SLUGS, summarizeSkill } from "@/lib/skills";

export const dynamicParams = false;
export function generateStaticParams() {
  return SKILL_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const source = readSkill(slug);
  if (!source) return notFoundMetadata("skill");
  const concept = summarizeSkill(source, slug);
  return contentMetadata({
    title: `${concept.name}: An OpenSkill Record`,
    description: concept.description,
    path: `/openskill/${slug}`,
    alternateTypes: { "text/markdown": `/openskill/${slug}/openskill.md` },
    type: "article"
  });
}

export default async function SkillPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const source = readSkill(slug);
  if (!source) notFound();
  const concept = summarizeSkill(source, slug);
  const html = sanitizeRenderedHtml(await marked.parse(source));
  return <SiteShell crumbTitle={concept.name}>
    <article className="band" style={{ maxWidth: "48rem" }}>
      <p><Link href="/openskill">← All concepts</Link>{" · "}<a href={`/openskill/${slug}/openskill.md`}>Markdown source</a></p>
      <div className="blog-content" style={{ lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  </SiteShell>;
}
