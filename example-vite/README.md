# example-vite — Cloudflare Access + Vite demo

A canonical [C3](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
React + Vite + Workers app (`npm create cloudflare@latest -- example-vite --framework=react`)
wired up with [`@adrianhall/cloudflare-auth`](../README.md).

It demonstrates **local development against a Cloudflare Access–protected
app with no Worker-side dev code**:

- `vite.config.ts` adds `cloudflareAccessPlugin()` **before** `cloudflare()`.
- `worker/index.ts` uses **only** `cloudflareAccess()` — no
  `developerAuthentication()`.
- `wrangler.jsonc` has **no** `run_worker_first`; static assets are served
  directly and only `/api/*` reaches the Worker.
- The SPA reads its identity from `/api/me` and links to
  `/cdn-cgi/access/logout`.

## Run it

```bash
npm install
npm run dev   # http://localhost:5173
```

Open the app: you are redirected to a dev login form (served by the
plugin at `/cdn-cgi/access/login`). Pick an identity and you land back on
the SPA, which shows your email and subject fetched from `/api/me`. Use
**Switch identity** / **Log out** to change users.

## How auth is wired

| Path                      | Behaviour (dev)                                                        |
| ------------------------- | ---------------------------------------------------------------------- |
| `/` (and other SPA pages) | Protected navigation → redirect to the dev login form when signed out. |
| `/api/version`            | Public.                                                                |
| `/api/me`                 | Protected → `401` when signed out; identity JSON when signed in.       |
| `/cdn-cgi/access/*`       | Owned by the plugin (login / logout / get-identity).                   |

The policies are defined once in [`shared/policies.ts`](./shared/policies.ts)
and shared by the plugin and the Worker.

## Installing the library

This demo installs `@adrianhall/cloudflare-auth` from a GitHub release tag —
exactly how a consumer installs it (see `package.json`). It is a runnable
reference, not a test harness.

## End-to-end tests

The library's real-stack e2e guard (Vite + `@cloudflare/vite-plugin` +
workerd) does **not** run against this demo. It lives in
[`tests/e2e-demo/`](../tests/e2e-demo) and builds the library from the
current source on every run:

```bash
npm run test:e2e:demo   # from the repository root
```
