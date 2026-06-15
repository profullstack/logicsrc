import { describe, expect, it } from "vitest";

import { sanitizeRenderedHtml } from "@/lib/html";

describe("sanitizeRenderedHtml", () => {
  it("removes script tags, event handlers, and javascript URLs", () => {
    const html = sanitizeRenderedHtml(
      '<h2>Title</h2><p>Hello</p><script>alert(1)</script><img src="https://example.com/a.png" onerror="alert(1)"><a href="javascript:alert(1)">bad</a>'
    );

    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain('<img src="https://example.com/a.png" />');
    expect(html).toContain("<a>bad</a>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
  });
});
