# AGENTS.md

Guidance for AI agents working in this repository.

## What this is

`@adrianhall/cloudflare-auth` — Hono middleware for Cloudflare Access
authentication with a frictionless local-development story. Two middleware
that work identically so handlers are environment-agnostic:

- `developerAuthentication()` — simulates Access locally (login form, signs a
  dev JWT, injects `Cf-Access-*` headers). No-op in production.
- `cloudflareAccess()` — validates the JWT (dev HMAC fast-path, then remote
  JWKS) and sets `c.get("userEmail")` / `c.get("userSub")`.

A dev-only Vite plugin (`@adrianhall/cloudflare-auth/vite`,
`cloudflareAccessPlugin()`) emulates the Access edge at the Vite connect layer
so a Worker can keep ONLY `cloudflareAccess()`.

## Layout

- `src/index.ts` — public entry (middleware + types).
- `src/jwt.ts` — sign/verify dev JWTs, cookie helpers, header-name constants.
- `src/developer-authentication.ts` — dev login middleware.
- `src/cloudflare-access.ts` — JWT validation middleware (sets context vars).
- `src/vite.ts` + `src/vite-login-page.ts` — dev Vite plugin (`DevLoginUser`).
- `src/testing.ts` — `@adrianhall/cloudflare-auth/testing` subpath.
- `tests/` — Vitest (`unit` + `a11y` projects) and Playwright `e2e`.
- `skills/**/SKILL.md` — agent skills; keep in sync with behavior changes.
- `example/`, `example-vite/` — runnable demos.
- `dist/` — build output; never edit by hand (`npm run build` regenerates).

## Subpath exports

`.` (middleware + types), `./testing` (test helpers), `./vite` (dev plugin).
Do NOT import `./vite` into Worker code — it pulls `vite` types into the
bundle.

## Commands

- `npm run check` — prettier + types + eslint + unit tests (run before done).
- `npm run test:unit` — unit tests only.
- `npm run build` — `tsc` to `dist/`.
- `npm run check:full` — adds a11y + e2e (e2e demo rebuilds `example-vite`).

## Conventions

- Dev JWT `sub` defaults to a generated **UUID** (`crypto.randomUUID()`),
  matching a real Cloudflare Access subject. Override verbatim via
  `signDevJwt(email, { sub })` or per identity with `DevLoginUser.sub`. Do not
  reintroduce email-derived subjects (e.g. `dev-${email}`) — they break strict
  `[A-Za-z0-9-]` subject validators downstream.
- `userSub` is derived from the JWT `sub` claim by `cloudflareAccess`, not from
  a header.
- `cloudflareAccess` dev-token (HS256) verification is **fail-closed**:
  `enableDevTokens` defaults to `false`, so a deployed Worker verifies only
  via JWKS and rejects tokens signed with the public `DEFAULT_DEV_SECRET`.
  Enable it for local dev only, gated on a build-time signal that is
  statically `false` in production (`enableDevTokens: import.meta.env.DEV`).
  When enabled without an explicit `devSecret`, the middleware logs a
  one-time warning. `DEFAULT_DEV_SECRET` is a signing convenience only —
  never a silent verification key. Do not re-enable unconditional dev-token
  verification.
- Only `jose` is a runtime dependency; `hono`/`vite` are peers (`vite`
  optional). Avoid adding dependencies.
- When changing behavior, update `tests/`, `README.md`, and the relevant
  `skills/**/SKILL.md` together.
