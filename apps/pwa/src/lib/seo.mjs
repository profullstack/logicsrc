// robots.txt and sitemap.xml for the credentials app.
//
// Almost everything here sits behind a session, so the sitemap lists only the
// pages an anonymous visitor (or a crawler) can open: the sign-in page and the
// sign-up form. The origin comes from the request, so whichever hostname the app
// answers on describes itself rather than another one.

import { requestOrigin } from "./origin.mjs";

// Public pages, by path. Everything else redirects to sign-in.
export const PUBLIC_PATHS = ["/", "/?mode=up"];

// Session-only areas a crawler has no reason to visit.
const DISALLOW = ["/api/", "/auth/", "/cli/", "/dashboard", "/keyring", "/settings", "/teams/", "/k/"];

/** https origin for this request (http only for localhost development). */
export function siteOrigin(req, fallback) {
  const origin = requestOrigin(req, fallback);
  return /^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin) ? origin : origin.replace(/^http:/, "https:");
}

const xmlEscape = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function sitemapXml(origin) {
  const urls = PUBLIC_PATHS.map((p) => `  <url><loc>${xmlEscape(origin + p)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(origin) {
  return ["User-agent: *", "Allow: /", ...DISALLOW.map((p) => `Disallow: ${p}`), "", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n");
}
