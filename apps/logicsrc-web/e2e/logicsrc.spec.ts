import { expect, test } from "@playwright/test";

test.describe("LogicSRC PWA", () => {
  test("renders OpenSpec comparison and compatibility commands", async ({ page }) => {
    await page.goto("/openspec");

    await expect(page.getByRole("heading", { name: "LogicSRC", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "LogicSRC vs OpenSpec.dev" })).toBeVisible();
    await expect(page.getByText("OpenSpec.dev currently positions itself as no-MCP.")).toBeVisible();
    await expect(page.getByText("logicsrc --openspec agentswarm --yolo")).toBeVisible();
    await expect(page.getByText("openspec import")).toBeVisible();
    await expect(page.getByText("openspec export")).toBeVisible();
  });

  test("renders top-level docs and legal route targets", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("heading", { name: "Top-Level Pages" })).toBeVisible();
    await expect(page.getByText("/docs · Docs")).toBeVisible();
    await expect(page.getByText("/blog · Blog")).toBeVisible();
    await expect(page.getByText("/terms · Terms")).toBeVisible();
    await expect(page.getByText("/privacy · Privacy")).toBeVisible();
  });

  test("serves sitemap and RSS XML endpoints", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    const rss = await request.get("/blog/rss.xml");

    expect(sitemap.status()).toBe(200);
    expect(sitemap.headers()["content-type"]).toMatch(/(?:application|text)\/xml/);
    await expect(sitemap.text()).resolves.toContain("https://logicsrc.com/openspec");

    expect(rss.status()).toBe(200);
    expect(rss.headers()["content-type"]).toMatch(/(?:application|text)\/xml/);
    await expect(rss.text()).resolves.toContain("LogicSRC OpenSpec Compatibility");
  });
});
