# @adrianhall/cloudflare-auth

Hono middleware for authenticating requests behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) — with built-in local development support.

## Problem

When your application is deployed behind Cloudflare Access, every request arrives with signed JWT headers and cookies. During local development, however, Cloudflare Access is not involved and those headers are absent.

This library provides two middleware functions that work together so your Hono handlers always have access to the authenticated user, regardless of the environment.

## Installation

This package is installed directly from GitHub and is not published to npmjs. It expects your application to provide [`hono`](https://hono.dev/) as a peer dependency.

```bash
npm install github:adrianhall/cloudflare-auth#1.3.0 hono
# or
pnpm add github:adrianhall/cloudflare-auth#1.3.0 hono
```

## AI Skill

You can install an AI Agents Skill using the `npx skills add` command:

```bash
npx skills add adrianhall/cloudflare-auth
```

Load this skill whenever you are working with this library as it contains critical information to help your LLM to properly integrate the library.

## Quick Start

```ts
import { Hono } from "hono";
import {
  developerAuthentication,
  cloudflareAccess,
  type AuthVariables,
  type PathPolicy
} from "@adrianhall/cloudflare-auth";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Optional: Define path policies once, share between both middleware.
const authPolicies: PathPolicy[] = [
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\//, authenticate: true }
];

// 1. Developer middleware runs first.  In production it detects existing
//    Cloudflare Access headers and does nothing.  In local dev it drives
//    an interactive login flow and injects the same headers.
app.use(developerAuthentication({ policies: authPolicies }));

// 2. Cloudflare Access middleware validates the JWT and populates context
//    variables.  Uses the same policies so public endpoints are not blocked.
//    `enableDevTokens` opts in to HS256 dev-token verification and is
//    fail-closed by default — gate it on a dev-only signal so production
//    verifies real Access tokens via JWKS only.
app.use(cloudflareAccess({ policies: authPolicies, enableDevTokens: import.meta.env.DEV }));

// 3. Handlers can now read the authenticated user.
app.get("/api/me", (c) => {
  return c.json({
    email: c.get("userEmail"),
    sub: c.get("userSub")
  });
});

// 4. Handlers that are defined as non-authenticated still work
app.get("/api/version", (c) => {
  return c.json({
    version: "1.0.0",
    health: "ok"
  });
});

export default app;
```

## Middleware Reference

### `developerAuthentication(settings?)`

Simulates Cloudflare Access one-time-PIN authentication for local development.

**Behaviour per request:**

| Condition                                | Action                                                         |
| ---------------------------------------- | -------------------------------------------------------------- |
| `Cf-Access-Jwt-Assertion` header present | No-op (production)                                             |
| Path matches a **public** policy         | Pass through                                                   |
| `GET /_auth/login`                       | Serve HTML login form                                          |
| `POST /_auth/callback`                   | Validate email, sign JWT, set cookie, redirect                 |
| `CF_Authorization` cookie present        | Decode JWT, inject CF Access headers, continue                 |
| None of the above (`redirect: true`)     | 302 redirect to login form _(default, page routes)_            |
| None of the above (`redirect: false`)    | 401 JSON `{ error: "Authentication required" }` _(API routes)_ |

**Settings — `DeveloperAuthSettings`**

| Property        | Type           | Default                              | Description                           |
| --------------- | -------------- | ------------------------------------ | ------------------------------------- |
| `policies`      | `PathPolicy[]` | `undefined` (all paths require auth) | Path matching rules; first match wins |
| `loginPath`     | `string`       | `"/_auth/login"`                     | Login form route                      |
| `callbackPath`  | `string`       | `"/_auth/callback"`                  | Login callback route                  |
| `devSecret`     | `string`       | Built-in dev key                     | HMAC secret for signing dev JWTs      |
| `tokenLifetime` | `number`       | `86400` (24 h)                       | JWT lifetime in seconds               |

### `cloudflareAccess(settings?)`

Validates the JWT from either Cloudflare Access or the developer middleware and sets Hono context variables.

**Behaviour per request:**

| Policy match                        | JWT present & valid | JWT missing / invalid | Action                     |
| ----------------------------------- | ------------------- | --------------------- | -------------------------- |
| `authenticate: false`               | -                   | -                     | Bypass (no JWT check)      |
| `authenticate: true`                | Yes                 | -                     | Set context vars, continue |
| `authenticate: true`                | -                   | Yes                   | **401**                    |
| No match, `defaultAction: "block"`  | Yes                 | -                     | Set context vars, continue |
| No match, `defaultAction: "block"`  | -                   | Yes                   | **401**                    |
| No match, `defaultAction: "bypass"` | Yes                 | -                     | Set context vars, continue |
| No match, `defaultAction: "bypass"` | -                   | Yes                   | Continue (no user set)     |

**Verification order** (when JWT validation is performed):

1. **Opt-in** — when `enableDevTokens` is `true`, try HMAC verification with
   the dev secret (fast, in-process).
2. Verify against the Cloudflare Access JWKS endpoint.

> **🔒 Dev tokens are fail-closed.** `enableDevTokens` defaults to `false`, so
> a deployed Worker verifies **only** via JWKS and rejects any HS256
> developer token — including one signed with the public, well-known dev
> secret. Enable it **only** in local development, gated on a build-time
> signal that is statically `false` in production:
>
> ```ts
> app.use(cloudflareAccess({ policies, enableDevTokens: import.meta.env.DEV }));
> ```
>
> **Migration:** earlier versions verified dev tokens unconditionally. If you
> relied on that in local dev (the `developerAuthentication` flow or the Vite
> plugin), add `enableDevTokens: import.meta.env.DEV` to `cloudflareAccess()`.
> No change is needed in production.

**Settings — `CloudflareAccessSettings`**

| Property          | Type                  | Default                        | Description                                                               |
| ----------------- | --------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `policies`        | `PathPolicy[]`        | `undefined`                    | Path matching rules (same array as `developerAuthentication`)             |
| `defaultAction`   | `"block" \| "bypass"` | `"block"`                      | What to do when no policy matches (see table above)                       |
| `teamDomain`      | `string`              | `c.env.CLOUDFLARE_TEAM_DOMAIN` | Cloudflare Access team domain                                             |
| `audience`        | `string`              | `undefined` (skip aud check)   | Application Audience Tag for `aud` claim validation                       |
| `enableDevTokens` | `boolean`             | `false`                        | Opt in to HS256 dev-token verification. Gate on `import.meta.env.DEV`.    |
| `devSecret`       | `string`              | Built-in dev key               | HMAC secret for verifying dev JWTs. **Ignored unless `enableDevTokens`.** |

## Path Policies

Use `policies` to control which paths require authentication. Define
the array **once** and pass it to **both** middleware so they agree on
which paths are public vs. protected.

Policies are evaluated in order — **first match wins**.

- `developerAuthentication` — when no policy matches, the default is to
  require authentication (secure by default).
- `cloudflareAccess` — when no policy matches, the behaviour is
  controlled by `defaultAction` (`"block"` by default).

```ts
import type { PathPolicy } from "@adrianhall/cloudflare-auth";

const authPolicies: PathPolicy[] = [
  // Public endpoints
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\/health$/, authenticate: false },

  // API routes: require auth, return 401 when unauthenticated (not redirect)
  { pattern: /^\/api\//, authenticate: true, redirect: false },

  // Page routes: require auth, redirect to login form (default)
  { pattern: /^\/dashboard/, authenticate: true }
];

app.use(developerAuthentication({ policies: authPolicies }));
app.use(cloudflareAccess({ policies: authPolicies }));
```

**`PathPolicy` type:**

```ts
interface PathPolicy {
  pattern: RegExp; // Tested against the request pathname
  authenticate: boolean; // true = require auth, false = public
  redirect?: boolean; // true (default) = 302 to login, false = 401 JSON
}
```

The `redirect` property controls how `developerAuthentication` responds
to unauthenticated requests. When `redirect` is `false`, the middleware
returns `401 JSON` instead of redirecting to the login form -- this is
appropriate for API routes where the client expects a JSON error, and
aligns local development behaviour with production (`cloudflareAccess`
always returns 401). `cloudflareAccess` ignores this property.

### `defaultAction`

Controls what `cloudflareAccess` does when no policy matches a request path:

- **`"block"`** _(default)_ — treat the path as protected; return 401
  if no valid JWT is present.
- **`"bypass"`** — allow the request through. If a valid JWT _is_
  present the context variables are still set; otherwise the request
  continues with no authenticated user (handlers can check by testing
  whether `c.get("userEmail")` is set).

## How It Works

### Production (behind Cloudflare Access)

```text
Request ──► developerAuthentication
            │  Cf-Access-Jwt-Assertion header present?
            │  YES → no-op, call next()
            ▼
            cloudflareAccess
            │  Read JWT from header / cookie
            │  Verify against CF Access JWKS
            │  Set userEmail + userSub on context
            ▼
            Your handler
```

### Local Development (page routes — `redirect: true`, the default)

```text
First request (no cookie):

Request ──► developerAuthentication
            │  No CF headers, no cookie
            │  302 Redirect → /_auth/login?redirect=/dashboard
            ▼
GET /_auth/login
            │  Serve HTML login form
            ▼
POST /_auth/callback  (email=dev@example.com)
            │  Generate dev JWT, set CF_Authorization cookie
            │  302 Redirect → /dashboard
            ▼
Subsequent requests (cookie present):

Request ──► developerAuthentication
            │  Read CF_Authorization cookie
            │  Inject Cf-Access-* headers
            ▼
            cloudflareAccess
            │  Read JWT from injected header
            │  Verify with dev secret (HMAC) — requires enableDevTokens
            │  Set userEmail + userSub on context
            ▼
            Your handler
```

> In dev, `cloudflareAccess` only verifies the HS256 token when
> `enableDevTokens` is `true` (e.g. `enableDevTokens: import.meta.env.DEV`).
> Without it the dev token is rejected and the request 401s.

### Local Development (API routes — `redirect: false`)

```text
Request ──► developerAuthentication
            │  No CF headers, no cookie
            │  Policy has redirect: false
            │  401 JSON { error: "Authentication required" }
```

This matches production behaviour where `cloudflareAccess` returns 401
for API routes, so API clients see the same response in both
environments.

## Hono Type Integration

The library exports an `AuthVariables` type that extends your Hono generic so that `c.get("userEmail")` and `c.get("userSub")` are fully typed:

```ts
import type { AuthVariables } from "@adrianhall/cloudflare-auth";

// Wire into Hono
const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Handlers get full type safety
app.get("/api/profile", (c) => {
  const email: string = c.get("userEmail");
  const sub: string = c.get("userSub");
  return c.json({ email, sub });
});
```

**`AuthVariables` shape:**

| Variable    | Type     | Description                                    |
| ----------- | -------- | ---------------------------------------------- |
| `userEmail` | `string` | Authenticated user's email (JWT `email` claim) |
| `userSub`   | `string` | Unique user identifier (JWT `sub` claim)       |

## Environment Variables

| Variable                 | Required         | Description                                                                                                         |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_TEAM_DOMAIN` | Yes (production) | Your Cloudflare Access team domain (e.g. `myteam.cloudflareaccess.com`). Used to fetch the JWKS for JWT validation. |

**This must be set in your `wrangler.jsonc` vars.** `cloudflareAccess` reads
`c.env.CLOUDFLARE_TEAM_DOMAIN` at request time. If it is missing or incorrect,
all production Cloudflare Access JWTs will fail verification — the middleware
falls back to HMAC (dev tokens only) and rejects the RS256-signed production
token.

```jsonc
{
  "vars": {
    "CLOUDFLARE_TEAM_DOMAIN": "myteam.cloudflareaccess.com"
  }
}
```

## Common Mistakes

**Do not wrap middleware in arrow functions.** Coding LLMs sometimes generate:

```ts
// WRONG — creates a new middleware instance on every request
app.use((c, next) => developerAuthentication({ policies })(c, next));
```

Register middleware directly instead:

```ts
// CORRECT
app.use(developerAuthentication({ policies: authPolicies }));
app.use(cloudflareAccess({ policies: authPolicies }));
```

If TypeScript reports a type mismatch with `MiddlewareHandler`, the likely
cause is **two copies of hono** in `node_modules` (e.g. from `file:..` symlink
during development). Fix the dependency, not the types.

## Wrangler Configuration

If your app serves a React SPA alongside a Hono API, you **must** use
`run_worker_first: true` so that every request — including the initial
page load — goes through the Worker. Without this, `developerAuthentication`
never runs on page loads, the `CF_Authorization` cookie is never set, and
API calls from the React app fail silently.

```jsonc
{
  "assets": {
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": true
  }
}
```

The Worker serves static assets via a catch-all route:

```ts
// After all API routes — proxy unmatched GETs to the ASSETS binding
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));
```

> **Do not use `serveStatic` from `hono/cloudflare-workers`** — it reads the
> legacy Workers Sites KV (`__STATIC_CONTENT`) which is `undefined` with the
> `assets.binding` system.

> **Why not `run_worker_first: ["/api/*", "/_auth/*"]`?** Selective routing
> only sends API calls through the Worker. The initial page load (`GET /`)
> bypasses the Worker, so `developerAuthentication` never sets the cookie.
> The React app's first `fetch()` to a protected endpoint gets a 302 redirect
> that `fetch()` follows silently into login-page HTML.

## Cookie & Header Reference

| Name                                 | Type   | Set by                             | Description                                                                                                                                                                                                                                                 |
| ------------------------------------ | ------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CF_Authorization`                   | Cookie | Cloudflare Access / dev middleware | JWT token. HttpOnly in dev; not HttpOnly in production (CF Access).                                                                                                                                                                                         |
| `Cf-Access-Jwt-Assertion`            | Header | Cloudflare Access / dev middleware | Same JWT as the cookie                                                                                                                                                                                                                                      |
| `Cf-Access-Authenticated-User-Email` | Header | Cloudflare Access / dev middleware | User's email address                                                                                                                                                                                                                                        |
| `Cf-Access-User`                     | Header | Dev middleware only                | Unique user identifier. **Not set by Cloudflare Access** — the `sub` claim is extracted from the JWT by `cloudflareAccess` middleware. Dev tokens default to a generated UUID `sub`; override per identity (see below) or via `signDevJwt(email, { sub })`. |

## Testing Utilities

The `@adrianhall/cloudflare-auth/testing` subpath exports helpers for
writing integration and E2E tests without going through the login flow:

```ts
import {
  signDevJwt, // Create a dev-signed JWT for any email
  buildCookieHeader, // Build a Set-Cookie header value
  clearCookieHeader, // Build a Set-Cookie that clears the cookie
  JWT_HEADER, // "cf-access-jwt-assertion"
  COOKIE_NAME // "CF_Authorization"
} from "@adrianhall/cloudflare-auth/testing";
```

Use `signDevJwt()` to mint tokens and inject them via the
`Cf-Access-Jwt-Assertion` header in Vitest or Playwright tests:

```ts
const token = await signDevJwt("alice@example.com");
const res = await app.fetch(
  new Request("http://localhost/api/me", {
    headers: { [JWT_HEADER]: token }
  }),
  env
);
```

The `sub` claim defaults to a generated **UUID** (matching the shape of a
real Cloudflare Access subject) rather than an email-derived value, so
strict downstream subject validators (e.g. `[A-Za-z0-9-]`) accept it. When
a test needs to assert an exact subject, pass `sub` explicitly — it is used
verbatim:

```ts
const token = await signDevJwt("alice@example.com", { sub: "alice-uuid" });
// c.get("userSub") === "alice-uuid"
```

## Example App

The [`example/`](https://github.com/adrianhall/cloudflare-auth/tree/main/example)
directory contains a complete React + Hono diagnostic application that
exercises every integration pattern: public and protected routes, the
login flow, cookie handling, curl access with `signDevJwt()`, and
production deployment behind Cloudflare Access.

```bash
cd example
npm install
npm run dev       # Vite dev server with HMR
```

The wrangler and middleware configuration recommendations in this README
were determined empirically. The full experiment methodology and results
are documented in
[`example/docs/MANUAL_TESTS.md`](https://github.com/adrianhall/cloudflare-auth/tree/main/example/docs/MANUAL_TESTS.md).

## Local development with Vite (no Worker changes)

If you build your app with [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/)
(for example, a C3 React + Vite project), you can emulate the Cloudflare
Access edge **entirely in the Vite dev server** with the
`cloudflareAccessPlugin()` exported from `@adrianhall/cloudflare-auth/vite`.

In this mode your Worker keeps **only** the production `cloudflareAccess()`
middleware — there is no `developerAuthentication()` and no
`run_worker_first`. All dev-time login, logout, identity, and header
injection happen at the connect layer in front of `@cloudflare/vite-plugin`.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { cloudflareAccessPlugin } from "@adrianhall/cloudflare-auth/vite";

const policies = [
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\//, authenticate: true, redirect: false },
  { pattern: /^\/.*/, authenticate: true }
];

export default defineConfig({
  plugins: [
    // MUST come before cloudflare() so it can inject the Access headers
    // before the request is dispatched into the Worker runtime.
    cloudflareAccessPlugin({
      policies,
      // `sub` is optional; pin it to give an identity a stable, realistic
      // subject across logins. When omitted a UUID is generated per login.
      users: [
        { email: "alice@example.com", name: "Alice", sub: "alice-uuid" },
        { email: "bob@example.com" }
      ]
    }),
    cloudflare(),
    react()
  ]
});
```

```ts
// worker/index.ts — the SAME policies, ONLY cloudflareAccess()
import { Hono } from "hono";
import { cloudflareAccess, type AuthVariables } from "@adrianhall/cloudflare-auth";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
// enableDevTokens lets the Worker validate the plugin's HS256 dev token
// during `vite dev`; it is statically false in the production build.
app.use(cloudflareAccess({ policies, enableDevTokens: import.meta.env.DEV }));
app.get("/api/me", (c) => c.json({ email: c.get("userEmail"), sub: c.get("userSub") }));
export default app;
```

The plugin:

1. **Owns `/cdn-cgi/access/*`** — `login` (renders a dev login form with
   selectable identities), `logout` (clears the `CF_Authorization`
   cookie), and `get-identity` (returns identity JSON matching the Access
   shape).
2. **Gates HTML navigations** — an unauthenticated navigation is
   redirected to the login form; API routes with `redirect: false` return
   `401`.
3. **Injects headers then hands off** — for an authenticated session it
   signs an HS256 dev JWT and sets `cf-access-jwt-assertion` (+
   `cf-access-authenticated-user-email`), then lets the request flow into
   the Worker, where `cloudflareAccess()` validates it via its HMAC path
   (no network). This requires `enableDevTokens: import.meta.env.DEV` on the
   Worker's `cloudflareAccess()` — fail-closed by default, so the production
   build verifies only real Access tokens via JWKS.
4. **Passes Vite internals through** untouched (`/@vite`, `/@fs`,
   `/node_modules`, HMR, `/src/`).

### Options

| Option          | Type                                 | Default                   | Description                                          |
| --------------- | ------------------------------------ | ------------------------- | ---------------------------------------------------- |
| `policies`      | `PathPolicy[]`                       | all paths protected       | Same array you pass to `cloudflareAccess()`.         |
| `devSecret`     | `string`                             | built-in dev key          | Must match `cloudflareAccess({ devSecret })` if set. |
| `users`         | `{ email: string; name?: string }[]` | `[]` (single email input) | Selectable identities on the login form.             |
| `loginPath`     | `string`                             | `"/cdn-cgi/access/login"` | Login form route.                                    |
| `tokenLifetime` | `number`                             | `86400` (24 h)            | Dev JWT lifetime in seconds.                         |

> **Why `cloudflareAccessPlugin()` must run before `cloudflare()`:**
> `@cloudflare/vite-plugin` builds the `Request` it dispatches into
> `workerd` from `req.rawHeaders` (not the parsed `req.headers`). The
> plugin pushes the JWT onto `req.rawHeaders` and registers its
> middleware with `enforce: "pre"` so it runs ahead of the plugin's
> dispatch handler. Because this relies on an internal detail of
> `@cloudflare/vite-plugin`, **pin that dependency** and rely on the
> demo's e2e guard (`npm run test:e2e:demo`) to catch regressions.

A complete C3-scaffolded demo lives in
[`example-vite/`](https://github.com/adrianhall/cloudflare-auth/tree/main/example-vite).

```bash
cd example-vite
npm install
npm run dev   # http://localhost:5173 — gated by cloudflareAccessPlugin()
```

## Development

```bash
npm install
npm run check
npm run test:coverage
npm run build
```

Build output in `dist/` is committed so GitHub installs can consume the package without rebuilding it. The Husky pre-commit hook runs formatting checks, type checks, ESLint, tests, and `build`, then stages the rebuilt `dist/` directory.

## License

MIT
