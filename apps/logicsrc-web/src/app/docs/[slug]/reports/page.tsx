import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { docTitle, readDoc } from "@/lib/docs";
import { hasReports, listReports, REPORTED_SPECS } from "@/lib/reports";
import { SiteShell } from "@/components/site-shell";

// One reports index per spec that has one. Kept under the dynamic /docs/[slug]
// tree so it never shadows the spec's own doc page.
export function generateStaticParams(): Array<{ slug: string }> {
  return REPORTED_SPECS.map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Benchmark reports · ${slug} · LogicSRC`,
    description: `Reproducible benchmark reports published with each release of the ${slug} reference implementation.`,
    alternates: { canonical: `/docs/${slug}/reports` },
  };
}

export default async function ReportsIndex({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ReactNode> {
  const { slug } = await params;
  if (!hasReports(slug)) notFound();
  const md = readDoc(slug);
  const specTitle = md ? docTitle(md, slug) : slug;
  const reports = listReports(slug);

  return (
    <SiteShell active="Docs">
      <div className="band" style={{ maxWidth: "48rem" }}>
        <p style={{ marginBottom: "1.5rem" }}>
          <Link href={`/docs/${slug}`} style={{ color: "#5b6b7a", textDecoration: "none" }}>
            ← {specTitle}
          </Link>
        </p>
        <div className="section-head">
          <h2>Benchmark reports</h2>
          <p>
            Each report is a reproducible run of the {specTitle} benchmark over a
            defined corpus, published with a release so the standard&apos;s claims
            rest on a measurement rather than an assertion. Anyone can reproduce
            one; the machine-readable JSON and the run&apos;s environment travel
            with every report.
          </p>
        </div>
        {reports.length === 0 ? (
          <p style={{ color: "#41505d" }}>No reports published yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {reports.map((r) => (
              <li key={r.id} style={{ padding: "1.25rem 0", borderTop: "1px solid #e3e6e0" }}>
                <Link href={`/docs/${slug}/reports/${r.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                  <h3 style={{ margin: "0 0 0.35rem", fontSize: "1.15rem", color: "#101418" }}>
                    {r.implementation}
                  </h3>
                </Link>
                <p style={{ color: "#41505d", margin: 0 }}>
                  {new Date(r.generatedAt).toISOString().slice(0, 10)} · {r.headline}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SiteShell>
  );
}
