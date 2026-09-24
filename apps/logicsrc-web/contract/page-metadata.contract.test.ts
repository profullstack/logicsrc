import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DOC_SLUGS, docExcerpt, docSubtitle, docTitle, readDoc } from "../src/lib/docs";
import {
  buildMetadata,
  composeTitle,
  PAGE_META,
  pageMetadata,
  SITE_NAME,
  SITE_OG_IMAGE,
  siteTitle,
  specMetadata,
  TITLE_MAX,
} from "../src/lib/page-meta";
import { allSpecs } from "../src/lib/specs";

/**
 * Guards every page's own title.
 *
 * Pages exported `{ title, description, alternates }` and nothing else.
 * Next.js shallow-merges metadata, so a page without an `openGraph` block
 * inherited the root layout's -- meaning og:title, og:description and og:url
 * were the HOMEPAGE's on every page of the site. Reddit, Slack, X and Facebook
 * read og:title, so every spec we posted was announced as "LogicSRC — Open
 * Coordination Standards for Humans & AI Agents" regardless of which spec the
 * link pointed at. The <title> tag was correct throughout, which is why
 * looking at the page never caught it.
 *
 * These tests fail if a page stops carrying its own social title, if a new
 * route reaches the sitemap without one, or if two pages share a title.
 */

const APP_DIR = resolve(process.cwd(), "src/app");

type Meta = ReturnType<typeof pageMetadata>;

function titleOf(metadata: Meta): string {
  return String(metadata.title);
}

function ogOf(metadata: Meta): { title?: unknown; description?: unknown; url?: unknown; images?: unknown } {
  return (metadata.openGraph ?? {}) as {
    title?: unknown;
    description?: unknown;
    url?: unknown;
    images?: unknown;
  };
}

function twitterOf(metadata: Meta): { title?: unknown; images?: unknown } {
  return (metadata.twitter ?? {}) as { title?: unknown; images?: unknown };
}

/** The sitemap's own static routes, read from source so the two cannot drift. */
function sitemapStaticPaths(): string[] {
  const source = readFileSync(resolve(APP_DIR, "sitemap.ts"), "utf8");
  // The array literal, not its type: the Route type mentions
  // `Sitemap[number]["changeFrequency"]`, so a naive search for "];" stops
  // inside it and the block comes back empty.
  const start = source.indexOf("= [", source.indexOf("const STATIC_ROUTES"));
  const end = source.indexOf("\n];", start);
  return [...source.slice(start, end).matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("the site's own pages each have a title", () => {
  const sitemapPaths = sitemapStaticPaths();

  it("reads the sitemap's static routes", () => {
    expect(sitemapPaths.length).toBeGreaterThan(5);
    expect(sitemapPaths).toContain("/");
  });

  it("every static route in the sitemap has a PAGE_META entry", () => {
    const missing = sitemapPaths.filter((path) => !PAGE_META[path]);
    expect(
      missing,
      `Add these paths to PAGE_META in src/lib/page-meta.ts, or they ship with the homepage's social card: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("no PAGE_META entry is for a path nothing serves", () => {
    // /hire-us is an SPA section rather than a sitemap-listed page in its own
    // right, so it is allowed to appear here without a sitemap entry.
    const allowed = new Set([...sitemapPaths, "/hire-us"]);
    const orphans = Object.keys(PAGE_META).filter((path) => !allowed.has(path));
    expect(orphans, `These PAGE_META paths are not served: ${orphans.join(", ")}`).toEqual([]);
  });

  it("titles and descriptions are unique per page", () => {
    const seen = new Map<string, string>();
    for (const [path, meta] of Object.entries(PAGE_META)) {
      const title = siteTitle(meta.title);
      const earlier = seen.get(title);
      expect(earlier, `"${title}" is used by both ${earlier} and ${path}`).toBeUndefined();
      seen.set(title, path);
    }
    const descriptions = Object.values(PAGE_META).map((m) => m.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("only the homepage is titled with the homepage title", () => {
    const home = siteTitle(PAGE_META["/"].title);
    const sharing = Object.entries(PAGE_META)
      .filter(([path, meta]) => path !== "/" && siteTitle(meta.title) === home)
      .map(([path]) => path);
    expect(sharing).toEqual([]);
  });

  it("every title names the site, says something, and fits a link preview", () => {
    for (const [path, meta] of Object.entries(PAGE_META)) {
      const title = siteTitle(meta.title);
      expect(title, path).toContain(SITE_NAME);
      // "Docs · LogicSRC" and "Blog · LogicSRC" are what this change replaced:
      // technically distinct, useless as a headline. Require a real subject.
      expect(title.replace(` · ${SITE_NAME}`, "").trim().split(/\s+/).length, path).toBeGreaterThan(1);
      expect(title.length, `${path} title is ${title.length} chars`).toBeLessThanOrEqual(TITLE_MAX);
      expect(meta.description.length, path).toBeGreaterThan(40);
    }
  });
});

describe("spec landing pages are titled from the registry", () => {
  const landings = allSpecs().filter((spec) => spec.landing);

  it("there are spec landing pages to check", () => {
    expect(landings.length).toBeGreaterThan(20);
  });

  it("each one gets its own title, description, og:url and image", () => {
    const titles = new Map<string, string>();
    for (const spec of landings) {
      const path = spec.landing as string;
      const metadata = specMetadata(path);
      const title = titleOf(metadata);

      expect(title, path).toContain(spec.name);
      expect(title.length, `${path} title is ${title.length} chars: ${title}`).toBeLessThanOrEqual(TITLE_MAX);
      const earlier = titles.get(title);
      expect(earlier, `"${title}" is used by both ${earlier} and ${path}`).toBeUndefined();
      titles.set(title, path);

      expect(ogOf(metadata).title, path).toBe(title);
      expect(twitterOf(metadata).title, path).toBe(title);
      expect(ogOf(metadata).url, path).toBe(`https://logicsrc.com${path}`);
      expect((metadata.alternates as { canonical?: unknown }).canonical, path).toBe(path);
      expect(ogOf(metadata).images, path).toEqual([SITE_OG_IMAGE]);
    }
  });

  it("no spec landing title is the homepage's", () => {
    const home = siteTitle(PAGE_META["/"].title);
    for (const spec of landings) {
      expect(titleOf(specMetadata(spec.landing as string)), spec.slug).not.toBe(home);
    }
  });

  it("a page's own description is kept when it passes one", () => {
    const spec = landings[0];
    const metadata = specMetadata(spec.landing as string, "A longer description written on the page.");
    expect(metadata.description).toBe("A longer description written on the page.");
    expect(ogOf(metadata).description).toBe("A longer description written on the page.");
  });

  it("a spec page with no registry entry fails loudly rather than falling back", () => {
    expect(() => specMetadata("/not-a-spec")).toThrow(/lib\/specs\.ts/);
    expect(() => pageMetadata("/not-a-page")).toThrow(/PAGE_META/);
  });

  it("composeTitle trims a long subject line at a clause boundary", () => {
    const long = composeTitle(
      "OpenObject",
      "A bucket you can mount: keyed objects encrypted by their owner, kept on paid disks at a stated redundancy, verified, repaired and read back by path"
    );
    expect(siteTitle(long).length).toBeLessThanOrEqual(TITLE_MAX);
    expect(long.startsWith("OpenObject: A bucket you can mount")).toBe(true);
    expect(long.endsWith(",")).toBe(false);
  });
});

describe("content routes carry their own social title too", () => {
  it("a doc, report or post gets openGraph and twitter titles and an image", () => {
    const metadata = buildMetadata({
      title: "OpenStream: A lossless byte-stream relay envelope",
      description: "How one program hands another the exact bytes of a stream.",
      path: "/docs/openstream",
      type: "article",
    });
    expect(titleOf(metadata)).toBe(
      "OpenStream: A lossless byte-stream relay envelope · LogicSRC"
    );
    expect(ogOf(metadata).title).toBe(titleOf(metadata));
    expect(twitterOf(metadata).title).toBe(titleOf(metadata));
    expect(ogOf(metadata).url).toBe("https://logicsrc.com/docs/openstream");
    expect(ogOf(metadata).images).toEqual([SITE_OG_IMAGE]);
  });

  /**
   * Next.js only supplies the file-convention app/opengraph-image.tsx card to
   * routes that declare no `openGraph`. Every route declares one now, so the
   * card has to be named explicitly or every page loses its social image --
   * which is what already happened to blog posts, the one route that used to
   * declare openGraph. They shipped with no og:image at all.
   */
  it("a post with a featured image uses it instead of the site card", () => {
    const metadata = buildMetadata({
      title: "A post with art",
      description: "It has its own image.",
      path: "/blog/art",
      type: "article",
      images: ["https://cdn.example.com/art.png"],
    });
    expect(ogOf(metadata).images).toEqual(["https://cdn.example.com/art.png"]);
  });

  it("a syndicated post points og:url at its canonical original", () => {
    const metadata = buildMetadata({
      title: "A guest post",
      description: "Published first somewhere else.",
      path: "/blog/guest",
      canonical: "https://example.com/guest",
      type: "article",
    });
    expect(ogOf(metadata).url).toBe("https://example.com/guest");
  });
});

describe("no page declares raw metadata", () => {
  function pageFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) pageFiles(path, out);
      else if (entry.name === "page.tsx" || entry.name === "layout.tsx") out.push(path);
    }
    return out;
  }

  it("every page and layout builds its metadata through lib/page-meta", () => {
    const offenders: string[] = [];
    for (const file of pageFiles(APP_DIR)) {
      const source = readFileSync(file, "utf8");
      const declares = /export\s+(const\s+metadata|async\s+function\s+generateMetadata)/.test(source);
      if (!declares) continue;
      if (!source.includes('from "@/lib/page-meta"')) offenders.push(file.replace(`${APP_DIR}/`, ""));
    }
    expect(
      offenders,
      `These routes declare metadata without lib/page-meta, so they inherit the layout's openGraph title: ${offenders.join(", ")}`
    ).toEqual([]);
  });
});

describe("doc pages are titled by their subject, not just their name", () => {
  it("every published doc has a subject line", () => {
    const missing = DOC_SLUGS.filter((slug) => docSubtitle(slug).length < 10);
    expect(
      missing,
      `These docs have no subject line: give the spec a registry entry in lib/specs.ts, or the guide an entry in GUIDE_SUBTITLES: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("doc titles are distinct, name the doc, and fit a link preview", () => {
    const titles = new Map<string, string>();
    for (const slug of DOC_SLUGS) {
      const md = readDoc(slug);
      expect(md, `docs/${slug}.md should be readable`).toBeTruthy();
      const name = docTitle(md as string, slug);
      const title = siteTitle(composeTitle(name, docSubtitle(slug)));
      const earlier = titles.get(title);
      expect(earlier, `"${title}" is used by both ${earlier} and ${slug}`).toBeUndefined();
      titles.set(title, slug);
      expect(title).toContain(name);
      expect(title.length, `${slug} title is ${title.length} chars: ${title}`).toBeLessThanOrEqual(TITLE_MAX);
    }
  });

  it("no doc description is a Status:/Slug: header or a bare list lead-in", () => {
    for (const slug of DOC_SLUGS) {
      const excerpt = docExcerpt(readDoc(slug) as string);
      expect(excerpt, slug).not.toMatch(/^(status|slug|version)\b\s*:/i);
      expect(excerpt, slug).not.toMatch(/:$/);
      // Either a real paragraph, or nothing -- in which case the page and the
      // docs index both fall back to the doc's subject line.
      if (excerpt) expect(excerpt.length, slug).toBeGreaterThan(40);
    }
  });

  it("every doc has a usable description one way or the other", () => {
    for (const slug of DOC_SLUGS) {
      const md = readDoc(slug) as string;
      const name = docTitle(md, slug);
      const description =
        docExcerpt(md) || `${name}: ${docSubtitle(slug)}. Part of the LogicSRC open-standards surface.`;
      expect(description.length, slug).toBeGreaterThan(40);
    }
  });
});
