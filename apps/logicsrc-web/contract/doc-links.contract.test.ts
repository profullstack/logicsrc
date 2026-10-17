import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { marked } from "marked";

import { DOC_SLUGS, readDoc, resolveDocLinks } from "@/lib/docs";
import { allSpecs } from "@/lib/specs";

// A crawler found /docs/opencreds linking /docs/opencreds/spec.md and
// /docs/credential-sharing.md (both 404) and the sidebar linking /openi18n and
// /openl10n, which have no landing page.
describe("doc links", () => {
  it("maps a served doc to /docs/<slug> and anything else to the repository", () => {
    const html = resolveDocLinks(
      '<a href="./credential-sharing.md">a</a><a href="./opencreds/spec.md#x">b</a>' +
        '<a href="../prd/0001-x.md">c</a><a href="https://example.com/x.md">d</a><a href="#top">e</a>'
    );
    expect(html).toContain('href="/docs/credential-sharing"');
    expect(html).toContain('href="https://github.com/profullstack/logicsrc/blob/master/docs/opencreds/spec.md#x"');
    expect(html).toContain('href="https://github.com/profullstack/logicsrc/blob/master/prd/0001-x.md"');
    expect(html).toContain('href="https://example.com/x.md"');
    expect(html).toContain('href="#top"');
  });

  it("leaves no rendered doc with a relative .md link, and every repository target exists", async () => {
    const repo = resolve(process.cwd(), "../..");
    for (const slug of DOC_SLUGS) {
      const md = readDoc(slug);
      if (!md) continue;
      const html = resolveDocLinks(await marked.parse(md));
      for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
        expect(/^(?!https?:|\/|#|mailto:).*\.md(#|$)/.test(href), `${slug}: ${href}`).toBe(false);
        const blob = /^https:\/\/github\.com\/profullstack\/logicsrc\/blob\/master\/([^#]+)/.exec(href);
        if (blob) expect(existsSync(resolve(repo, blob[1])), `${slug}: ${href}`).toBe(true);
      }
    }
  });

  it("gives every spec landing a page", () => {
    const catchAll = new Set(["openspec", "credential-sharing", "agentbyte"]);
    for (const spec of allSpecs()) {
      if (!spec.landing) continue;
      const seg = spec.landing.replace(/^\//, "");
      expect(existsSync(resolve(process.cwd(), "src/app", seg)) || catchAll.has(seg), spec.landing).toBe(true);
    }
  });
});
