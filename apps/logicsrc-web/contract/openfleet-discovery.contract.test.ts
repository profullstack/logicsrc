import { describe, expect, it, vi } from "vitest";
import { familyOfSpec } from "../src/lib/specs";
import { listDocs, readDoc } from "../src/lib/docs";
import { GET as llms } from "../src/app/llms.txt/route";
import { GET as llmsFull } from "../src/app/llms-full.txt/route";
import sitemap from "../src/app/sitemap";

// Spec discovery must work even when the optional blog database is offline.
vi.mock("../src/lib/supabase", () => ({ publicClient: () => { throw new Error("offline"); } }));

describe("OpenFleet public discovery", () => {
  it("serves the specification through the process family and docs index", () => {
    expect(familyOfSpec("openfleet")?.slug).toBe("process");
    expect(listDocs()).toContainEqual(expect.objectContaining({ slug: "openfleet", title: "OpenFleet" }));
    expect(readDoc("openfleet")).toContain('"provider": "coinpay"');
  });

  it("includes a reachable docs URL and the full contract in the LLM feeds", async () => {
    expect(await llms().text()).toMatch(/\[OpenFleet\]\(https:\/\/[^)]+\/docs\/openfleet\)/);
    expect(await llmsFull().text()).toContain(readDoc("openfleet")!.trim());
  });

  it("includes the docs route in the sitemap without a blog connection", async () => {
    const entries = await sitemap();
    expect(entries.some((entry) => new URL(entry.url).pathname === "/docs/openfleet")).toBe(true);
  });
});
