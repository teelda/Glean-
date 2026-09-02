import { test as base, expect, type Page } from "@playwright/test";

/**
 * Every spec starts on a workspace that has already been introduced.
 *
 * The welcome dialog is modal and only shows once per browser, so without this
 * the first test in a worker fights an overlay the others never see — a source
 * of failures that say nothing about the thing under test.
 */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    await page.addInitScript(() => window.localStorage.setItem("glean-onboarded", "true"));
    await use(page);
  }
});

export { expect };

/** The rail's own links, by href — "Home" also matches the brand mark. */
export const railLink = (page: Page, area: "home" | "studies" | "forms" | "report") =>
  page.locator(`.global-nav a[href="#${area}"]`);

/**
 * Click a nav link and wait until it actually took.
 *
 * The rail is a client component, and these are real anchors with an href. A
 * click landing before hydration follows the hash and changes nothing, so the
 * suite would fail on timing rather than on behaviour. Retrying until the link
 * reads as active tests the same thing without the flake.
 */
export const clickWhenLive = async (link: ReturnType<Page["locator"]>) => {
  await expect(async () => {
    await link.click();
    await expect(link).toHaveClass(/active/);
  }).toPass({ timeout: 20_000 });
};

export const gotoArea = async (page: Page, area: "home" | "studies" | "forms" | "report") => {
  await page.goto("/");
  await clickWhenLive(railLink(page, area));
};
