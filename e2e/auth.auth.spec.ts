import { expect, test } from "./support";

/**
 * The gate, against a server configured with credentials no session can satisfy.
 *
 * Every request here is anonymous, which is the case the middleware exists to
 * handle. Respondents are the exception that matters most: they arrive with a
 * form link and never sign in, so gating their route would break the only flow
 * that collects data.
 */
test.describe("anonymous callers", () => {
  test("cannot publish a form", async ({ request }) => {
    const response = await request.post("/api/forms/publish", {
      data: { title: "t", name: "t", slug: "t", sections: [] },
      failOnStatusCode: false
    });
    expect(response.status()).toBe(401);
  });

  test("cannot read someone else's responses", async ({ request }) => {
    const response = await request.get("/api/forms/responses?formId=any", { failOnStatusCode: false });
    expect(response.status()).toBe(401);
    expect((await response.json()).error).toMatch(/signed in/i);
  });

  test("are sent to sign-in, and back to where they were going", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/signin\?next=%2F$/);
    await expect(page.getByRole("heading", { name: /sign in to glean/i })).toBeVisible();
  });

  test("can reach the sign-in page itself", async ({ page }) => {
    const response = await page.goto("/signin");
    expect(response?.status()).toBe(200);
  });

  test("can still open a respondent form", async ({ page }) => {
    // A respondent has no account. If this ever redirects, data collection stops.
    await page.goto("/forms/any-slug");
    await expect(page).not.toHaveURL(/\/signin/);
  });
});

test("the magic-link callback refuses a link with no code", async ({ page }) => {
  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/signin\?error=missing-code/);
  await expect(page.locator(".signin-error")).toContainText(/incomplete/i);
});

test("the callback will not redirect off-site", async ({ page }) => {
  // `next` comes from the URL; an absolute value would make sign-in an open redirect.
  await page.goto("/auth/callback?next=https://example.com");
  await expect(page).toHaveURL(/localhost/);
});
