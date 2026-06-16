/**
 * End-to-end tests for the Vite + Cloudflare Access demo.
 *
 * Two complementary checks against the REAL stack (Vite dev server +
 * @cloudflare/vite-plugin + workerd):
 *
 *   1. Browser flow — login form → identity rendered by the SPA from
 *      `/api/me` → switch identity → logout.
 *   2. API guard — a direct authenticated request to `/api/me` must
 *      return the identity, proving the plugin's injected
 *      `req.rawHeaders` reach the Worker (the make-or-break detail from
 *      the #10 spike).
 */

import { test, expect, request } from "@playwright/test";

const BASE = "http://localhost:5173";

test.describe("Vite Cloudflare Access demo", () => {
  test("unauthenticated navigation is redirected to the dev login form", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/cdn-cgi\/access\/login/);
    await expect(page.getByRole("heading", { name: "Developer Login" })).toBeVisible();
  });

  test("logging in renders the selected identity from /api/me", async ({ page }) => {
    await page.goto("/cdn-cgi/access/login?redirect=%2F");

    // Select Alice (first radio is pre-checked) and submit.
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: "Sign in" }).click();

    // Back on the SPA, identity is fetched from /api/me.
    await expect(page).toHaveURL(`${BASE}/`);
    await expect(page.getByTestId("identity-email")).toHaveText("alice@example.com");
    await expect(page.getByTestId("identity-sub")).toHaveText("dev-alice@example.com");
  });

  test("switching identity and logging out works", async ({ page }) => {
    // Log in as Bob via a custom email.
    await page.goto("/cdn-cgi/access/login?redirect=%2F");
    await page.locator("#custom-email").fill("bob@example.com");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByTestId("identity-email")).toHaveText("bob@example.com");

    // Log out → next navigation is gated again.
    await page.getByRole("link", { name: "Log out" }).click();
    await page.goto("/");
    await expect(page).toHaveURL(/\/cdn-cgi\/access\/login/);
  });

  test("API guard: authenticated /api/me reaches the Worker (rawHeaders forwarded)", async () => {
    const ctx = await request.newContext({ baseURL: BASE });

    // Establish a session via the dev login endpoint (sets the cookie in
    // this request context's jar).
    const login = await ctx.post("/cdn-cgi/access/login", {
      form: { email: "carol@example.com", redirect: "/" },
      maxRedirects: 0
    });
    expect(login.status()).toBe(302);

    // The injected cf-access-jwt-assertion header must reach the Worker.
    const me = await ctx.get("/api/me");
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({
      email: "carol@example.com",
      sub: "dev-carol@example.com"
    });

    // Public route stays open.
    const version = await ctx.get("/api/version");
    expect(version.status()).toBe(200);

    await ctx.dispose();
  });
});
