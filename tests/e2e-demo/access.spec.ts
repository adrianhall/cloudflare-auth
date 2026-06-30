/**
 * End-to-end tests for the Vite + Cloudflare Access plugin, run against a
 * dedicated fixture under `tests/e2e-demo/app/` that installs the library
 * built from CURRENT source (see prepare.mjs). The fixture is intentionally
 * separate from `example-vite/` so the guard does not drift when the demo
 * changes for unrelated cosmetic reasons.
 *
 * Two complementary checks against the REAL stack (Vite dev server +
 * @cloudflare/vite-plugin + workerd):
 *
 *   1. Browser flow — login form → identity rendered by the SPA from
 *      `/api/me` → switch identity → logout.
 *   2. API guard — a direct authenticated request to `/api/me` must
 *      return the identity, proving the plugin's injected `req.rawHeaders`
 *      reach the Worker.
 */

import { test, expect, request } from "@playwright/test";

import { ALICE_SUB } from "./app/shared/policies";

const BASE = "http://localhost:5173";

/**
 * Canonical UUID shape used for default dev subjects (matches the
 * library's `crypto.randomUUID()` output). Identities without a pinned
 * `sub` get a fresh UUID per login, so the exact value cannot be asserted.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // Alice is pinned to a UUID-style sub in app/shared/policies.ts.
    await expect(page.getByTestId("identity-sub")).toHaveText(ALICE_SUB);
  });

  test("switching identity and logging out works", async ({ page }) => {
    // Log in as Bob via a custom email.
    await page.goto("/cdn-cgi/access/login?redirect=%2F");
    await page.locator("#custom-email").fill("bob@example.com");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByTestId("identity-email")).toHaveText("bob@example.com");
    // Bob has no pinned sub, so the SPA renders a fresh random UUID (issue #21).
    await expect(page.getByTestId("identity-sub")).toHaveText(UUID_RE);

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
    // Carol has no pinned sub, so the value is a fresh random UUID.
    const identity = (await me.json()) as { email: string; sub: string };
    expect(identity.email).toBe("carol@example.com");
    expect(identity.sub).toMatch(UUID_RE);

    // Public route stays open.
    const version = await ctx.get("/api/version");
    expect(version.status()).toBe(200);

    await ctx.dispose();
  });
});
