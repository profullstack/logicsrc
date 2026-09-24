import type { Metadata } from "next";
import { allSpecs } from "./specs";

/**
 * Every page's title, description, canonical URL and social card, from one
 * builder.
 *
 * Why this exists: pages exported `{ title, description, alternates }` and
 * nothing else. Next.js shallow-merges metadata, so a page that never declares
 * `openGraph` inherits the root layout's object wholesale -- which meant
 * og:title, og:description and og:url were the HOMEPAGE's on every page of the
 * site. Reddit, Slack, X and Facebook read og:title, so every spec we posted
 * was announced as "LogicSRC - Open Coordination Standards for Humans & AI
 * Agents" no matter which spec the link pointed at. The <title> tag was correct
 * the whole time, which is why looking at the page never caught it.
 *
 * So no page declares raw metadata any more. Everything goes through
 * `specMetadata` (a spec landing page, titled from lib/specs.ts),
 * `pageMetadata` (the site's own pages, titled from PAGE_META below) or
 * `contentMetadata` (a doc, post, skill or ontology record, titled from the
 * content), and all three always emit openGraph and twitter titles.
 */

export const SITE_URL = (process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "");
export const SITE_NAME = "LogicSRC";

/**
 * The branded card from app/opengraph-image.tsx, named explicitly.
 *
 * Next.js only falls back to the file-convention image for routes that declare
 * no `openGraph`. Every page declares one now, and blog posts already did --
 * which is why live posts shipped with no og:image whatsoever. So the default
 * image is stated here rather than inherited.
 */
export const SITE_OG_IMAGE = `${SITE_URL}/opengraph-image`;

/** Long enough to say something, short enough to survive a link preview. */
export const TITLE_MAX = 100;

export type PageMeta = { title: string; description: string };

/**
 * The site's own pages -- the ones that are not a spec and not content.
 * Keyed by path, so `contract/page-metadata.contract.test.ts` can require an
 * entry for every static route in sitemap.ts: a new page reaching the sitemap
 * with no title here fails the test instead of silently shipping the
 * homepage's social card.
 */
export const PAGE_META: Record<string, PageMeta> = {
  "/": {
    title: "LogicSRC — Open Coordination Standards for Humans & AI Agents",
    description:
      "Open schemas, primitives, and conventions for coordination between humans, AI agents, plugins, payment systems, and hosted products.",
  },
  "/specs": {
    title: "LogicSRC Specs: Four Families of Open Coordination Standards",
    description:
      "Every LogicSRC specification in four families: people and agents, access and credentials, catalogs a site serves about itself, and agents and process. Each family drills down to its specs, each spec to an overview and the specification text.",
  },
  "/docs": {
    title: "LogicSRC Docs: Specification Text, CLI, Config, and Plugins",
    description:
      "The specification text of every LogicSRC spec, grouped by family, and the guides: data model, CLI and TUI conventions, config, permissions, plugins.",
  },
  "/openontology/explore": {
    title: "Explore OpenOntology: Entities, Claims, and Saved Queries",
    description:
      "A read-only explorer over the OpenOntology example package: entity types, entities, claims with provenance, and the saved queries that answer real questions.",
  },
  "/hire-us": {
    title: "Hire Us: Implementation Help for LogicSRC Standards",
    description:
      "Implementation help for LogicSRC, OpenFleet, and Credential Sharing at $400/hour/agent for accepted work, paid via CoinPay.",
  },
  "/pricing": {
    title: "Pricing: Free Standard, $400 per Agent-Hour Implementation",
    description:
      "LogicSRC the open specification, schemas, SDKs, and CLI are free and open source. Implementation help is $400/hour/agent for accepted work, paid via CoinPay.",
  },
  "/blog": {
    title: "Blog: LogicSRC Project Notes and Release Posts",
    description:
      "Project notes for LogicSRC OpenSpec standards, AgentSwarm, AgentByte, SDKs, MCP, and reference implementations.",
  },
  "/about": {
    title: "About LogicSRC: The Profullstack Open-Specification Project",
    description:
      "LogicSRC is the Profullstack, Inc. open-specification project for coordination between humans and AI agents — schemas, primitives, and conventions that products implement without owning the standard.",
  },
  "/terms": {
    title: "Terms of Engagement",
    description:
      "Terms of engagement for LogicSRC: the specification and tooling are open source and free; Profullstack implementation work is billed at $400/hour/agent against approved hours, with a 10-agent-hour minimum.",
  },
  "/privacy": {
    title: "Privacy: What logicsrc.com Collects",
    description:
      "What logicsrc.com collects and what it does not: privacy-friendly analytics, the Hire Us project form, the CoinPay sign-in cookie, and the boundary that keeps credential values off our servers.",
  },
};

/** The site suffix, skipped when the title already names the site. */
export function siteTitle(title: string): string {
  return title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`;
}

/**
 * "<Name>: <what it is>", trimmed at a clause boundary to fit TITLE_MAX.
 *
 * The registry's `line` is a full sentence written for a list, and some run
 * well past what a link preview shows. Cutting at a comma or a colon keeps the
 * first clause, which is the part that identifies the spec.
 */
const DANGLING = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or",
  "so", "that", "the", "to", "under", "with",
]);

export function composeTitle(name: string, line: string): string {
  const room = TITLE_MAX - ` · ${SITE_NAME}`.length - `${name}: `.length;
  if (line.length <= room) return `${name}: ${line}`;
  const cut = line.slice(0, room);
  const boundary = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf(": "), cut.lastIndexOf(" ("));
  let clause = boundary > 24 ? cut.slice(0, boundary) : cut.slice(0, cut.lastIndexOf(" "));
  // A cut at a word boundary can leave the sentence hanging on a preposition
  // ("...the way in and the way out of"), which reads worse than stopping one
  // word earlier.
  for (;;) {
    clause = clause.replace(/[\s,;:(]+$/, "");
    const words = clause.split(" ");
    if (words.length > 3 && DANGLING.has(words[words.length - 1].toLowerCase())) {
      clause = words.slice(0, -1).join(" ");
      continue;
    }
    break;
  }
  return `${name}: ${clause}`;
}

function absolute(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return path === "/" ? SITE_URL : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

type BuildInput = PageMeta & {
  /** Route path, used for og:url and (unless `canonical` overrides it) rel=canonical. */
  path: string;
  /** Absolute canonical for syndicated content whose original lives elsewhere. */
  canonical?: string;
  type?: "website" | "article";
  images?: string[];
  /** Extra alternates, e.g. the blog's RSS feed. */
  alternateTypes?: Record<string, string>;
};

/**
 * The one place page metadata is assembled. openGraph and twitter are never
 * omitted, because omitting them inherits the layout's.
 */
export function buildMetadata(input: BuildInput): Metadata {
  const title = siteTitle(input.title);
  const canonical = input.canonical ?? input.path;
  const images = input.images?.length ? input.images : [SITE_OG_IMAGE];
  return {
    title,
    description: input.description,
    alternates: {
      canonical,
      ...(input.alternateTypes ? { types: input.alternateTypes } : {}),
    },
    openGraph: {
      type: input.type ?? "website",
      siteName: SITE_NAME,
      url: absolute(canonical),
      title,
      description: input.description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: input.description,
      images,
    },
  };
}

/** Metadata for one of the site's own pages, from its entry in `PAGE_META`. */
export function pageMetadata(path: string, overrides: Partial<BuildInput> = {}): Metadata {
  const meta = PAGE_META[path];
  if (!meta) {
    throw new Error(
      `No PAGE_META entry for "${path}". Add one so the page gets its own social title.`
    );
  }
  return buildMetadata({ ...meta, path, ...overrides });
}

/**
 * Metadata for a spec landing page.
 *
 * The name and the one-line subject come from lib/specs.ts, so a spec's title
 * cannot drift from the way it is described everywhere else on the site, and a
 * new spec page gets a real title the moment its registry entry exists. The
 * longer marketing description stays on the page that wrote it.
 */
export function specMetadata(path: string, description?: string): Metadata {
  const slug = path.replace(/^\//, "");
  const spec = allSpecs().find((s) => s.slug === slug || s.landing === path);
  if (!spec) {
    throw new Error(
      `No spec in lib/specs.ts for "${path}". Add its registry entry so the page is titled and listed.`
    );
  }
  return buildMetadata({
    title: composeTitle(spec.name, spec.line),
    description: description ?? spec.line,
    path,
  });
}

/** The name and subject line a spec is titled with, for tests and listings. */
export function specTitle(slug: string): string | null {
  const spec = allSpecs().find((s) => s.slug === slug);
  return spec ? composeTitle(spec.name, spec.line) : null;
}

/** Metadata for a route whose title comes from content (a doc, post, skill, record). */
export function contentMetadata(input: BuildInput): Metadata {
  return buildMetadata(input);
}

/** The 404 case, so a missing slug still gets its own title rather than the site's. */
export function notFoundMetadata(what: string): Metadata {
  return {
    title: `Not found · ${SITE_NAME}`,
    description: `This ${what} does not exist on ${SITE_NAME}.`,
    robots: { index: false, follow: true },
  };
}
