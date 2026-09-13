import { listSkills } from "@/lib/skills";

export const dynamic = "force-static";
const SITE_URL = (process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "");

export function GET() {
  const records = listSkills().map((concept) =>
    `- [${concept.name}](${SITE_URL}/openskill/${concept.slug}/openskill.md) — ${concept.kind ?? "kind unstated"}: ${concept.description}`
  );
  return new Response([
    "# OpenSkill catalog", "",
    "Portable descriptions of human skills, knowledge and occupations. These are concept definitions; personal claims and evidence belong in OpenProfile.", "",
    `Specification: ${SITE_URL}/docs/openskill`, "",
    ...records, ""
  ].join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff"
    }
  });
}
