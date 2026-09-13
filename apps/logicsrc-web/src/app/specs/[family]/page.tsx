import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { SpecList } from "@/components/spec-list";
import { FAMILIES, familyBySlug } from "@/lib/specs";

export function generateStaticParams(): Array<{ family: string }> {
  return FAMILIES.map((f) => ({ family: f.slug }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ family: string }>;
}): Promise<Metadata> {
  const { family: slug } = await params;
  const family = familyBySlug(slug);
  if (!family) return {};
  return {
    title: `${family.name} · Specs · LogicSRC`,
    description: `${family.line}. ${family.specs.map((s) => s.name).join(", ")}.`,
    alternates: { canonical: `/specs/${family.slug}` }
  };
}

export default async function FamilyPage({
  params
}: {
  params: Promise<{ family: string }>;
}): Promise<ReactNode> {
  const { family: slug } = await params;
  const family = familyBySlug(slug);
  if (!family) notFound();
  return (
    <SiteShell active={`/specs/${family.slug}`}>
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">
            <Link href="/specs">Specs</Link> · {family.name}
          </p>
          <h2>{family.name}</h2>
          <p>{family.line}.</p>
        </div>
        <p style={{ color: "#41505d" }}>{family.blurb}</p>
        <SpecList family={family} />
      </div>
    </SiteShell>
  );
}
