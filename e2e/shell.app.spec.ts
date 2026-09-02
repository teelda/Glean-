import { clickWhenLive, expect, gotoArea, railLink, test } from "./support";

test("the breadcrumb climbs back out of a study", async ({ page }) => {
  await gotoArea(page, "studies");
  await page.locator(".research-study-card").click();

  const crumbs = page.locator(".topbar-crumbs");
  await expect(crumbs).toContainText("Studies");
  await expect(crumbs.locator("b")).toHaveText(/Interviews|Findings|Report/);

  await crumbs.getByRole("button", { name: "Studies" }).click();
  await expect(page.getByRole("heading", { name: /your research workspace/i })).toBeVisible();
});

test("the rail collapses to icons and can be forced back open", async ({ page }) => {
  // Forms wants the room, so opening it collapses the rail by default.
  await gotoArea(page, "forms");
  await expect(page.locator(".glean-app")).toHaveClass(/nav-collapsed/);

  await page.getByRole("button", { name: /expand navigation/i }).click();
  await expect(page.locator(".glean-app")).not.toHaveClass(/nav-collapsed/);
});

test("no view scrolls sideways", async ({ page }) => {
  for (const area of ["home", "studies", "forms"] as const) {
    await page.goto("/");
    await clickWhenLive(railLink(page, area));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${area} overflows horizontally`).toBeLessThanOrEqual(1);
  }
});
