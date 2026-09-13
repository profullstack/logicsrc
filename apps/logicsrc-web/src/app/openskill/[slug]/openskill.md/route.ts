import { readSkill, SKILL_SLUGS } from "@/lib/skills";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return SKILL_SLUGS.map((slug) => ({ slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const source = readSkill(slug);
  if (source === null) return new Response("Not found", { status: 404 });
  return new Response(source, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff"
    }
  });
}
