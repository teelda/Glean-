import { expect, gotoArea, test } from "./support";
import type { Page } from "@playwright/test";

const openForms = async (page: Page) => {
  await gotoArea(page, "forms");
  await expect(page.getByRole("heading", { name: /create a form without starting/i })).toBeVisible();
};

/**
 * The builder used to hold `generated`, `published`, `backendFormId` and
 * `backendShareUrl` as four independent values, and they disagreed in ways a
 * researcher could see. These lock the agreement, not the four values.
 */
test.describe("form lifecycle", () => {
  test("a fresh builder is a draft everywhere at once", async ({ page }) => {
    await openForms(page);
    await expect(page.locator(".form-preview-panel .status-chip")).toHaveText("Draft");
    await expect(page.locator(".toolbar-status b")).toHaveText("Draft not generated");
    // No link exists yet, so nothing may offer one.
    await expect(page.locator(".form-share-card")).toHaveCount(0);
  });

  test("a form restored from a previous visit never claims to be published", async ({ page }) => {
    // The public token is not written to localStorage, so a restored "published"
    // form would show a share card pointing at nothing. This was the original bug.
    await page.addInitScript(() => window.localStorage.setItem("glean-form-draft-v1", JSON.stringify({
      formName: "Restored form",
      researchGoal: "goal", audience: "audience", decision: "decision",
      sections: [{ id: "s1", title: "Section", questions: [{ id: "q1", text: "Q?", type: "open", options: [] }] }],
      published: true, generated: true
    })));
    await openForms(page);
    await expect(page.locator(".form-preview-panel .status-chip")).toHaveText("Draft");
    await expect(page.locator(".form-share-card")).toHaveCount(0);
  });

  test("generating from context moves every signal together", async ({ page }) => {
    await openForms(page);
    await page.getByRole("button", { name: /continue to context/i }).click();
    await page.getByLabel("Form name").fill("Checkout research");
    await page.getByLabel("Research goal").fill("Understand why people abandon checkout.");
    await page.getByLabel("Audience").fill("People who abandoned a cart in the last month.");
    await page.getByLabel("Decision").fill("Whether to rebuild the payment step.");
    await page.locator(".action-generate").click();

    await expect(page.locator(".toolbar-status b")).toHaveText("Generated draft");
    await expect(page.locator(".form-preview-panel .status-chip")).toHaveText("Draft");
    await expect(page.locator(".form-share-card")).toHaveCount(0);
  });
});

test("the responses panel refuses to imply data it cannot have", async ({ page }) => {
  await openForms(page);
  await expect(page.getByRole("button", { name: /refresh responses/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /add this page to study/i })).toBeDisabled();
});
