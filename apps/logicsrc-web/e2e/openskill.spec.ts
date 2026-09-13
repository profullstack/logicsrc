import { expect, test } from "@playwright/test";

test("human capabilities are discoverable and their Markdown can travel independently", async ({ page, request }) => {
  await page.goto("/openprofile/skills");
  await expect(page).toHaveURL(/\/openskill$/);
  await expect(page.getByRole("heading", { name: "OpenSkill", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole("link", { name: "Logo design", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Logo design", exact: true })).toBeVisible();
  const sourceLink = page.getByRole("link", { name: "Markdown source", exact: true });
  const source = await request.get((await sourceLink.getAttribute("href"))!);
  expect(source.status()).toBe(200);
  expect(source.headers()["content-type"]).toBe("text/markdown; charset=utf-8");
  expect(await source.text()).toContain("# Logo design");
  expect(await source.text()).toContain("**Kind**: skill");

  const index = await request.get("/openskill/catalog.md");
  expect(index.status()).toBe(200);
  expect(index.headers()["content-type"]).toBe("text/markdown; charset=utf-8");
  expect(await index.text()).toContain("/openskill/accountant/openskill.md");
});
