// The sign-in page carries the Profullstack footer (webring row + badges), from
// the template bundled in the pinned package only: nothing is fetched at runtime.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import * as ringFooterModule from "../src/lib/ring-footer.mjs";

test("the bundled footer links the ring and both badges for app.logicsrc.com", () => {
  const html = ringFooterModule.ringFooter();
  assert.match(html, /rssamplifier\.com\/ring\/profullstack/);
  assert.match(html, /built\.indie\.pit\.world/);
  assert.match(html, /pwamart\.com\/for\.svg\?site=https%3A%2F%2Fapp\.logicsrc\.com%2F|pwamart\.com\/for\.svg\?site=https:\/\/app\.logicsrc\.com\//);
});

test("the footer cannot be swapped at runtime (no CDN refresh)", () => {
  assert.equal("setRingFooter" in ringFooterModule, false);
  assert.equal("startRingFooterRefresh" in ringFooterModule, false);
  const src = readFileSync(new URL("../src/lib/ring-footer.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /footerHtml\(/);
});

test("the footer package is pinned to an exact version", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.dependencies["@profullstack/footer"], /^\d+\.\d+\.\d+$/);
});
