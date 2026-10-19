/**
 * The site footer: one row of links plus the copyright. The network links
 * (pit.world, search, ring) come from the pit.world global footer, which the
 * root layout appends to every page (components/pit-footer.tsx).
 * SiteShell and the homepage markup string (lib/page-markup.ts) share this HTML.
 */
const LINKS: Array<[string, string]> = [
  ["Specs", "/specs"],
  ["Docs", "/docs"],
  ["Blog", "/blog"],
  ["RSS", "/blog/rss.xml"],
  ["llms.txt", "/llms.txt"],
  ["Code", "https://github.com/profullstack/logicsrc"],
  ["Terms", "/terms"],
  ["Privacy", "/privacy"],
];

/** Muted text, as the old footer had. */
export const SITE_FOOTER_COLOR = "#5b6b7a";

export const SITE_FOOTER_HTML =
  `<footer class="site-footer" style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:.5rem 1.25rem;border-top:1px solid rgba(91,107,122,.25);padding:1.25rem 0;font-size:.875rem">` +
  `<span>&copy; ${new Date().getFullYear()} LogicSRC</span>` +
  `<nav aria-label="Footer" style="display:flex;flex-wrap:wrap;gap:.5rem 1.25rem">` +
  LINKS.map(([label, href]) => `<a href="${href}" style="color:inherit">${label}</a>`).join("") +
  `</nav></footer>`;

export async function siteFooterHtml(): Promise<string> {
  return SITE_FOOTER_HTML;
}
