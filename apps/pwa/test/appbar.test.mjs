// Signing out is a POST and csrfGuard rejects any POST whose _csrf does not
// match the mc_csrf cookie. The Sign out form shipped without that field, so
// every click answered "bad csrf token" and nobody could log out. These pin the
// hidden input in place.
import assert from "node:assert/strict";
import test from "node:test";

import { appBar } from "../src/lib/html.mjs";

const req = (extra = {}) => ({ csrfToken: "deadbeefdeadbeef", user: { email: "a@example.com" }, ...extra });

test("the sign-out form carries the CSRF token", () => {
  const html = appBar(req());
  assert.match(html, /action="\/auth\/logout"/);
  assert.match(html, /<input type="hidden" name="_csrf" value="deadbeefdeadbeef">/);
  // the field has to be inside the form, not merely somewhere on the page
  const form = html.slice(html.indexOf('action="/auth/logout"'));
  assert.ok(
    form.indexOf('name="_csrf"') < form.indexOf("</form>"),
    "the _csrf input must be inside the sign-out form",
  );
});

test("signed-out visitors get no sign-out form at all", () => {
  const html = appBar({ user: null, csrfToken: "x" });
  assert.doesNotMatch(html, /\/auth\/logout/);
  assert.match(html, /Sign in/);
});

test("survives a request with no CSRF token rather than printing undefined", () => {
  const html = appBar(req({ csrfToken: undefined }));
  assert.match(html, /name="_csrf" value=""/);
});

test("the signed-in identity is escaped", () => {
  const html = appBar(req({ user: { email: '<script>alert(1)</script>' } }));
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});
