import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { listDocs } from "@/lib/docs";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Docs · LogicSRC",
  description:
    "LogicSRC specification guides — data model, CLI/TUI conventions, config, permission scopes, plugins, credential sharing, and the OpenSpec.dev comparison.",
  alternates: { canonical: "/docs" },
};

export default function DocsIndex(): ReactNode {
  const docs = listDocs();
  return (
    <SiteShell active="Docs">
      <div className="band">
        <div className="section-head">
          <h2>Docs</h2>
          <p>
            Specification guides and conventions for the LogicSRC coordination
            standard. Source lives in the{" "}
            <a href="https://github.com/profullstack/logicsrc" rel="noreferrer">
              profullstack/logicsrc
            </a>{" "}
            repository.
          </p>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {docs.map((doc) => (
            <li
              key={doc.slug}
              style={{ padding: "1.25rem 0", borderTop: "1px solid #e3e6e0" }}
            >
              <Link
                href={`/docs/${doc.slug}`}
                style={{ color: "inherit", textDecoration: "none" }}
              >
                <h3 style={{ margin: "0 0 0.35rem", fontSize: "1.2rem", color: "#101418" }}>
                  {doc.title}
                </h3>
              </Link>
              {doc.excerpt ? (
                <p style={{ color: "#41505d", margin: 0 }}>{doc.excerpt}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </SiteShell>
  );
}
