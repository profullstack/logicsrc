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

  test("renders Credential Sharing OpenSpec route", async ({ page }) => {
    await page.goto("/credential-sharing");

    await expect(page.getByRole("heading", { name: "Credential Sharing", exact: true })).toBeVisible();
    await expect(page.getByText("Open replacement architecture for secrets")).toBeVisible();
    await expect(page.getByRole("heading", { name: ".env", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Doppler", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Railway", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "GitHub Secrets", exact: true })).toBeVisible();
    await expect(page.getByText("logicsrc credentials plan --from env --to railway")).toBeVisible();
  });

  test("renders top-level docs and legal route targets", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("heading", { name: "Top-Level Pages" })).toBeVisible();
    await expect(page.getByText("/docs · Docs")).toBeVisible();
    await expect(page.getByText("/blog · Blog")).toBeVisible();
    await expect(page.getByText("/credential-sharing · Credential Sharing")).toBeVisible();
    await expect(page.getByText("/terms · Terms")).toBeVisible();
    await expect(page.getByText("/privacy · Privacy")).toBeVisible();
  });

  test("renders Hire Us project request flow", async ({ page }) => {
    await page.goto("/hire-us");

    await expect(page.getByRole("heading", { name: "Hire Us", exact: true })).toBeVisible();
    await expect(page.locator(".price-row strong", { hasText: "$250" })).toBeVisible();
    await expect(page.getByText("per week")).toBeVisible();
    await expect(page.getByText("open infrastructure and open specs for AI agent systems")).toBeVisible();
    await expect(page.getByRole("button", { name: "Request review" })).toBeVisible();
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByPlaceholder("Describe the agent workflow")).toBeVisible();
    await expect(page.getByText("without exposing merchant credentials to the browser")).toBeVisible();
    await expect(page.getByText("COINPAY_PRODUCT=logicsrc-hire-us")).toBeVisible();
    await expect(page.getByText("COINPAY_STATUS=pending_acceptance")).toBeVisible();
  });

  test("serves sitemap and RSS XML endpoints", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    const rss = await request.get("/blog/rss.xml");

    expect(sitemap.status()).toBe(200);
    expect(sitemap.headers()["content-type"]).toMatch(/(?:application|text)\/xml/);
    await expect(sitemap.text()).resolves.toContain("https://logicsrc.com/openspec");
    await expect(sitemap.text()).resolves.toContain("https://logicsrc.com/credential-sharing");
    await expect(sitemap.text()).resolves.toContain("https://logicsrc.com/hire-us");

    expect(rss.status()).toBe(200);
    expect(rss.headers()["content-type"]).toMatch(/xml/);
    // Feed is generated from the blog_posts table; the channel header is always
    // present even when there are no posts (e.g. CI without Supabase).
    await expect(rss.text()).resolves.toContain("<title>LogicSRC Blog</title>");
  });
});
