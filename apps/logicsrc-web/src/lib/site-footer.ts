import { footerHtml, type FooterOptions } from "@profullstack/footer";

/**
 * The site footer: @profullstack/footer (links, copyright and the Profullstack
 * webring). SiteShell renders it as the package's React server component; the
 * homepage, which is the legacy markup string (lib/page-markup.ts), gets the same
 * footer as HTML. Both render on the server, which is what the ring's verifier reads.
 */
export const SITE_FOOTER: FooterOptions = {
  site: "https://logicsrc.com/",
  links: [
    { label: "Specs", href: "/specs" },
    { label: "Docs", href: "/docs" },
    { label: "RSS", href: "/blog/rss.xml" },
    { label: "llms.txt", href: "/llms.txt" },
    { label: "Terms", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
  ],
};

/** Muted text, as the old footer had; the package inherits `color`. */
export const SITE_FOOTER_COLOR = "#5b6b7a";

export function siteFooterHtml(): Promise<string> {
  return footerHtml(SITE_FOOTER);
}
