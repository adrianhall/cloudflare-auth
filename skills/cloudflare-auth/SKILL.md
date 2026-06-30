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
- Provisioning Cloudflare Access infrastructure with Terraform (applications, policies, IdP linking)

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
npm install github:adrianhall/cloudflare-auth#1.2.0 hono
# or
pnpm add github:adrianhall/cloudflare-auth#1.2.0 hono
```

Peer dependency: `hono ^4.0.0`
Runtime dependency: `jose ^6.2.3` (bundled)

---

## Working Example

The repository includes a complete diagnostic app in
[`example/`](https://github.com/adrianhall/cloudflare-auth/tree/main/example)
— a React SPA + Hono API built with the Cloudflare Vite plugin. It
exercises every setup pattern documented here (public/protected routes,
cookie flow, curl access, production deployment).

The configuration recommendations in this skill were determined
empirically using the experiments documented in
[`example/docs/MANUAL_TESTS.md`](https://github.com/adrianhall/cloudflare-auth/tree/main/example/docs/MANUAL_TESTS.md).
When in doubt about a recommendation, refer to the experiment that
produced it.

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
  { pattern: /^\/api\//, authenticate: true, redirect: false }, // API: 401 in dev
  { pattern: /^\/dashboard/, authenticate: true } // Pages: redirect to login in dev
];

app.use(developerAuthentication({ policies: authPolicies }));
app.use(cloudflareAccess({ policies: authPolicies }));
```

The `redirect` property only affects `developerAuthentication`
(`cloudflareAccess` always returns 401). Use `redirect: false` for API
routes so unauthenticated requests get a 401 JSON response in local
development, matching production behaviour.

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

### 4. Use `run_worker_first: true` — All Requests Must Flow Through the Worker

**This is the most commonly missed setup decision.**

If your frontend needs the `CF_Authorization` cookie to exist before it makes API calls, you **must** configure `run_worker_first: true` so that every request — including the initial page load — goes through the Worker and its middleware chain.

Without `run_worker_first: true`, the Cloudflare asset layer serves the page and all static assets directly, **bypassing the Worker entirely**. `developerAuthentication` never runs, the cookie is never set, and the React app's first API call fails silently (the 302 redirect to `/_auth/login` is swallowed by `fetch()` following the redirect into login-page HTML).

> **Why `binding: "ASSETS"` alone is not enough:** The `binding` setting only makes `env.ASSETS` available to your Worker code — it does **not** change routing. Without `run_worker_first: true`, navigation requests and static assets still bypass the Worker regardless of whether the binding exists.

**Wrong (assets bypass auth middleware):**

```jsonc
// wrangler.jsonc — binding alone does NOT route requests through the Worker
{
  "assets": {
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  }
}
```

**Also wrong (selective routing misses the initial page load):**

```jsonc
// wrangler.jsonc — page load bypasses the Worker; cookie is never set
{
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/_auth/*"]
  }
}
```

**Correct:**

```jsonc
// wrangler.jsonc — ALL requests go through the Worker.
// "binding": "ASSETS" lets the Worker serve static files via c.env.ASSETS.fetch().
// "not_found_handling": "single-page-application" enables client-side routing
// (direct navigation to /dashboard returns index.html instead of 404).
{
  "assets": {
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": true
  }
}
```

```ts
// index.ts — middleware + catch-all for assets
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

> **Production with Cloudflare Access:** In production, CF Access sets the cookie and
> JWT header at the edge for ALL requests before they reach the Worker, so
> `run_worker_first: true` is technically optional. However, using `true` in both dev
> and production avoids maintaining separate configs and ensures the middleware chain
> always runs.

### 5. Set `CLOUDFLARE_TEAM_DOMAIN` in Wrangler Vars

`cloudflareAccess` reads `c.env.CLOUDFLARE_TEAM_DOMAIN` at request time to fetch the Cloudflare Access JWKS for JWT validation. If this variable is missing or incorrect, **all production CF Access JWTs will fail verification** — the middleware falls back to HMAC (dev tokens only) and rejects the RS256-signed production token.

```jsonc
// wrangler.jsonc
{
  "vars": {
    "CLOUDFLARE_TEAM_DOMAIN": "myteam.cloudflareaccess.com"
  }
}
```

The variable name must be exactly `CLOUDFLARE_TEAM_DOMAIN` unless you override it via the `teamDomain` option:

```ts
// Default: reads from c.env.CLOUDFLARE_TEAM_DOMAIN
app.use(cloudflareAccess({ policies: authPolicies }));

// Explicit override (if using a different env var name):
app.use(cloudflareAccess({ policies: authPolicies, teamDomain: c.env.MY_TEAM_DOMAIN }));
```

### 6. Register Middleware Directly — Do Not Wrap in Arrow Functions

Coding LLMs sometimes generate a wrapper pattern like this:

```ts
// WRONG — unnecessary wrapper obscures the middleware and can break types
app.use((c, next) => developerAuthentication({ policies })(c, next));
app.use((c, next) => cloudflareAccess({ policies })(c, next));
```

This creates a **new middleware instance on every request** (re-evaluating the settings object each time) and obscures Hono's type inference. It also masks the real return type from TypeScript, hiding type errors that would catch misconfiguration.

```ts
// CORRECT — register the middleware directly
app.use(developerAuthentication({ policies: authPolicies }));
app.use(cloudflareAccess({ policies: authPolicies }));
```

The middleware factories return a `MiddlewareHandler` — pass it directly to `app.use()`.

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
  { pattern: /^\/api\//, authenticate: true, redirect: false } // protected API — 401 in dev
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
  redirect?: boolean; // true (default) = 302 to login, false = 401 JSON
}
```

Policies are evaluated in **first-match-wins** order.

The optional `redirect` property controls how `developerAuthentication`
responds to unauthenticated requests on protected paths:

- `true` _(default)_ -- 302 redirect to the login form. Use for page routes.
- `false` -- 401 JSON `{ error: "Authentication required" }`. Use for API
  routes so local dev matches production (`cloudflareAccess` always returns 401).

`cloudflareAccess` ignores this property.

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

| Variable                 | Required         | Description                                                                                                                             |
| ------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_TEAM_DOMAIN` | Yes (production) | Your Cloudflare Access team domain, e.g. `myteam.cloudflareaccess.com`. Used to fetch the JWKS for JWT validation.                      |
| `CLOUDFLARE_IDP_ID`      | Terraform only   | UUID of the Identity Provider in Zero Trust. Used in Terraform to create IdP-linked Access policies. Not read by the Worker at runtime. |

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
  ├── CF_Authorization cookie invalid/expired →
  │     redirect: true  (default)             → clear cookie, redirect to login
  │     redirect: false                       → clear cookie, 401 JSON
  └── No auth at all →
        redirect: true  (default)             → redirect to /_auth/login?redirect=<pathname>
        redirect: false                       → 401 JSON { error: "Authentication required" }
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

| Name                                 | Type   | Description                                                                                                                                                                                                     |
| ------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CF_Authorization`                   | Cookie | JWT. Set by Cloudflare Access in production (not HttpOnly), by `developerAuthentication` in dev (`HttpOnly`, `Secure`, `SameSite=Lax`).                                                                         |
| `Cf-Access-Jwt-Assertion`            | Header | Same JWT. Set by Cloudflare Access in production, injected by `developerAuthentication` in dev. Read by `cloudflareAccess`.                                                                                     |
| `Cf-Access-Authenticated-User-Email` | Header | User email. Set by Cloudflare Access in production, injected by `developerAuthentication` in dev.                                                                                                               |
| `Cf-Access-User`                     | Header | Unique user identifier. **Only injected by `developerAuthentication` in dev.** Cloudflare Access does NOT set this header — the `sub` claim is extracted from the JWT by `cloudflareAccess` middleware instead. |

---

## Wrangler Configuration

### Recommended config (React SPA + Hono API + auth)

All three settings in the `assets` block are required:

- `"run_worker_first": true` — routes **every** request through the Worker so `developerAuthentication` can set the cookie on the initial page load. Without this, the page loads directly from the asset layer and the cookie is never set.
- `"binding": "ASSETS"` — gives the Worker access to the static assets via `c.env.ASSETS.fetch()`. Without this, the catch-all route cannot serve the SPA.
- `"not_found_handling": "single-page-application"` — returns `index.html` for paths that don't match a static file (needed for client-side routing, e.g. React Router).

```jsonc
{
  "name": "my-worker",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  "vars": {
    "CLOUDFLARE_TEAM_DOMAIN": "myteam.cloudflareaccess.com"
  },
  "assets": {
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": true
  }
}
```

> **Note for the Cloudflare Vite plugin:** When using `@cloudflare/vite-plugin`, the
> `assets.directory` field is not needed — the plugin points it to the client build
> output automatically.

---

## Cloudflare Access Terraform Configuration

When provisioning the Cloudflare Access application and policies with Terraform, use the **v5 provider** (`cloudflare/cloudflare ~> 5.0`) together with the `jrhouston/dotenv` provider to read credentials from `.env`.

### Critical Rules

#### 1. Use v5 Resource Names

The v5 provider renamed all Zero Trust resources. Using v4 names causes `terraform apply` to fail with "resource type not found".

| v4 name (wrong)                 | v5 name (correct)                          |
| ------------------------------- | ------------------------------------------ |
| `cloudflare_access_application` | `cloudflare_zero_trust_access_application` |
| `cloudflare_access_policy`      | `cloudflare_zero_trust_access_policy`      |

#### 2. Policies Are Standalone Resources — Never Embedded

LLMs frequently try to embed policy decision/include blocks directly inside the application resource. **This does not work in v5.** Policies must be separate `cloudflare_zero_trust_access_policy` resources, and the application references them by ID with a numeric precedence.

```hcl
# WRONG — policy embedded inline in the application block (v4 pattern, broken in v5)
resource "cloudflare_zero_trust_access_application" "app" {
  account_id = local.account_id
  domain     = "${local.worker_name}.${local.workers_domain}"
  type       = "self_hosted"
  policies = [{
    decision = "allow"
    include  = [{ login_method = { id = local.idp_id } }]
  }]
}

# CORRECT — standalone policy resource, linked to the application by ID
resource "cloudflare_zero_trust_access_policy" "allow_idp" {
  account_id = local.account_id
  name       = "${local.worker_name} - Allow IdP users"
  decision   = "allow"
  include = [{
    login_method = {
      id = local.idp_id
    }
  }]
}

resource "cloudflare_zero_trust_access_application" "app" {
  account_id                = local.account_id
  name                      = local.worker_name
  domain                    = "${local.worker_name}.${local.workers_domain}"
  type                      = "self_hosted"
  session_duration          = "24h"
  allowed_idps              = [local.idp_id]
  auto_redirect_to_identity = true
  policies = [{
    id         = cloudflare_zero_trust_access_policy.allow_idp.id
    precedence = 1
  }]
}
```

### Complete Terraform Example

**`terraform.tf`**

```hcl
terraform {
  required_version = ">= 1.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    dotenv = {
      source  = "jrhouston/dotenv"
      version = "~> 1.0"
    }
  }
}
```

**`main.tf`**

```hcl
data "dotenv" "env" {
  filename = "../.env"   # path relative to the infra/ working directory
}

locals {
  account_id     = data.dotenv.env.env.CLOUDFLARE_ACCOUNT_ID
  worker_name    = data.dotenv.env.env.TF_VAR_worker_name
  team_domain    = data.dotenv.env.env.CLOUDFLARE_TEAM_DOMAIN
  idp_id         = data.dotenv.env.env.CLOUDFLARE_IDP_ID
  workers_domain = data.dotenv.env.env.CLOUDFLARE_WORKERS_DOMAIN
}

provider "cloudflare" {
  api_token = data.dotenv.env.env.CLOUDFLARE_API_TOKEN
}

# Worker registration — Wrangler handles code deployment separately
resource "cloudflare_worker" "app" {
  account_id = local.account_id
  name       = local.worker_name
}

# Standalone Access policy — must NOT be embedded inside the application block
resource "cloudflare_zero_trust_access_policy" "allow_idp" {
  account_id = local.account_id
  name       = "${local.worker_name} - Allow IdP users"
  decision   = "allow"
  include = [{
    login_method = {
      id = local.idp_id
    }
  }]
}

# Access application — links to the policy by ID
resource "cloudflare_zero_trust_access_application" "app" {
  account_id                = local.account_id
  name                      = local.worker_name
  domain                    = "${local.worker_name}.${local.workers_domain}"
  type                      = "self_hosted"
  session_duration          = "24h"
  allowed_idps              = [local.idp_id]
  auto_redirect_to_identity = true
  policies = [{
    id         = cloudflare_zero_trust_access_policy.allow_idp.id
    precedence = 1
  }]
}
```

**`.env.example`**

```dotenv
CLOUDFLARE_ACCOUNT_ID=          # 32-char hex account ID
CLOUDFLARE_API_TOKEN=           # Account API token (cfat_...)
CLOUDFLARE_WORKERS_DOMAIN=      # e.g. yoursubdomain.workers.dev
CLOUDFLARE_TEAM_DOMAIN=         # e.g. your-org.cloudflareaccess.com
CLOUDFLARE_IDP_ID=              # UUID from Zero Trust → Integrations → Identity Providers
TF_VAR_worker_name=             # Logical name prefix for all resources
```

> **Finding `CLOUDFLARE_IDP_ID`:** In the Cloudflare Zero Trust dashboard, navigate to **Integrations → Identity Providers**, select your IdP, and copy the UUID from the URL.

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
    sub?: string;      // default: a generated UUID (used verbatim when provided)
  }
): Promise<string>
```

**Claims:**

| Claim  | Value                                                                |
| ------ | -------------------------------------------------------------------- |
| `sub`  | `options.sub` verbatim, else a generated **UUID** (CF-Access-shaped) |
| `iss`  | `"dev-authentication"` (set automatically)                           |
| `type` | `"dev"` (set automatically)                                          |

The default `sub` is a random UUID rather than an email-derived value, so it satisfies strict downstream subject validators (e.g. `[A-Za-z0-9-]`) and resembles a real Cloudflare Access `sub`. When a test asserts an exact subject, pass `sub` explicitly:

```ts
const token = await signDevJwt("alice@example.com", { sub: "alice-uuid" });
// c.get("userSub") === "alice-uuid"
```

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
import { signDevJwt, JWT_HEADER } from "@adrianhall/cloudflare-auth/testing";

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
  type AuthVariables,
  type PathPolicy
} from "@adrianhall/cloudflare-auth";
import { signDevJwt, JWT_HEADER } from "@adrianhall/cloudflare-auth/testing";

const MOCK_ENV = { CLOUDFLARE_TEAM_DOMAIN: "test.cloudflareaccess.com" };

const authPolicies: PathPolicy[] = [
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\//, authenticate: true, redirect: false } // API routes return 401, not redirect
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
    // redirect: false → developerAuthentication returns 401 JSON (not 302)
    const res = await app.fetch(new Request("http://localhost/api/me"), MOCK_ENV);
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user for a valid token", async () => {
    const app = createApp();
    // Pin `sub` for a stable assertion; omit it to get a generated UUID.
    const token = await signDevJwt("alice@example.com", { sub: "alice-uuid" });

    const res = await app.fetch(
      new Request("http://localhost/api/me", {
        headers: { [JWT_HEADER]: token }
      }),
      MOCK_ENV
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; sub: string };
    expect(body.email).toBe("alice@example.com");
    expect(body.sub).toBe("alice-uuid");
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

    expect(res.status).toBe(401); // redirect: false → 401 instead of 302
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
import { signDevJwt, JWT_HEADER } from "@adrianhall/cloudflare-auth/testing";

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

| Anti-pattern                                                                                            | Problem                                                                                                                                                                                                     | Fix                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloudflareAccess` registered before `developerAuthentication`                                          | In dev, `cloudflareAccess` sees no JWT and returns `401` before `developerAuthentication` can inject headers                                                                                                | Always register `developerAuthentication` first                                                                                                                                                               |
| Different `policies` arrays for each middleware                                                         | Auth behavior is inconsistent between them                                                                                                                                                                  | Define one `PathPolicy[]` and pass it to both                                                                                                                                                                 |
| Adding `{ pattern: /^\/_auth\//, authenticate: false }` to `authPolicies`                               | Policy check fires before internal login-form handling; `next()` is called and the login form is never served — browser gets 404                                                                            | Do not add `/_auth/*` to policies. `developerAuthentication` owns those paths and requires no policy entry.                                                                                                   |
| Missing `run_worker_first: true` in wrangler.jsonc                                                      | Page loads bypass the Worker entirely. `developerAuthentication` never runs, the cookie is never set, and the React app's API calls fail silently — `fetch()` follows the 302 redirect into login-page HTML | Always set `"run_worker_first": true` in the `assets` block                                                                                                                                                   |
| Using `run_worker_first: ["/api/*", "/_auth/*"]` instead of `true`                                      | The initial page load (`GET /`) bypasses the Worker. API calls reach the Worker, but the cookie was never set, so `developerAuthentication` redirects — and `fetch()` swallows the redirect silently        | Use `run_worker_first: true` (not selective patterns)                                                                                                                                                         |
| Using `binding: "ASSETS"` without `run_worker_first: true`                                              | The binding only makes `env.ASSETS` available to Worker code — it does **not** change routing. Page loads still bypass the Worker                                                                           | Add `"run_worker_first": true` alongside the binding                                                                                                                                                          |
| Missing `binding: "ASSETS"`                                                                             | Without the binding, the catch-all route `c.env.ASSETS.fetch(c.req.raw)` crashes with "Internal Server Error" because `ASSETS` is undefined                                                                 | Add `"binding": "ASSETS"` to the `assets` block                                                                                                                                                               |
| Using `serveStatic` from `hono/cloudflare-workers`                                                      | `serveStatic` reads `c.env.__STATIC_CONTENT` (legacy Workers Sites KV). With `assets.binding`, `__STATIC_CONTENT` is `undefined` — all asset requests return 404                                            | Use `app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw))`                                                                                                                                                      |
| Assuming `Cf-Access-User` header is set by Cloudflare Access                                            | CF Access sets `Cf-Access-Jwt-Assertion` and `Cf-Access-Authenticated-User-Email` but does **not** set `Cf-Access-User`. The `sub` claim is extracted from the JWT by `cloudflareAccess` middleware         | Use `c.get("userSub")` from context variables, not the header directly                                                                                                                                        |
| Not setting `CLOUDFLARE_TEAM_DOMAIN` in production                                                      | `cloudflareAccess` cannot fetch the JWKS; all real Access JWTs fail verification                                                                                                                            | Set the var in `wrangler.jsonc` or via a secret                                                                                                                                                               |
| Not adding `AuthVariables` to the Hono generic                                                          | `c.get("userEmail")` returns `unknown`                                                                                                                                                                      | `new Hono<{ Bindings: Env; Variables: AuthVariables }>()`                                                                                                                                                     |
| Checking for the authenticated user on a `authenticate: false` path                                     | `c.get("userEmail")` will be `undefined` on public paths — the middleware skips auth processing entirely                                                                                                    | Only access context vars on protected routes                                                                                                                                                                  |
| Wrapping middleware in arrow functions: `(c, next) => middleware()(c, next)`                            | Creates a new middleware instance on every request, obscures Hono's type inference, and masks type errors that would catch misconfiguration. Often generated by coding LLMs as a "type fix"                 | Register middleware directly: `app.use(developerAuthentication({ ... }))`. If TypeScript complains, the root cause is likely dual copies of hono (see installation notes) — fix the dependency, not the types |
| Using v4 Terraform resource names (`cloudflare_access_application`, `cloudflare_access_policy`)         | These resource types do not exist in the v5 provider; `terraform apply` fails immediately with "resource type not found"                                                                                    | Rename to `cloudflare_zero_trust_access_application` and `cloudflare_zero_trust_access_policy`                                                                                                                |
| Embedding policy `decision`/`include` blocks directly inside `cloudflare_zero_trust_access_application` | Inline policy blocks are a v4 pattern that is not supported in v5; Terraform will error or silently produce an application with no effective policy                                                         | Create a standalone `cloudflare_zero_trust_access_policy` resource, then reference it via `policies = [{ id = <policy>.id, precedence = 1 }]`                                                                 |
| Omitting `CLOUDFLARE_IDP_ID` from `.env` and `allowed_idps` on the application                          | Access falls back to showing all configured identity providers instead of redirecting directly to the intended IdP                                                                                          | Add `CLOUDFLARE_IDP_ID` to `.env`, assign it to `local.idp_id`, and set both `allowed_idps = [local.idp_id]` on the application and `login_method = { id = local.idp_id }` in the policy's `include` block    |

---

## Testing Utilities (`@adrianhall/cloudflare-auth/testing`)

Available for integration tests, E2E tests, and advanced flows:

```ts
import {
  signDevJwt, // Sign a dev JWT (email, { secret?, lifetime?, sub? })
  buildCookieHeader, // Build a Set-Cookie header value for a JWT
  clearCookieHeader, // Build a Set-Cookie header that clears the cookie
  JWT_HEADER, // "cf-access-jwt-assertion"
  COOKIE_NAME // "CF_Authorization"
} from "@adrianhall/cloudflare-auth/testing";
```

All other internal utilities (`matchPolicy`, `verifyDevJwt`,
`verifyAccessJwt`, `parseCookie`, `DEFAULT_DEV_SECRET`, `EMAIL_HEADER`,
`USER_HEADER`) are not part of the public API.
