import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the `example-vite` demo app.
 *
 * This is the real-stack guard for issue #11: it boots the actual Vite
 * dev server + `@cloudflare/vite-plugin` (workerd) and exercises the
 * `cloudflareAccessPlugin()` end-to-end through a browser AND a direct
 * API request.  If `@cloudflare/vite-plugin` ever stops forwarding the
 * injected `req.rawHeaders` into the Worker, the authenticated `/api/me`
 * assertions here fail.
 *
 * Kept separate from the library's own `playwright.config.ts` (which
 * boots a lightweight Hono server) because this one is heavier — it
 * installs/boots the demo.
 *
 * Run with:  npm run test:e2e:demo
 */
export default defineConfig({
  testDir: "example-vite/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? "junit" : "list",

  use: {
    baseURL: "http://localhost:5173"
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],

  webServer: {
    command: "npm run dev",
    cwd: "example-vite",
    url: "http://localhost:5173/cdn-cgi/access/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
