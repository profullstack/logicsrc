import assert from "node:assert/strict";
import test from "node:test";

import { robotsTxt, siteOrigin, sitemapXml } from "../src/lib/seo.mjs";

const req = (host, protocol = "http") => ({ protocol, headers: { host }, get: (h) => (h.toLowerCase() === "host" ? host : undefined) });

test("each hostname describes itself over https", () => {
  assert.equal(siteOrigin(req("app.logicsrc.com"), "https://x"), "https://app.logicsrc.com");
  assert.equal(siteOrigin(req("localhost:8080"), "https://x"), "http://localhost:8080");
});

test("sitemap lists only public pages on this host", () => {
  const xml = sitemapXml("https://app.logicsrc.com");
  assert.match(xml, /<urlset /);
  assert.match(xml, /<loc>https:\/\/app\.logicsrc\.com\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/app\.logicsrc\.com\/\?mode=up<\/loc>/);
  assert.doesNotMatch(xml, /dashboard|settings|keyring/);
});

test("robots points at this host's sitemap and keeps it crawlable", () => {
  const txt = robotsTxt("https://app.logicsrc.com");
  assert.match(txt, /^Sitemap: https:\/\/app\.logicsrc\.com\/sitemap\.xml$/m);
  assert.doesNotMatch(txt, /Disallow: \/sitemap/);
  assert.match(txt, /Disallow: \/dashboard/);
});
