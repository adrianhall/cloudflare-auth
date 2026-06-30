import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the Vite + Cloudflare Access plugin e2e guard.
 *
 * This is the real-stack guard for the `cloudflareAccessPlugin()` (`./vite`
 * subpath): it boots the actual Vite dev server + `@cloudflare/vite-plugin`
 * (workerd) and exercises the plugin end-to-end through a browser AND a
 * direct API request. If `@cloudflare/vite-plugin` ever stops forwarding the
 * injected `req.rawHeaders` into the Worker, the authenticated `/api/me`
 * assertions fail.
 *
 * The fixture under `tests/e2e-demo/app/` installs the library built from
 * CURRENT source: `webServer.command` runs `prepare.mjs` (build → pack →
 * install) before `vite dev`. This MUST happen in the web server command,
 * not `globalSetup`, because Playwright starts the web server during plugin
 * setup — before the user `globalSetup` runs. Everything the fixture
 * generates is gitignored, so the working tree stays clean.
 *
 * Kept separate from the library's own `playwright.config.ts` (which boots a
 * lightweight Hono server for login-page a11y checks).
 *
 * Run with:  npm run test:e2e:demo
 */
export default defineConfig({
  testDir: "tests/e2e-demo",
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
    // Build + pack + install the current library into the fixture, then serve.
    command: "node ../prepare.mjs && npm run dev",
    cwd: "tests/e2e-demo/app",
    url: "http://localhost:5173/cdn-cgi/access/login",
    reuseExistingServer: !process.env.CI,
    // Generous: the first run does a full npm install in the fixture.
    timeout: 180_000
  }
});
