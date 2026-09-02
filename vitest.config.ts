import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The e2e specs import @playwright/test, which has its own runner and its
    // own `test`. Without this, vitest collects them and fails on the import
    // rather than on anything real.
    include: ["lib/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"]
  }
});
