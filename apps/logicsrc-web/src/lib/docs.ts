import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allSpecs, docSlugs } from "./specs";

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

/**
 * The guides have no registry `line`, so their subject is stated here.
 * The specs' subjects come from lib/specs.ts and are never duplicated.
 */
const GUIDE_SUBTITLES: Record<string, string> = {
  "data-model": "The tables behind the reference implementation",
  cli: "Command grammar, flags, and output conventions",
  tui: "Terminal rendering for the dashboard and Waiting Arcade",
  config: "Where config lives, and what each key does",
  permissions: "Explicit, scoped, auditable permission grants",
  plugins: "The plugin system, and the plugins that ship with it",
  "openontology-governance": "An agent proposes, a human applies",
  "openontology-interoperability": "Mapping to RDF, SHACL and PROV-O, and where it stops",
};

/**
 * A one-line subject for a doc, used in its page title.
 *
 * Every spec's H1 is just its name ("# OpenStream"), so a title built from the
 * H1 alone reads "OpenStream · LogicSRC" and tells a reader on Reddit or in
 * search results nothing about what the spec is. For a spec this is the same
 * line the sidebar, /specs and the home page already show.
 */
export function docSubtitle(slug: string): string {
  const spec = allSpecs().find((s) => s.doc === `/docs/${slug}`);
  return spec?.line ?? GUIDE_SUBTITLES[slug] ?? "";
}

function isHeaderLine(line: string): boolean {
  return /^(status|slug|version|editor|authors?|updated|date)\b\s*:/i.test(line.replace(/^\*\*/, ""));
}

function isSkippableLine(line: string): boolean {
  return (
    line.startsWith("#") ||
    line.startsWith("```") ||
    line.startsWith(">") ||
    line.startsWith("|") ||
    line.startsWith("- ") ||
    line.startsWith("* ") ||
    isHeaderLine(line)
  );
}

/**
 * The first real paragraph, joined across its wrapped lines.
 *
 * One line was not enough. The specs hard-wrap their prose, so the old
 * single-line excerpt cut "OpenSwarm is a LogicSRC OpenSpec family for paid,
 * encrypted, peer-to-peer" off mid-sentence, and the several specs that open
 * with "Status: 0.1 draft" were described to search engines as exactly that.
 * Some docs open with a lead-in ("Core tables:", "Primary command style:")
 * whose paragraph is a list or a code block; there is no sentence to quote, so
 * those return "" and the caller falls back to the doc's subject line.
 */
export function docExcerpt(markdown: string): string {
  const paragraph: string[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line || isSkippableLine(line)) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (paragraph.length === 0 && line.endsWith(":")) return "";
    paragraph.push(line);
    if (paragraph.join(" ").length >= 200) break;
  }

  const text = paragraph
    .join(" ")
    .replace(/[*_`#>[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 40) return "";
  if (text.length <= 200) return text;
  const cut = text.slice(0, 200);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "");
}

export type DocSummary = { slug: DocSlug; title: string; excerpt: string };

export function listDocs(): DocSummary[] {
  const out: DocSummary[] = [];
  for (const slug of DOC_SLUGS) {
    const md = readDoc(slug);
    if (!md) continue;
    // A doc whose first paragraph is a list has no quotable sentence, so the
    // index card shows the doc's own subject line instead of nothing.
    out.push({ slug, title: docTitle(md, slug), excerpt: docExcerpt(md) || docSubtitle(slug) });
  }
  return out;
}
