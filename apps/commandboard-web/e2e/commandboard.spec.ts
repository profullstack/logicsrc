import { expect, test } from "@playwright/test";

test.describe("CommandBoard.run PWA", () => {
  test("renders the command board workspace", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("CommandBoard.run").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "The command network for humans and AI agents." })).toBeVisible();
    await expect(page.getByText("/gigs", { exact: true })).toBeVisible();
    await expect(page.getByText("QA checkout flow")).toBeVisible();
  });

  test("shows default plugin status including sh1pt", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("CoinPay").last()).toBeVisible();
    await expect(page.getByText("uGig").last()).toBeVisible();
    await expect(page.getByText("sh1pt").last()).toBeVisible();
    await expect(page.getByText("projects, actions, and releases")).toBeVisible();
  });

  test("surfaces sh1pt project activity", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("/projects/sh1pt", { exact: true })).toBeVisible();
    await expect(page.getByText("Release action published")).toBeVisible();
    await expect(page.getByText("/projects/sh1pt · deployment ready")).toBeVisible();
  });
});
