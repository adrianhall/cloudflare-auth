import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Phase 2 browser-level WCAG validation.
 *
 * - Targets Chromium only (sufficient for WCAG checks; avoids multi-browser overhead).
 * - Tests live in `tests/e2e/` and are completely separate from the Vitest workspace.
 * - The Hono server is started programmatically inside the test fixture — no `webServer`
 *   config is used here.
 *
 * Run with:  npm run test:e2e
 * CI gate:   npm run check:full
 *
 * Before running for the first time, install the Chromium binary:
 *   npx playwright install --with-deps chromium
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,

  reporter: process.env.CI ? "junit" : "list",

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
