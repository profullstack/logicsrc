import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { marked } from "marked";
import { hasReports, readReportJson, readReportMarkdown, reportIds, REPORTED_SPECS } from "@/lib/reports";
import { SiteShell } from "@/components/site-shell";
import { sanitizeRenderedHtml } from "@/lib/html";

// Statically generate every published report of every reported spec.
export function generateStaticParams(): Array<{ slug: string; id: string }> {
  const out: Array<{ slug: string; id: string }> = [];
  for (const slug of REPORTED_SPECS) {
    for (const id of reportIds(slug)) out.push({ slug, id });
  }
  return out;
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug, id } = await params;
  const r = readReportJson(slug, id);
  if (!r) return { title: "Not found · LogicSRC" };
  return {
    title: `${r.implementation.name} ${r.implementation.version} benchmark · ${slug} · LogicSRC`,
    description: `Reproducible ${slug} benchmark: ${r.environment.runtime} on ${r.environment.os}, generated ${r.generatedAt}.`,
    alternates: { canonical: `/docs/${slug}/reports/${id}` },
  };
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<ReactNode> {
  const { slug, id } = await params;
  if (!hasReports(slug)) notFound();
  const md = readReportMarkdown(slug, id);
  const json = readReportJson(slug, id);
  if (!md || !json) notFound();

  const rawHtml = await marked.parse(md);
  const html = sanitizeRenderedHtml(rawHtml);
  const repoJson = `https://github.com/profullstack/logicsrc/blob/master/docs/${slug}/reports/${id}.json`;

  return (
    <SiteShell active="Docs">
      <article className="band" style={{ maxWidth: "48rem" }}>
        <p style={{ marginBottom: "1.5rem" }}>
          <Link href={`/docs/${slug}/reports`} style={{ color: "#5b6b7a", textDecoration: "none" }}>
            ← Benchmark reports
          </Link>
        </p>
        <div
          className="blog-content"
          style={{ lineHeight: 1.7 }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <p style={{ marginTop: "2rem", color: "#5b6b7a" }}>
          Machine-readable source:{" "}
          <a href={repoJson} rel="noreferrer">
            {id}.json
          </a>{" "}
          (schema {json.schema}). Reproduce it by running the reference
          implementation&apos;s benchmark and comparing on your own hardware.
        </p>
      </article>
    </SiteShell>
  );
}
