import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { cloudflareAccess, type AuthVariables, type Logger } from "../src/index.js";
import { signDevJwt, JWT_HEADER, COOKIE_NAME, DEFAULT_DEV_SECRET } from "../src/jwt.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = "http://localhost";

/** Silent logger that suppresses all output during tests. */
const silentLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

/** Minimal Env stub with the team domain. */
const MOCK_ENV = {
  CLOUDFLARE_TEAM_DOMAIN: "test.cloudflareaccess.com"
};

/**
 * Create a Hono app with the cloudflareAccess middleware and an echo
 * route that returns the context variables.
 */
function createApp(settings?: Parameters<typeof cloudflareAccess>[0]) {
  const app = new Hono<{ Bindings: typeof MOCK_ENV; Variables: AuthVariables }>();
  app.use(cloudflareAccess({ logger: silentLogger, ...settings }));

  app.get("/api/test", (c) => {
    return c.json({
      email: c.get("userEmail") ?? null,
      sub: c.get("userSub") ?? null
    });
  });

  app.get("/api/version", (c) => c.json({ version: "1.0" }));
  app.get("/public", (c) => c.text("ok"));

  return app;
}

/** Shortcut: fetch a route with env bindings. */
function fetchWithEnv(app: ReturnType<typeof createApp>, url: string, init?: RequestInit) {
  return app.fetch(new Request(url, init), MOCK_ENV);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cloudflareAccess middleware", () => {
  // -----------------------------------------------------------------------
  // Dev token verification
  // -----------------------------------------------------------------------

  describe("dev token verification", () => {
    it("sets context variables from a valid dev JWT in the header", async () => {
      const token = await signDevJwt("alice@example.com", { sub: "alice-uuid" });
      const app = createApp({ enableDevTokens: true });

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: token }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string; sub: string };
      expect(body.email).toBe("alice@example.com");
      // The verbatim sub from the JWT flows through to c.get("userSub").
      expect(body.sub).toBe("alice-uuid");
    });

    it("sets context variables from a valid dev JWT in the cookie", async () => {
      const token = await signDevJwt("bob@example.com");
      const app = createApp({ enableDevTokens: true });

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { Cookie: `${COOKIE_NAME}=${token}` }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string; sub: string };
      expect(body.email).toBe("bob@example.com");
    });

    it("prefers the header over the cookie when both are present", async () => {
      const headerToken = await signDevJwt("header@example.com");
      const cookieToken = await signDevJwt("cookie@example.com");
      const app = createApp({ enableDevTokens: true });

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: {
          [JWT_HEADER]: headerToken,
          Cookie: `${COOKIE_NAME}=${cookieToken}`
        }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string; sub: string };
      expect(body.email).toBe("header@example.com");
    });

    it("works with a custom dev secret", async () => {
      const secret = "my-test-secret";
      const token = await signDevJwt("custom@example.com", { secret });
      const app = createApp({ devSecret: secret, enableDevTokens: true });

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: token }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string; sub: string };
      expect(body.email).toBe("custom@example.com");
    });
  });

  // -----------------------------------------------------------------------
  // Fail-closed dev tokens (issue #14)
  // -----------------------------------------------------------------------

  describe("dev tokens are fail-closed by default", () => {
    it("rejects a DEFAULT_DEV_SECRET-signed token when enableDevTokens is unset (bypass attempt)", async () => {
      // Attacker mints a token with the published public secret and sends
      // it as the Access assertion header.  With the default config the dev
      // path is never tried, so only JWKS runs — and there is no real JWKS
      // for the mock domain → 401.  This is the core bypass-prevention case.
      const forged = await signDevJwt("attacker@evil.example", { secret: DEFAULT_DEV_SECRET });
      const app = createApp();

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: forged }
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Invalid or expired");
    });

    it("rejects a forged token in the cookie when enableDevTokens is unset", async () => {
      const forged = await signDevJwt("attacker@evil.example", { secret: DEFAULT_DEV_SECRET });
      const app = createApp();

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { Cookie: `${COOKIE_NAME}=${forged}` }
      });

      expect(res.status).toBe(401);
    });

    it("does not bypass via dev token even on a defaultAction: bypass path", async () => {
      // bypass only relaxes the *missing-token* case; a presented dev token
      // must still fail verification when dev tokens are disabled, so no
      // user is set.
      const forged = await signDevJwt("attacker@evil.example", { secret: DEFAULT_DEV_SECRET });
      const app = createApp({ defaultAction: "bypass" });

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: forged }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string | null; sub: string | null };
      expect(body.email).toBeNull();
      expect(body.sub).toBeNull();
    });

    it("verifies the same token once enableDevTokens is true", async () => {
      const token = await signDevJwt("dev@example.com", { sub: "dev-uuid" });
      const app = createApp({ enableDevTokens: true });

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: token }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string; sub: string };
      expect(body.email).toBe("dev@example.com");
      expect(body.sub).toBe("dev-uuid");
    });
  });

  // -----------------------------------------------------------------------
  // One-time warning when enabling dev tokens without an explicit secret
  // -----------------------------------------------------------------------

  describe("enableDevTokens warning", () => {
    it("logs a one-time warning when enabled without an explicit devSecret", () => {
      const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

      cloudflareAccess({ enableDevTokens: true, logger });

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(vi.mocked(logger.warn).mock.calls[0][0]).toContain("DEFAULT_DEV_SECRET");
    });

    it("does not warn when an explicit devSecret is provided", () => {
      const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

      cloudflareAccess({ enableDevTokens: true, devSecret: "explicit-secret", logger });

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("does not warn when dev tokens are disabled (default)", () => {
      const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

      cloudflareAccess({ logger });

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Missing / invalid token (default: block)
  // -----------------------------------------------------------------------

  describe("missing or invalid token (defaultAction: block)", () => {
    it("returns 401 when no JWT is provided", async () => {
      const app = createApp();
      const res = await fetchWithEnv(app, `${BASE}/api/test`);

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Authentication required");
    });

    it("returns 401 for a malformed JWT", async () => {
      const app = createApp();
      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: "not.a.jwt" }
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Invalid or expired");
    });

    it("returns 401 for an expired dev token", async () => {
      const token = await signDevJwt("expired@example.com", { lifetime: -1 });
      const app = createApp();

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: token }
      });

      expect(res.status).toBe(401);
    });

    it("returns 401 when dev secret does not match", async () => {
      const token = await signDevJwt("alice@example.com", { secret: "secret-a" });
      const app = createApp({ devSecret: "secret-b", enableDevTokens: true });

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: token }
      });

      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // Policies
  // -----------------------------------------------------------------------

  describe("policies", () => {
    const policies = [
      { pattern: /^\/api\/version$/, authenticate: false },
      { pattern: /^\/public$/, authenticate: false },
      { pattern: /^\/api\//, authenticate: true }
    ];

    it("bypasses auth for paths marked authenticate: false", async () => {
      const app = createApp({ policies });

      const res = await fetchWithEnv(app, `${BASE}/api/version`);
      expect(res.status).toBe(200);
    });

    it("requires auth for paths marked authenticate: true", async () => {
      const app = createApp({ policies });

      const res = await fetchWithEnv(app, `${BASE}/api/test`);
      expect(res.status).toBe(401);
    });

    it("uses first-match-wins ordering", async () => {
      // /api/version matches the first rule (false) before the /api/ catch-all (true).
      const app = createApp({ policies });

      const versionRes = await fetchWithEnv(app, `${BASE}/api/version`);
      expect(versionRes.status).toBe(200);

      const testRes = await fetchWithEnv(app, `${BASE}/api/test`);
      expect(testRes.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // Policies with redirect option (ignored by cloudflareAccess)
  // -----------------------------------------------------------------------

  describe("redirect option on policies (ignored)", () => {
    it("returns 401 for unauthenticated API route regardless of redirect: false", async () => {
      const app = createApp({
        policies: [{ pattern: /^\/api\//, authenticate: true, redirect: false }]
      });

      const res = await fetchWithEnv(app, `${BASE}/api/test`);
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Authentication required");
    });

    it("bypasses auth for public path with redirect: false", async () => {
      const app = createApp({
        policies: [
          { pattern: /^\/public$/, authenticate: false, redirect: false },
          { pattern: /^\/api\//, authenticate: true }
        ]
      });

      const res = await fetchWithEnv(app, `${BASE}/public`);
      expect(res.status).toBe(200);
    });

    it("sets context variables for authenticated request with redirect: false", async () => {
      const token = await signDevJwt("alice@example.com");
      const app = createApp({
        enableDevTokens: true,
        policies: [{ pattern: /^\/api\//, authenticate: true, redirect: false }]
      });

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: token }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string; sub: string };
      expect(body.email).toBe("alice@example.com");
    });
  });

  // -----------------------------------------------------------------------
  // defaultAction: bypass
  // -----------------------------------------------------------------------

  describe("defaultAction: bypass", () => {
    const settings = { defaultAction: "bypass" as const };

    it("allows requests through when no JWT is present", async () => {
      const app = createApp(settings);

      const res = await fetchWithEnv(app, `${BASE}/api/test`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string | null; sub: string | null };
      expect(body.email).toBeNull();
      expect(body.sub).toBeNull();
    });

    it("sets context variables when a valid JWT is present", async () => {
      const token = await signDevJwt("opt@example.com");
      const app = createApp({ ...settings, enableDevTokens: true });

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: token }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string; sub: string };
      expect(body.email).toBe("opt@example.com");
    });

    it("allows through with an invalid JWT (no user set)", async () => {
      const app = createApp(settings);

      const res = await fetchWithEnv(app, `${BASE}/api/test`, {
        headers: { [JWT_HEADER]: "garbage.token.here" }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string | null; sub: string | null };
      expect(body.email).toBeNull();
    });

    it("still blocks when a policy explicitly requires auth", async () => {
      const app = createApp({
        defaultAction: "bypass",
        policies: [{ pattern: /^\/api\/test$/, authenticate: true }]
      });

      const res = await fetchWithEnv(app, `${BASE}/api/test`);
      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // Team domain configuration
  // -----------------------------------------------------------------------

  describe("team domain", () => {
    it("returns 401 when team domain is missing and token is not dev-signed", async () => {
      const token = await signDevJwt("alice@example.com", { secret: "unknown-secret" });
      const app = createApp({ devSecret: "other-secret", enableDevTokens: true });

      // Pass an empty env with no CLOUDFLARE_TEAM_DOMAIN.
      const res = await app.fetch(
        new Request(`${BASE}/api/test`, {
          headers: { [JWT_HEADER]: token }
        }),
        {} // no team domain in env
      );

      // Token fails dev verification, then JWKS fails because no domain.
      expect(res.status).toBe(401);
    });
  });
});
