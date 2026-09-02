import { clickWhenLive, expect, test } from "./support";

/**
 * On a phone every control has to be reachable with a thumb, and nothing may
 * push the page sideways. Both were fixed by hand before and had no way of
 * staying fixed.
 */
const TAP = 44;

for (const area of ["home", "studies", "forms"] as const) {
  test(`${area} keeps tap targets reachable and the page in its lane`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /open navigation/i }).click();
    await clickWhenLive(page.locator(`.global-nav a[href="#${area}"]`));
    // Choosing a destination closes the drawer, so the scrim goes with it.
    await expect(page.locator(".nav-scrim")).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${area} overflows horizontally`).toBeLessThanOrEqual(1);

    const undersized = await page.evaluate((min) => {
      const offenders: string[] = [];
      for (const el of Array.from(document.querySelectorAll("button, a[href], select, input[type=checkbox]"))) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        if (box.height < min - 0.5 || box.width < min - 0.5) {
          offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${Math.round(box.width)}x${Math.round(box.height)}`);
        }
      }
      return offenders;
    }, TAP);

    expect(undersized, `undersized controls on ${area}`).toEqual([]);
  });
}
