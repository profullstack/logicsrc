import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Repo-root docs/ (read at build time during static generation, so there is
// no runtime filesystem dependency in the deployed image).
const DOCS_DIR = resolve(process.cwd(), "../../docs");

// Curated, public-facing reference docs. Internal notes (roadmap, positioning,
// arcade) are intentionally excluded.
export const DOC_SLUGS = [
  "openspec-comparison",
  "data-model",
  "cli",
  "tui",
  "config",
  "permissions",
  "plugins",
  "credential-sharing",
  "agent-screening",
] as const;

export type DocSlug = (typeof DOC_SLUGS)[number];

export function isDocSlug(slug: string): slug is DocSlug {
  return (DOC_SLUGS as readonly string[]).includes(slug);
}

export function readDoc(slug: string): string | null {
  if (!isDocSlug(slug)) return null;
  try {
    return readFileSync(resolve(DOCS_DIR, `${slug}.md`), "utf8");
  } catch {
    return null;
  }
}

export function docTitle(markdown: string, slug: string): string {
  const h1 = markdown.split("\n").find((line) => line.startsWith("# "));
  return h1 ? h1.replace(/^#\s+/, "").trim() : slug;
}

export function docExcerpt(markdown: string): string {
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (line && !line.startsWith("#") && !line.startsWith("```") && !line.startsWith(">")) {
      return line.replace(/[*_`#>[\]()]/g, "").trim().slice(0, 160);
    }
  }
  return "";
}

export type DocSummary = { slug: DocSlug; title: string; excerpt: string };

export function listDocs(): DocSummary[] {
  const out: DocSummary[] = [];
  for (const slug of DOC_SLUGS) {
    const md = readDoc(slug);
    if (!md) continue;
    out.push({ slug, title: docTitle(md, slug), excerpt: docExcerpt(md) });
  }
  return out;
}
