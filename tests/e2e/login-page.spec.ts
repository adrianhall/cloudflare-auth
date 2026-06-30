/**
 * Phase 2 browser-level WCAG validation for the developer login page.
 *
 * Uses Playwright + @axe-core/playwright to catch rendering-dependent
 * accessibility issues that jsdom-based Phase 1 tests cannot reach:
 *   - computed contrast across the full CSS cascade
 *   - focus-indicator visibility
 *   - keyboard navigation order
 *   - violations that only manifest under real layout conditions
 *
 * The Hono server is started programmatically in a worker-scoped fixture
 * (random port, no external process) and torn down after all tests finish.
 *
 * Run with:  npm run test:e2e
 */

import { test as base, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { developerAuthentication } from "../../src/developer-authentication.js";

// ---------------------------------------------------------------------------
// Worker-scoped fixture: one Hono server per test worker
// ---------------------------------------------------------------------------

type WorkerFixtures = {
  appUrl: string;
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const test = base.extend<{}, WorkerFixtures>({
  appUrl: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const app = new Hono();
      app.use("*", developerAuthentication());
      // Catch-all so authenticated requests have somewhere to land.
      app.all("*", (c) => c.text("OK", 200));

      // Resolve the real assigned port via the listeningListener callback.
      let resolveUrl!: (url: string) => void;
      const urlReady = new Promise<string>((resolve) => {
        resolveUrl = resolve;
      });

      const server = serve({ fetch: app.fetch, port: 0 }, (info: AddressInfo) => {
        resolveUrl(`http://localhost:${info.port}`);
      }) as Server;

      const baseUrl = await urlReady;
      await use(baseUrl);

      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    },
    { scope: "worker" }
  ]
});

export { expect };

// ---------------------------------------------------------------------------
// Helper: render axe violations as readable diagnostics on failure
// ---------------------------------------------------------------------------

type AxeViolation = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number];

function formatViolations(violations: AxeViolation[]): string {
  return violations
    .map(
      (v) =>
        `  [${v.impact ?? "unknown"}] ${v.id}: ${v.description}\n`
        + `    nodes: ${v.nodes.map((n) => n.html).join(" | ")}`
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Login page – browser WCAG 2.1 AA validation", () => {
  /**
   * 1. Full axe scan – default (unauthenticated) page.
   *
   * Navigates directly to the login form and runs a full WCAG 2.1 AA axe
   * scan across all three tag sets.
   */
  test("1. full axe WCAG scan – default page", async ({ page, appUrl }) => {
    await page.goto(`${appUrl}/_auth/login?redirect=/`);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();

    if (results.violations.length > 0) {
      console.error("axe violations (default page):\n" + formatViolations(results.violations));
    }

    expect(results.violations).toHaveLength(0);
  });

  /**
   * 2. Full axe scan – error state.
   *
   * Simulates an attacker who has removed the `required` attribute from the
   * email input to bypass client-side validation and submit an empty email.
   * The server returns the login page with an error `role="alert"` banner.
   * The axe scan must pass in this state too.
   */
  test("2. full axe WCAG scan – error state (empty-email submission)", async ({ page, appUrl }) => {
    await page.goto(`${appUrl}/_auth/login?redirect=/`);

    // Remove the required attribute to bypass browser-side validation.
    await page.evaluate(() => {
      document.querySelector("#email")?.removeAttribute("required");
    });

    // Submit the form; wait for the server's HTML response to render.
    await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"]')]);

    // The server renders an error login page with role="alert".
    await expect(page.locator('[role="alert"]')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();

    if (results.violations.length > 0) {
      console.error("axe violations (error state):\n" + formatViolations(results.violations));
    }

    expect(results.violations).toHaveLength(0);
  });

  /**
   * 3. Keyboard navigation – tab order.
   *
   * Verifies there are no focus traps and the tab order matches the visual
   * reading order: email input → submit button → out of form.
   *
   * The email input carries `autofocus`, so it has focus on load — we use
   * that as the known starting point rather than blurring and re-tabbing
   * (headless Chromium does not guarantee Tab from a blurred state reaches
   * the first in-page element before the browser chrome).
   */
  test("3. keyboard navigation – tab order matches visual order", async ({ page, appUrl }) => {
    await page.goto(`${appUrl}/_auth/login?redirect=/`);

    // autofocus fires on load — confirm the starting point.
    await expect(page.locator("#email")).toBeFocused();

    // Tab → submit button (correct visual order, no skip)
    await page.keyboard.press("Tab");
    await expect(page.locator('button[type="submit"]')).toBeFocused();

    // Tab → focus escapes the form (no focus trap)
    await page.keyboard.press("Tab");
    await expect(page.locator('button[type="submit"]')).not.toBeFocused();
  });

  /**
   * 4. Focus indicator – email input.
   *
   * Clicks the email input and verifies that the CSS rule
   * `input[type="email"]:focus { box-shadow: 0 0 0 3px rgba(59,130,246,.15) }`
   * produces a computed box-shadow that is not "none".
   */
  test("4. focus indicator – email input has visible box-shadow when focused", async ({
    page,
    appUrl
  }) => {
    await page.goto(`${appUrl}/_auth/login?redirect=/`);

    await page.click("#email");
    await expect(page.locator("#email")).toBeFocused();

    const boxShadow = await page.evaluate(() => {
      const el = document.querySelector("#email") as HTMLElement | null;
      return el ? window.getComputedStyle(el).boxShadow : null;
    });

    expect(boxShadow).not.toBeNull();
    expect(boxShadow).not.toBe("none");
  });

  /**
   * 5. Focus indicator – submit button.
   *
   * Tabs to the submit button and verifies that the browser's default focus
   * ring has not been suppressed by CSS.  `outline-style: auto` is
   * Chromium's computed value for the native keyboard focus ring; anything
   * other than `"none"` confirms the indicator is visible.
   *
   * Note: axe-core 4.x has no `focus-visible` rule (it is not in the
   * ruleset for wcag2a/wcag2aa/wcag21aa), so computed-style inspection is
   * the reliable cross-browser approach here.
   */
  test("5. focus indicator – submit button outline is not suppressed when focused", async ({
    page,
    appUrl
  }) => {
    await page.goto(`${appUrl}/_auth/login?redirect=/`);

    // autofocus lands on email — confirm it before tabbing so the Tab press
    // doesn't race the autofocus landing; one Tab then reaches the submit button.
    await expect(page.locator("#email")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator('button[type="submit"]')).toBeFocused();

    // The button CSS does not set outline:none / outline:0, so the browser's
    // default focus ring applies.  In Chromium this resolves to "auto".
    const outlineStyle = await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]') as HTMLElement | null;
      return btn ? window.getComputedStyle(btn).outlineStyle : null;
    });

    expect(outlineStyle).not.toBeNull();
    expect(outlineStyle).not.toBe("none");
  });

  /**
   * 6. Colour contrast – full CSS cascade (regression for issue #1).
   *
   * Runs axe with only the `color-contrast` rule to verify that the full
   * computed style cascade (not just inline CSS values) produces no contrast
   * violations.  This is the real-browser complement to the Phase 1 contrast
   * math in `tests/a11y/contrast.test.ts`.
   *
   * If the button background is reverted to #3b82f6 this test will fail.
   */
  test("6. colour contrast – full CSS cascade produces no violations", async ({ page, appUrl }) => {
    await page.goto(`${appUrl}/_auth/login?redirect=/`);

    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();

    if (results.violations.length > 0) {
      console.error("color-contrast violations:\n" + formatViolations(results.violations));
    }

    expect(results.violations).toHaveLength(0);
  });
});
