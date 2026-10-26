// The sign-in page carries the Profullstack footer (webring row + badges), and
// the refresh only ever swaps in a footer that still links the ring.
import assert from "node:assert/strict";
import test from "node:test";

import { ringFooter, setRingFooter } from "../src/lib/ring-footer.mjs";

test("the bundled footer links the ring and both badges for app.logicsrc.com", () => {
  const html = ringFooter();
  assert.match(html, /rssamplifier\.com\/ring\/profullstack/);
  assert.match(html, /built\.indie\.pit\.world/);
  assert.match(html, /pwamart\.com\/for\.svg\?site=https%3A%2F%2Fapp\.logicsrc\.com%2F|pwamart\.com\/for\.svg\?site=https:\/\/app\.logicsrc\.com\//);
});

test("a refresh without the ring row is ignored", () => {
  const before = ringFooter();
  assert.equal(setRingFooter("<footer>nope</footer>"), false);
  assert.equal(setRingFooter(undefined), false);
  assert.equal(ringFooter(), before);
});
