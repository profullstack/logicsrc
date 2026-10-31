// The sign-in page carries the shared Profullstack footer (webring row + square badges)
// from the package's bundled template only: nothing is fetched at runtime.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import * as ringFooterModule from "../src/lib/ring-footer.mjs";

test("the shared footer links the ring and both square badges for app.logicsrc.com", () => {
  const html = ringFooterModule.ringFooter();
  assert.match(html, /rssamplifier\.com\/ring\/profullstack/);
  assert.match(html, /href="https:\/\/built\.indie\.pit\.world\/for\?site=https:\/\/app\.logicsrc\.com\//);
  assert.match(html, /src="https:\/\/logicsrc\.com\/openicon\/set\/hq\/svg\/built-indie\.svg"/);
  assert.match(html, /href="https:\/\/pwamart\.com\/for\?site=https:\/\/app\.logicsrc\.com\//);
  assert.match(html, /src="https:\/\/logicsrc\.com\/openicon\/set\/hq\/svg\/pwamart\.svg"/);
  assert.match(html, /pfs-footer__badge--publisher img\{width:32px;height:32px/);
});

test("the footer cannot be swapped at runtime (no CDN refresh)", () => {
  assert.equal("setRingFooter" in ringFooterModule, false);
  assert.equal("startRingFooterRefresh" in ringFooterModule, false);
  const src = readFileSync(new URL("../src/lib/ring-footer.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /footerHtml\(/);
});

test("the footer package follows the shared latest release", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.dependencies["@profullstack/footer"], "latest");
});
