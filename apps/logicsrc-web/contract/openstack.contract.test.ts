import { describe, expect, it } from "vitest";
import { GET, openstackBody } from "../src/app/.well-known/openstack.md/route";
import { readDoc } from "../src/lib/docs";

// The site that publishes a spec serves its own file, and that file is the
// worked example inside the spec, so the two can never drift apart.
describe("OpenStack.md: the site's own file", () => {
  it("serves the spec's worked example as text/markdown", async () => {
    const res = GET();
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const body = await res.text();
    expect(body.startsWith("# LogicSRC\n")).toBe(true);
    expect(readDoc("openstack")).toContain(body.trim());
  });

  it("follows its own rules: one name, an identity block, the fixed layers, a Not section", () => {
    const body = openstackBody();
    expect(body.match(/^# /gm)).toHaveLength(1);
    expect(body).toMatch(/^- \*\*Kind\*\*: monorepo$/m);
    expect(body).toMatch(/^- \*\*Web\*\*: https:\/\/logicsrc\.com$/m);
    expect(body).toMatch(/^- \*\*Operator\*\*: https:\/\/logicsrc\.com\/\.well-known\/openprofile\.md$/m);
    for (const layer of [
      "Languages",
      "Runtimes",
      "Interfaces",
      "Data",
      "Services",
      "Modules",
      "Tooling",
      "Hosting",
      "Auth",
      "Conventions",
      "Not"
    ]) {
      expect(body).toMatch(new RegExp(`^## ${layer}$`, "m"));
    }
    // every interface this monorepo ships is declared
    for (const iface of ["Web", "CLI", "TUI", "MCP", "API"]) {
      expect(body).toMatch(new RegExp(`^### ${iface}$`, "m"));
    }
    expect(body).not.toContain(String.fromCharCode(0x2014));
  });
});
