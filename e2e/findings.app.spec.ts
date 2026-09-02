import { clickWhenLive, expect, gotoArea, test } from "./support";
import type { Page } from "@playwright/test";

const openFindings = async (page: Page) => {
  await gotoArea(page, "studies");
  await page.locator(".research-study-card").click();
  await clickWhenLive(page.locator('.journey-nav a[href="#findings"]'));
  await expect(page.locator(".finding-index")).toBeVisible();
};

test("the index lists every finding in the study", async ({ page }) => {
  await openFindings(page);
  const rows = page.locator(".finding-index-list li");
  const total = await rows.count();
  expect(total).toBeGreaterThan(1);
  await expect(page.locator(".finding-index-head h2")).toHaveText(`${total} in this study`);
});

test("choosing a finding in the index opens it", async ({ page }) => {
  await openFindings(page);
  const second = page.locator(".finding-index-list li").nth(1);
  const title = (await second.locator(".finding-index-body b").innerText()).trim();
  await second.locator("button").click();
  await expect(page.locator(".finding-heading h1")).toHaveText(title);
  await expect(page.locator(".finding-nav > span")).toContainText("Finding 2 of");
});

test("approving a finding updates the tally and the row together", async ({ page }) => {
  await openFindings(page);
  const draft = page.locator(".finding-index-list li button:not(.approved):not(.rejected)").first();
  await draft.click();
  await page.getByRole("button", { name: /^Approve finding$/ }).click();
  await expect(page.locator(".finding-tally .tally-approved")).toBeVisible();
  await expect(page.locator(".finding-index-list button.approved").first()).toBeVisible();
});

test("tags on a finding are shown, not just stored", async ({ page }) => {
  await openFindings(page);
  await expect(page.locator(".finding-meta .tag-chip").first()).toBeVisible();
});

test("participant coverage counts only interviews the finding quotes", async ({ page }) => {
  await openFindings(page);
  const quoted = await page.locator(".exact-quote").count();
  const covered = Number(await page.locator(".coverage-block b").innerText());
  expect(covered).toBeGreaterThan(0);
  expect(covered).toBeLessThanOrEqual(quoted);
});
