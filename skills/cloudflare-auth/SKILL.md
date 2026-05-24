---
name: cloudflare-auth
description: Use @adrianhall/cloudflare-auth when building a Hono-based Cloudflare Worker that is fronted by Cloudflare Access. Provides developerAuthentication middleware for frictionless local development and cloudflareAccess middleware for production JWT validation — both work identically so handlers are environment-agnostic.
---

## When to Load This Skill

Load this skill whenever a developer is:

- Building a Hono Worker that will be deployed behind Cloudflare Access
- Asking how to do local development against a Cloudflare Access-protected API
- Serving protected static assets (frontend) through a Worker (not via wrangler's asset serving alone)
- Setting up path-based auth policies (some routes public, some protected)
- Asking why `CF_Authorization` cookie is not being set before API calls
- Configuring `wrangler.jsonc` for a Worker that handles both auth and static assets

---

## The Core Problem This Library Solves

In production, Cloudflare Access injects signed JWT headers and the `CF_Authorization` cookie into every request before they reach your Worker. During local development, those headers are absent — there is no Cloudflare Access in the loop.

Without this library, developers either skip auth entirely in dev (risky) or run complex local proxies.

**This library solves it with two middleware functions that always agree on the authenticated user:**

| Middleware                | Production                               | Local dev                                                              |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| `developerAuthentication` | **No-op** (JWT header already present)   | Drives a one-time-PIN–style login form, sets `CF_Authorization` cookie |
| `cloudflareAccess`        | Validates JWT via Cloudflare Access JWKS | Validates the same dev-signed JWT via HMAC                             |

---

## Installation

This package is **not published to npm**. Install directly from GitHub (`dist/` is committed):

```bash
npm install github:adrianhall/cloudflare-auth#1.0.0 hono
# or
yarn add github:adrianhall/cloudflare-auth#1.0.0 hono
```

Peer dependency: `hono ^4.0.0`
Runtime dependency: `jose ^6.2.3` (bundled)

---

## Critical Setup Rules

### 1. Middleware Order Is Non-Negotiable

`developerAuthentication` **must always be registered before** `cloudflareAccess`. In production `developerAuthentication` is a no-op, but in dev it injects the headers that `cloudflareAccess` then reads.

```ts
// CORRECT
app.use(developerAuthentication({ policies }));
app.use(cloudflareAccess({ policies }));

// WRONG — cloudflareAccess will 401 every dev request
app.use(cloudflareAccess({ policies }));
app.use(developerAuthentication({ policies }));
```

### 2. Share the Same Policies Array

Define `PathPolicy[]` **once** and pass the identical array to **both** middleware. If the arrays differ, you will get inconsistent behavior where one middleware allows a path the other blocks.

```ts
const authPolicies: PathPolicy[] = [
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\//, authenticate: true }
];

app.use(developerAuthentication({ policies: authPolicies }));
app.use(cloudflareAccess({ policies: authPolicies }));
```

### 3. Never Add `/_auth/*` to `authPolicies`

`developerAuthentication` owns `/_auth/login` and `/_auth/callback` internally. These internal routes are handled **after** the policy check in the middleware's evaluation order. If `/_auth/*` appears in `authPolicies` with `authenticate: false`, the policy check fires first, calls `next()`, and the internal login-form handler is never reached — the browser gets a 404.

```ts
// WRONG — policy fires before the internal login form handler; login returns 404
const authPolicies: PathPolicy[] = [
  { pattern: /^\/_auth\//, authenticate: false }, // ← never do this
  { pattern: /^\/api\//, authenticate: true }
];

// CORRECT — omit /_auth/* entirely; developerAuthentication handles it automatically
const authPolicies: PathPolicy[] = [{ pattern: /^\/api\//, authenticate: true }];
```

This also means you should **not** add `/_auth/*` to `run_worker_first` in a way that conflicts — the middleware chain must reach `developerAuthentication` for login routes to work.

### 4. Serve Static Assets Inside the Hono App — Not via Wrangler Alone

**This is the most commonly missed setup decision.**

If your frontend needs the `CF_Authorization` cookie to exist before it makes API calls, you **must** serve static assets as a final catch-all route inside the Hono app — not via wrangler's `run_worker_first` pattern.

Why: With `run_worker_first`, wrangler serves matching asset paths directly from the CDN, **bypassing the Worker** (and therefore bypassing `developerAuthentication`). The cookie is never set for those asset requests, so the browser doesn't have it when the first API call fires.

**Wrong (assets bypass auth middleware):**

```jsonc
// wrangler.jsonc — assets served directly, Worker only for /api/* and /_auth/*
{
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/_auth/*"]
  }
}
```

**Correct (all requests flow through the Worker):**

```jsonc
// wrangler.jsonc — add "binding": "ASSETS" so the Worker can fetch assets
{
  "assets": {
    "directory": "./public",
    "binding": "ASSETS"
  }
}
```

```ts
// index.ts — use the ASSETS Fetcher binding directly (generated by `wrangler types`)
app.use(developerAuthentication({ policies: authPolicies }));
app.use(cloudflareAccess({ policies: authPolicies }));

app.get("/api/me", (c) => c.json({ email: c.get("userEmail") }));

// Final catch-all: proxy to the Worker Assets binding
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));
```

> **Do not use `serveStatic` from `hono/cloudflare-workers` here.** That adapter reads
> `c.env.__STATIC_CONTENT` — the KV namespace used by the legacy Workers Sites system.
> With the current `assets.binding` wrangler config, `__STATIC_CONTENT` is `undefined`
> and every asset request returns 404. Use `c.env.ASSETS.fetch(c.req.raw)` instead.

With this pattern every request — including asset fetches — runs through `developerAuthentication`, which ensures the `CF_Authorization` cookie is set before any JavaScript in the page makes API calls.

---

## Minimal Working Example

```ts
import { Hono } from "hono";
import {
  developerAuthentication,
  cloudflareAccess,
  type AuthVariables,
  type PathPolicy
} from "@adrianhall/cloudflare-auth";

// Generate wrangler types with: npx wrangler types
// (run after adding "binding": "ASSETS" to wrangler.jsonc)
type Env = {
  Bindings: {
    CLOUDFLARE_TEAM_DOMAIN: string;
    ASSETS: Fetcher; // Worker Assets binding — requires "binding": "ASSETS" in wrangler.jsonc
  };
  Variables: AuthVariables;
};

const app = new Hono<Env>();

const authPolicies: PathPolicy[] = [
  { pattern: /^\/api\/version$/, authenticate: false }, // public
  { pattern: /^\/api\//, authenticate: true } // protected
  // ⚠ Never add /_auth/* here — developerAuthentication owns those paths internally
];

// Order matters: developerAuthentication FIRST
app.use(developerAuthentication({ policies: authPolicies }));
app.use(cloudflareAccess({ policies: authPolicies }));

app.get("/api/me", (c) => {
  return c.json({ email: c.get("userEmail"), sub: c.get("userSub") });
});

app.get("/api/version", (c) => c.json({ version: "1.0.0" }));

// Final catch-all: proxy to Worker Assets binding (do NOT use serveStatic here)
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
```

---

## TypeScript Types

### `AuthVariables` — Hono context variables

```ts
type AuthVariables = {
  userEmail: string; // JWT "email" claim
  userSub: string; // JWT "sub" claim (unique identifier)
};
```

Wire into Hono's generic so `c.get("userEmail")` is fully typed:

```ts
const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
```

### `PathPolicy`

```ts
interface PathPolicy {
  pattern: RegExp; // tested against request pathname
  authenticate: boolean; // true = require auth, false = public bypass
}
```

Policies are evaluated in **first-match-wins** order.

### `DeveloperAuthSettings`

| Property        | Type           | Default                              | Description                      |
| --------------- | -------------- | ------------------------------------ | -------------------------------- |
| `policies`      | `PathPolicy[]` | `undefined` (all paths require auth) | Path matching rules              |
| `loginPath`     | `string`       | `"/_auth/login"`                     | Login form route                 |
| `callbackPath`  | `string`       | `"/_auth/callback"`                  | Callback route                   |
| `devSecret`     | `string`       | Built-in dev key                     | HMAC secret for signing dev JWTs |
| `tokenLifetime` | `number`       | `86400` (24 h)                       | JWT lifetime in seconds          |
| `logger`        | `Logger`       | Console logger                       | Custom logger instance           |

### `CloudflareAccessSettings`

| Property        | Type                  | Default                        | Description                        |
| --------------- | --------------------- | ------------------------------ | ---------------------------------- |
| `policies`      | `PathPolicy[]`        | `undefined`                    | Path matching rules                |
| `defaultAction` | `"block" \| "bypass"` | `"block"`                      | Behavior when no policy matches    |
| `teamDomain`    | `string`              | `c.env.CLOUDFLARE_TEAM_DOMAIN` | Cloudflare Access team domain      |
| `audience`      | `string`              | `undefined` (skip check)       | Expected `aud` claim value         |
| `devSecret`     | `string`              | Built-in dev key               | HMAC secret for verifying dev JWTs |
| `logger`        | `Logger`              | Console logger                 | Custom logger instance             |

---

## `defaultAction` for `cloudflareAccess`

Controls what happens when a request path matches **no policy**:

- **`"block"` (default)** — treat as protected; return `401` if no valid JWT.
- **`"bypass"`** — allow through. If a valid JWT is present, context vars are still set; otherwise the request proceeds with no authenticated user. Handlers can check `c.get("userEmail")` to detect the unauthenticated case.

---

## Environment Variables

| Variable                 | Required         | Description                                                                                                        |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_TEAM_DOMAIN` | Yes (production) | Your Cloudflare Access team domain, e.g. `myteam.cloudflareaccess.com`. Used to fetch the JWKS for JWT validation. |

Set via wrangler config:

```jsonc
{
  "vars": {
    "CLOUDFLARE_TEAM_DOMAIN": "myteam.cloudflareaccess.com"
  }
}
```

---

## How Each Middleware Handles Requests

### `developerAuthentication` request flow

```
Incoming request
  │
  ├── cf-access-jwt-assertion header present? → no-op, next()    ← production path
  ├── Policy matches authenticate:false?      → next()            ← ⚠ /_auth/* here = 404 on login form
  ├── GET /_auth/login                        → render login form ← never reached if /_auth/* is in policies
  ├── POST /_auth/callback                    → sign dev JWT, set CF_Authorization cookie, redirect
  ├── CF_Authorization cookie valid?          → inject CF headers, next()
  ├── CF_Authorization cookie invalid/expired → clear cookie, redirect to login
  └── No auth at all                          → redirect to /_auth/login?redirect=<pathname>
```

### `cloudflareAccess` JWT verification order

1. Try HMAC verification with the dev secret (fast, no network)
2. If that fails, verify against the Cloudflare Access JWKS endpoint

| Policy match                        | JWT valid? | Result                              |
| ----------------------------------- | ---------- | ----------------------------------- |
| `authenticate: false`               | any        | Bypass                              |
| `authenticate: true`                | yes        | Set `userEmail`/`userSub`, `next()` |
| `authenticate: true`                | no/missing | `401`                               |
| No match, `defaultAction: "block"`  | yes        | Set context vars, `next()`          |
| No match, `defaultAction: "block"`  | no/missing | `401`                               |
| No match, `defaultAction: "bypass"` | yes        | Set context vars, `next()`          |
| No match, `defaultAction: "bypass"` | no/missing | `next()` (no user set)              |

---

## Cookie & Header Reference

| Name                                 | Type   | Description                                                                                                             |
| ------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `CF_Authorization`                   | Cookie | JWT; `HttpOnly`, `Secure`, `SameSite=Lax`. Set by Cloudflare Access in production, by `developerAuthentication` in dev. |
| `Cf-Access-Jwt-Assertion`            | Header | Same JWT. Read by `cloudflareAccess`.                                                                                   |
| `Cf-Access-Authenticated-User-Email` | Header | User email. Injected by both Cloudflare Access and `developerAuthentication`.                                           |
| `Cf-Access-User`                     | Header | Unique user identifier (sub).                                                                                           |

---

## Wrangler Configuration

### When serving static assets inside the Hono app (recommended for full auth coverage)

Remove `run_worker_first` — all requests route to the Worker. Add `"binding": "ASSETS"` so the Worker can serve assets via `c.env.ASSETS.fetch(c.req.raw)`. Run `wrangler types` after adding the binding to regenerate the `Env` type that includes `ASSETS: Fetcher`.

```jsonc
{
  "name": "my-worker",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  "vars": {
    "CLOUDFLARE_TEAM_DOMAIN": "myteam.cloudflareaccess.com"
  },
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  }
}
```

### When only the API needs auth (static assets are truly public)

This is appropriate only if your frontend does **not** need `CF_Authorization` to be pre-set:

```jsonc
{
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/_auth/*"]
  }
}
```

---

## Testing

### Why `signDevJwt()` is the right tool for integration and E2E tests

The login form flow (`GET /_auth/login` → `POST /_auth/callback`) is the right flow to test _once_ to verify the login UI works. It is the **wrong** tool for testing your API handlers under different auth configurations, because:

- It adds multi-step ceremony to every test case
- It can only represent one user identity per flow execution
- It tests infrastructure, not your business logic

`signDevJwt()` lets you mint a valid JWT for any identity in a single `await`. `cloudflareAccess` accepts it identically to a cookie-issued token. You can test admin users, regular users, unauthenticated paths, and expired tokens all in the same test file without any browser or form interaction.

### `signDevJwt()` signature

```ts
signDevJwt(
  email: string,
  options?: {
    secret?: string;   // default: DEFAULT_DEV_SECRET
    lifetime?: number; // default: 86400 (24 h), in seconds
  }
): Promise<string>
```

**Derived claims** — these are set automatically and cannot be overridden:

| Claim  | Value                  |
| ------ | ---------------------- |
| `sub`  | `"dev-" + email`       |
| `iss`  | `"dev-authentication"` |
| `type` | `"dev"`                |

So for `signDevJwt("alice@example.com")`, `c.get("userSub")` in your handler will be `"dev-alice@example.com"`.

### Injecting the token

Pass the signed token as the `Cf-Access-Jwt-Assertion` header. `developerAuthentication` treats this as the production path (no-op) and `cloudflareAccess` validates it via HMAC — no network call, no login redirect.

```ts
const token = await signDevJwt("alice@example.com");

const res = await app.fetch(
  new Request("http://localhost/api/me", {
    headers: { "cf-access-jwt-assertion": token }
  }),
  env
);
```

Use the exported `JWT_HEADER` constant instead of a raw string to stay in sync with the library:

```ts
import { signDevJwt, JWT_HEADER } from "@adrianhall/cloudflare-auth";

const res = await app.fetch(
  new Request("http://localhost/api/me", {
    headers: { [JWT_HEADER]: token }
  }),
  env
);
```

### Vitest integration test example

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  developerAuthentication,
  cloudflareAccess,
  signDevJwt,
  JWT_HEADER,
  type AuthVariables,
  type PathPolicy
} from "@adrianhall/cloudflare-auth";

const MOCK_ENV = { CLOUDFLARE_TEAM_DOMAIN: "test.cloudflareaccess.com" };

const authPolicies: PathPolicy[] = [
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\//, authenticate: true }
];

function createApp() {
  const app = new Hono<{ Bindings: typeof MOCK_ENV; Variables: AuthVariables }>();
  app.use(developerAuthentication({ policies: authPolicies }));
  app.use(cloudflareAccess({ policies: authPolicies }));
  app.get("/api/me", (c) => c.json({ email: c.get("userEmail"), sub: c.get("userSub") }));
  app.get("/api/version", (c) => c.json({ version: "1.0" }));
  return app;
}

describe("API auth", () => {
  it("returns 401 on a protected route with no token", async () => {
    const app = createApp();
    // No JWT_HEADER → developerAuthentication redirects to login
    const res = await app.fetch(new Request("http://localhost/api/me"), MOCK_ENV);
    expect(res.status).toBe(302);
  });

  it("returns the authenticated user for a valid token", async () => {
    const app = createApp();
    const token = await signDevJwt("alice@example.com");

    const res = await app.fetch(
      new Request("http://localhost/api/me", {
        headers: { [JWT_HEADER]: token }
      }),
      MOCK_ENV
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; sub: string };
    expect(body.email).toBe("alice@example.com");
    expect(body.sub).toBe("dev-alice@example.com");
  });

  it("allows anonymous access to a public route", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost/api/version"), MOCK_ENV);
    expect(res.status).toBe(200);
  });

  it("rejects an expired token", async () => {
    const app = createApp();
    // lifetime: 0 produces a token that is expired the moment it is signed
    const token = await signDevJwt("alice@example.com", { lifetime: 0 });

    const res = await app.fetch(
      new Request("http://localhost/api/me", {
        headers: { [JWT_HEADER]: token }
      }),
      MOCK_ENV
    );

    expect(res.status).toBe(302); // redirected back to login
  });

  it("can test different roles or identities in the same suite", async () => {
    const app = createApp();

    for (const email of ["admin@example.com", "viewer@example.com", "guest@example.com"]) {
      const token = await signDevJwt(email);
      const res = await app.fetch(
        new Request("http://localhost/api/me", { headers: { [JWT_HEADER]: token } }),
        MOCK_ENV
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { email: string };
      expect(body.email).toBe(email);
    }
  });
});
```

### Playwright E2E test example

For browser-level tests, inject the token as an extra HTTP header on the Playwright request context. Every request the page makes — including `fetch()` calls from your frontend JavaScript — will carry the header, so the Worker sees an authenticated user from the very first request.

```ts
import { test, expect } from "@playwright/test";
import { signDevJwt, JWT_HEADER } from "@adrianhall/cloudflare-auth";

test("authenticated dashboard loads", async ({ browser }) => {
  const token = await signDevJwt("alice@example.com");

  // Create an isolated browser context that sends the JWT on every request.
  const context = await browser.newContext({
    extraHTTPHeaders: { [JWT_HEADER]: token }
  });

  const page = await context.newPage();
  await page.goto("http://localhost:8787/dashboard");

  await expect(page.getByText("alice@example.com")).toBeVisible();
  await context.close();
});

test("admin sees controls that viewer does not", async ({ browser }) => {
  const adminToken = await signDevJwt("admin@example.com");
  const viewerToken = await signDevJwt("viewer@example.com");

  // Admin view
  const adminContext = await browser.newContext({
    extraHTTPHeaders: { [JWT_HEADER]: adminToken }
  });
  const adminPage = await adminContext.newPage();
  await adminPage.goto("http://localhost:8787/dashboard");
  await expect(adminPage.getByRole("button", { name: "Delete" })).toBeVisible();
  await adminContext.close();

  // Viewer view — same test, different identity, no login flow
  const viewerContext = await browser.newContext({
    extraHTTPHeaders: { [JWT_HEADER]: viewerToken }
  });
  const viewerPage = await viewerContext.newPage();
  await viewerPage.goto("http://localhost:8787/dashboard");
  await expect(viewerPage.getByRole("button", { name: "Delete" })).not.toBeVisible();
  await viewerContext.close();
});
```

### Custom secret for test isolation (optional)

By default, `signDevJwt` and `cloudflareAccess` both use `DEFAULT_DEV_SECRET`. This is fine for local development but means a token signed in one test suite is accepted by another app using the default secret.

To isolate test suites, pass a custom `devSecret` consistently to both:

```ts
const TEST_SECRET = "my-test-suite-secret";

const token = await signDevJwt("alice@example.com", { secret: TEST_SECRET });

app.use(cloudflareAccess({ policies, devSecret: TEST_SECRET }));
```

---

## Anti-Patterns

| Anti-pattern                                                                        | Problem                                                                                                                                                        | Fix                                                                                                                               |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `cloudflareAccess` registered before `developerAuthentication`                      | In dev, `cloudflareAccess` sees no JWT and returns `401` before `developerAuthentication` can inject headers                                                   | Always register `developerAuthentication` first                                                                                   |
| Different `policies` arrays for each middleware                                     | Auth behavior is inconsistent between them                                                                                                                     | Define one `PathPolicy[]` and pass it to both                                                                                     |
| Adding `{ pattern: /^\/_auth\//, authenticate: false }` to `authPolicies`           | Policy check fires before internal login-form handling; `next()` is called and the login form is never served — browser gets 404                               | Do not add `/_auth/*` to policies. `developerAuthentication` owns those paths and requires no policy entry.                       |
| Using `serveStatic` from `hono/cloudflare-workers` with the `assets.binding` system | `serveStatic` reads `c.env.__STATIC_CONTENT` (legacy Workers Sites KV). With the `assets.binding` system this is `undefined`, so all asset requests return 404 | Use `app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw))` and add `"binding": "ASSETS"` to the `assets` config in `wrangler.jsonc` |
| Using `run_worker_first` when frontend needs `CF_Authorization` before API calls    | Assets are served from CDN before the cookie is ever set                                                                                                       | Serve static assets as a Hono catch-all route so all requests flow through the middleware chain                                   |
| Not setting `CLOUDFLARE_TEAM_DOMAIN` in production                                  | `cloudflareAccess` cannot fetch the JWKS; all real Access JWTs fail verification                                                                               | Set the var in `wrangler.jsonc` or via a secret                                                                                   |
| Not adding `AuthVariables` to the Hono generic                                      | `c.get("userEmail")` returns `unknown`                                                                                                                         | `new Hono<{ Bindings: Env; Variables: AuthVariables }>()`                                                                         |
| Checking for the authenticated user in a handler on a `authenticate: false` path    | `c.get("userEmail")` will be `undefined` on public paths                                                                                                       | Only access context vars on protected routes                                                                                      |

---

## Exported Low-Level Utilities

Available for testing, custom middleware, or advanced flows:

```ts
import {
  matchPolicy, // Evaluate a pathname against a PathPolicy[]
  signDevJwt, // Sign a dev JWT (email, options)
  verifyDevJwt, // Verify a dev JWT; returns VerifiedToken | null
  verifyAccessJwt, // Verify against CF Access JWKS; returns VerifiedToken | null
  parseCookie, // Extract CF_Authorization value from a Cookie header string
  buildCookieHeader, // Build a Set-Cookie header value for a JWT
  clearCookieHeader, // Build a Set-Cookie header that clears the cookie
  DEFAULT_DEV_SECRET, // Well-known dev HMAC key (never use in production)
  COOKIE_NAME, // "CF_Authorization"
  JWT_HEADER, // "cf-access-jwt-assertion"
  EMAIL_HEADER, // "cf-access-authenticated-user-email"
  USER_HEADER // "cf-access-user"
} from "@adrianhall/cloudflare-auth";
```
