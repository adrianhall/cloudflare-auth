---
name: cloudflare-auth-vite
description: Use @adrianhall/cloudflare-auth/vite when building a React/SPA + Hono Worker app with @cloudflare/vite-plugin that is fronted by Cloudflare Access. Provides cloudflareAccessPlugin() — a dev-only Vite plugin that emulates the Cloudflare Access edge at the connect layer, so the Worker keeps ONLY the production cloudflareAccess() middleware (no developerAuthentication, no run_worker_first).
---

## When to Load This Skill

Load this skill whenever a developer is:

- Building a Vite app with `@cloudflare/vite-plugin` (e.g. a C3 `--framework=react` project) that will be deployed behind Cloudflare Access
- Asking how to do local development for a Vite + Worker app without adding dev-only auth code to the Worker
- Wanting the dev login / logout / identity flow to live in the Vite dev server instead of the Worker
- Seeing `cf-access-jwt-assertion` not reach the Worker during `vite dev`
- Choosing between `developerAuthentication()` (runtime middleware) and `cloudflareAccessPlugin()` (Vite plugin)

For the **runtime middleware** approach (`developerAuthentication()` +
`cloudflareAccess()` in the Worker, `run_worker_first: true`), load the
sibling **`cloudflare-auth`** skill instead. This skill is specifically
about the **Vite plugin** approach.

---

## The Core Problem This Solves

In production, Cloudflare Access sits at the edge and injects the
`Cf-Access-Jwt-Assertion` header (and `CF_Authorization` cookie) into
every request before it reaches your Worker. During `vite dev` there is
no Access in the loop.

The **runtime** approach (`cloudflare-auth` skill) solves this by adding
`developerAuthentication()` to the Worker and forcing every request
through the Worker with `run_worker_first: true`.

The **Vite plugin** approach solves it differently: a dev-only connect
middleware emulates the Access edge _in front of_ `@cloudflare/vite-plugin`.

|                     | Runtime middleware (`cloudflare-auth`)             | Vite plugin (`cloudflare-auth-vite`)                                  |
| ------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| Worker dev code     | `developerAuthentication()` + `cloudflareAccess()` | **`cloudflareAccess({ enableDevTokens: import.meta.env.DEV })` only** |
| `wrangler.jsonc`    | `run_worker_first: true` (all requests via Worker) | **no `run_worker_first`** (assets served directly)                    |
| Where dev auth runs | inside the Worker                                  | Vite connect layer (`configureServer`)                                |
| Best for            | any Worker + assets setup                          | Vite + `@cloudflare/vite-plugin` SPA apps                             |

**The Worker is environment-agnostic and identical to production: it only
ever runs `cloudflareAccess()`.** The one dev-vs-prod knob is
`enableDevTokens: import.meta.env.DEV` — a single boolean that Vite resolves
statically (`true` under `vite dev`, `false` in the production build), so the
deployed Worker verifies only real Access tokens via JWKS.

---

## Installation

This package is **not published to npm**. Install directly from GitHub
using a release **tag** (this project tags every release; never install
from `#main`):

```bash
npm install github:adrianhall/cloudflare-auth#1.3.0 hono
```

Peer dependencies: `hono ^4.12.0` (Worker) and `vite ^8.0.0` (dev only,
declared optional). The plugin imports from a dedicated subpath:

```ts
import { cloudflareAccessPlugin } from "@adrianhall/cloudflare-auth/vite";
```

> **You MUST use `@adrianhall/cloudflare-auth`, not `@hono/cloudflare-access`.**
> The two are not interchangeable. `cloudflareAccessPlugin()` signs an
> **HS256** dev JWT that `cloudflareAccess()` from this package validates
> via its HMAC-first path with no network call. `@hono/cloudflare-access`
> only validates **RS256** tokens against the live Access JWKS endpoint,
> so it rejects the dev token and cannot work with this plugin (RS256/JWKS
> bridging for `@hono/cloudflare-access` is explicitly out of scope). Use
> `cloudflareAccess()` from `@adrianhall/cloudflare-auth` in the Worker.

---

## Minimal Working Example

```ts
// shared/policies.ts — ONE policy array, imported by BOTH sides
import type { PathPolicy } from "@adrianhall/cloudflare-auth";

export const authPolicies: PathPolicy[] = [
  { pattern: /^\/api\/version$/, authenticate: false }, // public
  { pattern: /^\/api\//, authenticate: true, redirect: false }, // API → 401
  { pattern: /^\/.*/, authenticate: true } // SPA → login redirect
];
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { cloudflareAccessPlugin } from "@adrianhall/cloudflare-auth/vite";
import { authPolicies } from "./shared/policies";

export default defineConfig({
  plugins: [
    cloudflareAccessPlugin({
      policies: authPolicies,
      // `sub` is optional: pin it to give an identity a stable, realistic
      // (UUID-style) subject. When omitted a UUID is generated per login.
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
// worker/index.ts — ONLY cloudflareAccess(), same policies
import { Hono } from "hono";
import { cloudflareAccess, type AuthVariables } from "@adrianhall/cloudflare-auth";
import { authPolicies } from "../shared/policies";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
// enableDevTokens lets the Worker validate the plugin's HS256 token during
// `vite dev`; it is statically false in the production build (fail-closed).
app.use(cloudflareAccess({ policies: authPolicies, enableDevTokens: import.meta.env.DEV }));
app.get("/api/version", (c) => c.json({ version: "1.0.0" }));
app.get("/api/me", (c) => c.json({ email: c.get("userEmail"), sub: c.get("userSub") }));
export default app;
```

```jsonc
// wrangler.jsonc — NO run_worker_first
{
  "name": "my-app",
  "main": "worker/index.ts",
  "compatibility_date": "2025-01-01",
  "vars": { "CLOUDFLARE_TEAM_DOMAIN": "myteam.cloudflareaccess.com" },
  "assets": { "not_found_handling": "single-page-application" }
}
```

---

## Critical Setup Rules

### 1. The plugin MUST come before `cloudflare()`

```ts
// CORRECT
plugins: [cloudflareAccessPlugin(), cloudflare(), react()];

// WRONG — cloudflare() dispatches the request into workerd before the
// plugin can inject the Access headers; the Worker sees no JWT.
plugins: [cloudflare(), cloudflareAccessPlugin(), react()];
```

The plugin uses `apply: "serve"`, `enforce: "pre"`, and registers its
connect middleware synchronously in the `configureServer` hook body, so
it always runs ahead of `@cloudflare/vite-plugin`'s request→`workerd`
dispatch handler (registered from a post hook).

### 2. The Worker uses ONLY `cloudflareAccess()` — with the dev-token gate

Do **not** add `developerAuthentication()` when using the plugin. The
plugin replaces it. Adding both means two layers try to drive the dev
login flow.

The plugin signs an **HS256** dev JWT, and `cloudflareAccess()` verifies
HS256 tokens **only** when `enableDevTokens` is `true` (fail-closed by
default). Gate it on `import.meta.env.DEV` so `vite dev` works while the
production build verifies only real Access tokens via JWKS:

```ts
// CORRECT
app.use(cloudflareAccess({ policies, enableDevTokens: import.meta.env.DEV }));

// WRONG — vite dev 401s: the plugin's HS256 token is never verified
app.use(cloudflareAccess({ policies }));

// WRONG — ships a forgeable bypass to production
app.use(cloudflareAccess({ policies, enableDevTokens: true }));
```

### 3. Do NOT add `run_worker_first`

The whole point of the plugin is that static assets are served **directly**
by the asset layer (bypassing the Worker), exactly as in production. The
plugin gates HTML navigations itself. Adding `run_worker_first: true`
forces every asset through the Worker and defeats the demonstration —
and is unnecessary because the plugin (not the Worker) sets the cookie.

### 4. Share ONE `PathPolicy[]` and the same `devSecret`

Pass the **same** `policies` array to both `cloudflareAccessPlugin()` and
`cloudflareAccess()`. If you override `devSecret` in one, set the
identical value in the other — the plugin signs the HS256 dev JWT and the
Worker validates it via HMAC, so the secrets must match.

### 5. Pin `@cloudflare/vite-plugin` and keep the e2e guard

The plugin injects the JWT onto **`req.rawHeaders`** (not just
`req.headers`) because `@cloudflare/vite-plugin` builds the `Request` it
dispatches into `workerd` from `req.rawHeaders`. This is an internal
detail of that package. **Pin its version** and keep a real-stack e2e
that asserts an authenticated `/api/me` returns the identity, so an
upgrade that changes this behaviour is caught.

---

## What the Plugin Does Per Request

| Request                                                          | Plugin behaviour                                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `/@vite/*`, `/@fs/*`, `/@id/*`, `/node_modules/*`, `/src/*`, HMR | Pass through untouched.                                                                                                           |
| `GET /cdn-cgi/access/login`                                      | Render the dev login form (selectable `users` + custom email).                                                                    |
| `POST /cdn-cgi/access/login`                                     | Sign HS256 dev JWT, set `CF_Authorization` (HttpOnly), 302 back.                                                                  |
| `/cdn-cgi/access/logout`                                         | Clear the cookie, 302 to `/`.                                                                                                     |
| `/cdn-cgi/access/get-identity`                                   | Return Access-shaped identity JSON (or 401 when signed out).                                                                      |
| Authenticated request (valid cookie)                             | Push `cf-access-jwt-assertion` + `cf-access-authenticated-user-email` onto `req.rawHeaders` **and** `req.headers`, then `next()`. |
| Unauthenticated navigation (protected)                           | 302 to the login form.                                                                                                            |
| Unauthenticated API (policy `redirect: false`)                   | 401 JSON.                                                                                                                         |
| Unauthenticated public path                                      | Pass through (no injection).                                                                                                      |

---

## Options

```ts
interface CloudflareAccessPluginOptions {
  policies?: PathPolicy[]; // same array as cloudflareAccess()
  devSecret?: string; // must match cloudflareAccess({ devSecret })
  users?: { email: string; name?: string }[]; // selectable login identities
  loginPath?: string; // default "/cdn-cgi/access/login"
  tokenLifetime?: number; // dev JWT lifetime in seconds (default 86400)
}
```

The plugin is dev-only (`apply: "serve"`); it does nothing in
`vite build` / production, where real Cloudflare Access provides the
headers.

---

## Testing

- **Unit / handshake (no browser):** sign a token with `signDevJwt()`,
  build the `CF_Authorization` cookie with `buildCookieHeader()`, run the
  request through the plugin middleware, then dispatch the resulting
  headers to a Hono app using `cloudflareAccess()`. Confirms the
  HS256→HMAC handshake.
- **Real-stack guard (Playwright):** boot the demo (`vite dev` +
  `@cloudflare/vite-plugin`) and assert that an authenticated `/api/me`
  returns the identity — this proves the injected `req.rawHeaders` reach
  `workerd`. Drive it both through the browser and a direct
  `APIRequestContext` request.

See the [`example-vite/`](https://github.com/adrianhall/cloudflare-auth/tree/main/example-vite)
demo and its `e2e/access.spec.ts`.

---

## Anti-Patterns

| Anti-pattern                                                         | Problem                                                                                                                     | Fix                                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `cloudflareAccessPlugin()` placed **after** `cloudflare()`           | The request is dispatched into `workerd` before headers are injected; the Worker sees no JWT and returns 401                | Put `cloudflareAccessPlugin()` first in the `plugins` array                        |
| Using `developerAuthentication()` **and** `cloudflareAccessPlugin()` | Two layers drive the dev login; redundant and confusing                                                                     | With the Vite plugin, the Worker uses **only** `cloudflareAccess()`                |
| Omitting `enableDevTokens` on the Worker's `cloudflareAccess()`      | Dev-token verification is fail-closed by default, so the plugin's HS256 token is rejected and every `vite dev` request 401s | Set `enableDevTokens: import.meta.env.DEV` on `cloudflareAccess()`                 |
| Hardcoding `cloudflareAccess({ enableDevTokens: true })`             | The production Worker trusts any HS256 token signed with the public `DEFAULT_DEV_SECRET` → remote auth bypass               | Gate on `import.meta.env.DEV` so it is statically `false` in the production build  |
| Adding `run_worker_first: true` because of the plugin                | Forces all assets through the Worker, defeating the "assets bypass the Worker" model the plugin relies on                   | Omit `run_worker_first`; the plugin gates navigations itself                       |
| Injecting onto `req.headers` only (not `req.rawHeaders`)             | `@cloudflare/vite-plugin` builds the dispatched `Request` from `req.rawHeaders`, so the header never reaches the Worker     | Push onto `req.rawHeaders` (the plugin does this; do not "fix" it to headers-only) |
| Not pinning `@cloudflare/vite-plugin`                                | A future version could change how it reads headers, silently breaking dev auth                                              | Pin the version and keep the real-stack e2e guard                                  |
| Mismatched `devSecret` between plugin and `cloudflareAccess()`       | Plugin signs HS256 with one secret; Worker's HMAC verification uses another → 401                                           | Use the same `devSecret` (or rely on the shared default)                           |
| Different `policies` arrays for plugin vs Worker                     | Dev and prod disagree on which paths are protected                                                                          | Define one `PathPolicy[]` (e.g. in `shared/`) and import it in both                |
| Adding `/cdn-cgi/access/*` to `policies`                             | The plugin owns those paths; a policy entry can shadow them                                                                 | Leave `/cdn-cgi/access/*` out of `policies`                                        |
| Expecting the plugin to run in production                            | It is `apply: "serve"` only                                                                                                 | In production, real Cloudflare Access injects the headers; no plugin needed        |
| Importing `cloudflareAccessPlugin` from the package root             | It is a dev-only subpath export and would pull `vite` types into the Worker bundle                                          | Import from `@adrianhall/cloudflare-auth/vite`                                     |
