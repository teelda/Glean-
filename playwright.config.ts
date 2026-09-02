import { defineConfig, devices } from "@playwright/test";

/**
 * Two servers, because the auth gate can only be exercised one way.
 *
 * The middleware fails open when Supabase credentials are absent, which is what
 * makes local development without a project possible — and what makes it
 * impossible to test the gate on that same server. So `app` runs unconfigured
 * (every view reachable, no sign-in) and `auth` runs with stub credentials that
 * no session can ever satisfy, which is exactly the anonymous case the gate is
 * there to reject.
 */
const APP_PORT = 3210;
const AUTH_PORT = 3211;

const stubSupabase = {
  NEXT_PUBLIC_SUPABASE_URL: "https://stub.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "stub-anon-key"
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { trace: "on-first-retry" },

  projects: [
    {
      name: "app",
      testMatch: /.*\.app\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${APP_PORT}` }
    },
    {
      name: "app-mobile",
      testMatch: /.*\.mobile\.spec\.ts/,
      use: { ...devices["Pixel 5"], baseURL: `http://localhost:${APP_PORT}` }
    },
    {
      name: "auth",
      testMatch: /.*\.auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${AUTH_PORT}` }
    }
  ],

  webServer: [
    {
      command: `npx next dev -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // Explicitly blank, so a developer's own .env.local cannot switch the
      // gate on and make the app suite fail for the wrong reason.
      env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", NEXT_DIST_DIR: ".next-e2e-app" }
    },
    {
      command: `npx next dev -p ${AUTH_PORT}`,
      url: `http://localhost:${AUTH_PORT}/signin`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { ...stubSupabase, NEXT_DIST_DIR: ".next-e2e-auth" }
    }
  ]
});
