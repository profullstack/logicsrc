import { DOC_SLUGS, docTitle, readDoc } from "@/lib/docs";

const SITE_URL = (process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "");

// GET /llms-full.txt — full markdown of every curated doc concatenated into a
// single response, so large-context models can ingest the whole reference at
// once (https://llmstxt.org).
export function GET(): Response {
  const parts: string[] = [
    "# LogicSRC — Full Documentation",
    "",
    "> Open schemas, primitives, and conventions for coordination between humans, AI agents, plugins, payment systems, and hosted products. A Profullstack, Inc. open-specification project.",
    "",
    `Source: ${SITE_URL}`,
    "",
  ];

  for (const slug of DOC_SLUGS) {
    const md = readDoc(slug);
    if (!md) continue;
    parts.push(`\n---\n\n## ${docTitle(md, slug)} (${SITE_URL}/docs/${slug})\n`);
    parts.push(md.trim());
    parts.push("");
  }

  return new Response(parts.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
