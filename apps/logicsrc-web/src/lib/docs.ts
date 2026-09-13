import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { docSlugs } from "./specs";

// Repo-root docs/ (read at build time during static generation, so there is
// no runtime filesystem dependency in the deployed image).
const DOCS_DIR = resolve(process.cwd(), "../../docs");

// The public docs: every spec in lib/specs.ts that has a specification text,
// then the guides listed there. Internal notes (roadmap, positioning, arcade)
// are not in the registry and so are not served.
export const DOC_SLUGS: readonly string[] = docSlugs();

export type DocSlug = string;

export function isDocSlug(slug: string): slug is DocSlug {
  return DOC_SLUGS.includes(slug);
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
