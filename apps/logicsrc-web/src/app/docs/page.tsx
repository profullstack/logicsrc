import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-meta";
import { listDocs } from "@/lib/docs";
import { FAMILIES, GUIDES, familyTree } from "@/lib/specs";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = pageMetadata("/docs");

const row: React.CSSProperties = { padding: "0.9rem 0", borderTop: "1px solid #e3e6e0" };
const h3: React.CSSProperties = { margin: "0 0 0.3rem", fontSize: "1.1rem", color: "#101418" };
const p: React.CSSProperties = { color: "#41505d", margin: 0 };

export default function DocsIndex(): ReactNode {
  const docs = new Map(listDocs().map((d) => [d.slug, d]));
  const docFor = (path?: string) => (path ? docs.get(path.replace(/^\/docs\//, "")) : undefined);

  return (
    <SiteShell active="Docs">
      <div className="band">
        <div className="section-head">
          <h2>Docs</h2>
          <p>
            The specification text, one page per spec, grouped the way{" "}
            <Link href="/specs">the specs</Link> are. Source lives in the{" "}
            <a href="https://github.com/profullstack/logicsrc" rel="noreferrer">
              profullstack/logicsrc
            </a>{" "}
            repository under <code>docs/</code>.
          </p>
        </div>

        {FAMILIES.map((family) => (
          <section key={family.slug} style={{ marginTop: "2rem" }}>
            <h3 style={{ ...h3, fontSize: "1.3rem" }}>
              <Link href={`/specs/${family.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
                {family.name}
              </Link>
            </h3>
            <p style={p}>{family.line}.</p>
            <ul style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0 }}>
              {familyTree(family).flatMap(({ spec, children }) => [spec, ...children]).map((spec) => {
                const doc = docFor(spec.doc);
                if (!doc) return null;
                return (
                  <li key={spec.slug} style={{ ...row, paddingLeft: spec.parent ? "1.25rem" : 0 }}>
                    <h3 style={h3}>
                      <Link href={spec.doc as string} style={{ color: "inherit", textDecoration: "none" }}>
                        {doc.title}
                      </Link>
                    </h3>
                    <p style={p}>{spec.line}.</p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section style={{ marginTop: "2rem" }}>
          <h3 style={{ ...h3, fontSize: "1.3rem" }}>Guides</h3>
          <p style={p}>Conventions the reference implementations follow.</p>
          <ul style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0 }}>
            {GUIDES.map((g) => {
              const doc = docs.get(g.slug);
              if (!doc) return null;
              return (
                <li key={g.slug} style={row}>
                  <h3 style={h3}>
                    <Link href={`/docs/${g.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
                      {doc.title}
                    </Link>
                  </h3>
                  {doc.excerpt ? <p style={p}>{doc.excerpt}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </SiteShell>
  );
}
