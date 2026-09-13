import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { FAMILIES, familyTree } from "@/lib/specs";

export const metadata: Metadata = {
  title: "Specs · LogicSRC",
  description:
    "Every LogicSRC specification in four families: people and agents, access and credentials, catalogs a site serves about itself, and agents and process. Each family drills down to its specs, each spec to an overview and the specification text.",
  alternates: { canonical: "/specs" }
};

export default function SpecsIndex(): ReactNode {
  return (
    <SiteShell active="Specs">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>Specs</h2>
          <p>
            Four families. Pick one, then a spec, then read its overview or the specification text.
            Every spec is CC BY 4.0, every rule degrades, and a file at a well-known URL is the whole
            protocol.
          </p>
        </div>
        <div className="primitive-grid">
          {FAMILIES.map((family) => (
            <article key={family.slug} className="tile">
              <h3>
                <Link href={`/specs/${family.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
                  {family.name}
                </Link>
              </h3>
              <p>{family.line}.</p>
              <p style={{ color: "#5b6b7a", fontSize: "0.9rem", marginTop: "0.5rem" }}>
                {familyTree(family)
                  .map(({ spec }) => spec.name)
                  .join(" · ")}
              </p>
              <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                <Link href={`/specs/${family.slug}`}>See the family</Link>
              </p>
            </article>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
