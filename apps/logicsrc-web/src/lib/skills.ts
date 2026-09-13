import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { marked } from "marked";

// Public concepts only. Read at build time; request paths never select files.
export const SKILL_SLUGS = [
  "branding", "logo-design", "graphic-design", "investing", "investor",
  "financial-advisor", "accounting", "accountant", "software-development",
  "developer", "software-engineer", "computer-science", "hardware-architectures",
  "hardware-architect"
] as const;

const SKILLS_DIR = resolve(process.cwd(), "../../docs/openskill");

export type SkillSummary = {
  slug: string;
  name: string;
  description: string;
  kind?: string;
  domain?: string;
  aliases?: string;
};

export function readSkill(slug: string): string | null {
  if (!(SKILL_SLUGS as readonly string[]).includes(slug)) return null;
  return readFileSync(resolve(SKILLS_DIR, `${slug}.md`), "utf8");
}

// A catalog view of the introduction, not a lossy replacement for the record.
// Markdown tokenization keeps headings or bullets inside code fences inert.
export function summarizeSkill(markdown: string, slug: string): SkillSummary {
  const result: SkillSummary = { slug, name: slug, description: "" };
  const tokens = marked.lexer(markdown);
  const start = tokens.findIndex((token) => token.type === "heading" && token.depth === 1);
  if (start < 0) return result;
  const title = tokens[start];
  if (title.type === "heading") result.name = title.text;
  let identity = true;
  for (const token of tokens.slice(start + 1)) {
    if (token.type === "heading") break;
    if (token.type === "space") continue;
    if (token.type === "list" && identity) {
      for (const item of token.items) {
        const match = /^(?:\*\*)?(Kind|Domain|Aliases)(?:\*\*)?:\s*(.+)$/i.exec(item.text);
        if (!match) continue;
        const key = match[1].toLowerCase() as "kind" | "domain" | "aliases";
        result[key] ??= match[2].trim();
      }
    } else {
      identity = false;
      if (token.type === "paragraph" && !result.description) result.description = token.text;
    }
  }
  return result;
}

export function listSkills(): SkillSummary[] {
  return SKILL_SLUGS.map((slug) => summarizeSkill(readSkill(slug)!, slug));
}
