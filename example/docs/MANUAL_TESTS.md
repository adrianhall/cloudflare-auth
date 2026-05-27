# Manual Testing Guide for cloudflare-auth

## Purpose

Determine, through empirical testing, the correct `wrangler.jsonc`
configuration for **React + Hono + Cloudflare Access** applications that use
`@adrianhall/cloudflare-auth`.

The current SKILL.md makes assumptions about how static-asset routing
interacts with the authentication middleware. These experiments replace
assumptions with evidence.

After completing this guide you will know exactly what to put in SKILL.md
for projects that combine:

- A React SPA (Vite build)
- A Hono API running in a Cloudflare Worker
- Cloudflare Access in production / `developerAuthentication` in dev
- Other bindings (D1, KV, Durable Objects, Queues, Workflows, etc.)

---

## Prerequisites

### 1. Install and build

```bash
cd example
npm install
```

### 2. Starting the app

Two modes are available. Each experiment should state which mode to use.

| Command                            | What it does                                               |
| ---------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                      | Vite dev server — React HMR + Worker in Cloudflare runtime |
| `npm run build && npm run preview` | Production-like build, then `wrangler dev`                 |

The default URL is printed in the terminal (typically `http://localhost:5173`
for Vite, `http://localhost:8787` for wrangler).

### 3. Clearing state between tests

Between every experiment (and sometimes between steps):

1. **Clear cookies** — DevTools → Application → Storage → Cookies → right-click → Clear
2. **Hard refresh** — Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)
3. **Restart the server** if you changed `wrangler.jsonc`

### 4. Reading the worker logs

Every request that reaches the worker is logged to the terminal:

```
============================================================
[REQ] GET /
------------------------------------------------------------
Headers: { ... }
Cookie header: absent
  CF_Authorization: absent
cf-access-jwt-assertion: absent
sec-fetch-mode: navigate
------------------------------------------------------------
  [dev-auth] INFO: ...
  [cf-access] INFO: ...
[RES] GET / -> 200 (5ms)
============================================================
```

**If you do NOT see a log entry for a request, it means the request bypassed
the worker** and was served directly by the static-asset layer. This is the
single most important observation for most experiments.

### 5. Generating JWT tokens for curl

```bash
node -e "import('@adrianhall/cloudflare-auth').then(m=>m.signDevJwt('test@example.com')).then(console.log)"
```

Save the output to a shell variable for convenience:

```bash
TOKEN=$(node -e "import('@adrianhall/cloudflare-auth').then(m=>m.signDevJwt('test@example.com')).then(console.log)")
```

---

## Configuration Matrix

All experiments use the same `wrangler.jsonc`. Only the `assets` block
changes. Before each experiment, edit `wrangler.jsonc`, save, and restart
the dev server.

### Config A — `run_worker_first: true` (conservative)

All requests hit the worker before any static-asset serving.

```jsonc
"assets": {
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": true
}
```

### Config B — `run_worker_first` selective

Only API and auth routes hit the worker; static assets are served directly.

```jsonc
"assets": {
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*", "/_auth/*"]
}
```

### Config C — `binding` only (current SKILL.md recommendation)

The ASSETS binding is available, but no `run_worker_first`. Asset routing
follows the default Cloudflare decision tree.

```jsonc
"assets": {
  "binding": "ASSETS",
  "not_found_handling": "single-page-application"
}
```

### Config D — minimal baseline

No ASSETS binding, no `run_worker_first`. The worker has no way to serve
assets programmatically.

```jsonc
"assets": {
  "not_found_handling": "single-page-application"
}
```

> **Note:** With Config D, the catch-all route `app.get("*", …)` in
> `worker/index.ts` will fail because `c.env.ASSETS` is undefined. That is
> expected — it tells us whether the worker is even invoked for asset paths.

---

## Experiment 1 — Which requests hit the worker?

**Hypothesis:** Only `run_worker_first: true` causes static-asset and
navigation requests to reach the worker. `binding: "ASSETS"` alone does
not change routing.

**Mode:** `npm run dev` (Vite)

### Steps (repeat for each Config A–D)

1. Edit `wrangler.jsonc` → set the `assets` block → restart server.
2. Clear cookies and cache.
3. Open the app URL in the browser (the initial page load).
4. **In the terminal**, check: did `[REQ] GET /` appear?
5. Open DevTools → Network. Find an asset request (e.g. a `.js` or `.css`
   file loaded by the page). Check the terminal: did that path appear?
6. Navigate to `/api/version` directly in the browser address bar.
   Check the terminal.

### Results

| Request                          | Config A | Config B | Config C | Config D |
| -------------------------------- | -------- | -------- | -------- | -------- |
| `GET /` (page load)              | yes      | no       | no       | no       |
| `GET /src/*.tsx` (Vite modules)  | yes      | no       | no       | no       |
| `GET /api/me` (React fetch)      | yes      | yes      | yes      | yes      |
| `GET /_auth/login` (fetch redir) | yes      | yes      | yes      | yes      |
| `GET /api/version` (browser nav) | yes      | yes      | no [^1]  | no [^1]  |
| Auth prompted on page load?      | yes [^2] | no       | no       | no       |
| Auth works after login?          | yes      | no [^3]  | no [^3]  | no [^3]  |

[^1]:
    Browser received `index.html` (SPA fallback) instead of JSON.
    The path doesn't match `run_worker_first` and the navigation
    request goes to asset serving.

[^2]:
    With `run_worker_first: true`, `GET /` goes through the worker.
    No policy matches `/`, so `developerAuthentication` requires
    auth and redirects to `/_auth/login`. After login the cookie is
    set and all subsequent requests (modules, API calls) carry it.

[^3]:
    The page loads directly from Vite (bypassing the worker), so
    `developerAuthentication` never runs and no cookie is set.
    The React app's `fetch("/api/me")` hits the worker, gets a 302
    redirect to `/_auth/login`, `fetch()` silently follows the
    redirect, and receives login-page HTML instead of JSON.

### What this tells us

**`run_worker_first: true` is required** for the auth flow to work
with `vite dev`. Without it:

1. The Vite plugin serves the page and all modules directly — the
   worker never sees `GET /` or any asset request.
2. Only explicit API calls (`fetch("/api/...")`) reach the worker.
3. `developerAuthentication` never has a chance to redirect the browser
   to the login page, so the cookie is never set.
4. API calls that require auth get a 302 redirect that `fetch()` follows
   silently — the React app receives login-page HTML instead of JSON.

**`binding: "ASSETS"` alone does not change routing.** Config C (binding,
no `run_worker_first`) behaves identically to Config D (neither) for
page loads and auth.

**Selective `run_worker_first: ["/api/*", "/_auth/*"]` (Config B) does
route API calls through the worker**, but the page still loads without
auth, so the cookie is never set before the React app makes its first
API call.

**The current SKILL.md recommendation (Config C) is wrong.**

---

## Experiment 2 — Cookie flow on first page load

**Hypothesis:** If the initial page load does not go through the worker,
`developerAuthentication` never runs, and the `CF_Authorization` cookie is
never set. The React app's first API call will therefore fail.

**Mode:** `npm run dev` (Vite)

### Steps (repeat for each Config A–D)

1. Edit `wrangler.jsonc` → set the `assets` block → restart server.
2. Clear all cookies.
3. Navigate to the app URL in the browser.
4. **Observe:** Were you redirected to `/_auth/login`?
5. **DevTools → Application → Cookies:** Is `CF_Authorization` present?
6. **Terminal:** Did `developerAuthentication` produce any log output for
   `GET /`?

### Results

| Observation                               | Config A | Config B | Config C | Config D |
| ----------------------------------------- | -------- | -------- | -------- | -------- |
| Redirected to `/_auth/login`?             | yes [^4] | no       | no       | no       |
| `CF_Authorization` cookie set?            | yes [^5] | no       | no       | no       |
| `developerAuthentication` ran on `GET /`? | yes      | no [^6]  | no [^6]  | no [^6]  |

[^4]:
    `GET /` goes through the worker (because `run_worker_first: true`).
    No auth policy matches `/`, so `developerAuthentication` treats
    it as protected and redirects to `/_auth/login?redirect=%2F`.

[^5]:
    Cookie is set by `POST /_auth/callback` after the user submits
    the login form. All subsequent requests carry it.

[^6]:
    `GET /` is served directly by the Vite dev server — the worker
    never sees it, so `developerAuthentication` never runs. The
    React app loads unauthenticated. Its `fetch("/api/me")` does
    reach the worker, but the 302 redirect is swallowed by `fetch()`
    following the redirect silently into login-page HTML.

### What this tells us

**Confirmed: `run_worker_first: true` is required for the cookie flow
to work.** The hypothesis is correct — without it, the initial page
load bypasses the worker entirely, no redirect to login occurs, and
the cookie is never set.

Config B's selective `run_worker_first: ["/api/*", "/_auth/*"]` does
route the React app's `fetch("/api/me")` to the worker, and the worker
does redirect to `/_auth/login`. But this redirect happens inside a
`fetch()` call, not a browser navigation. `fetch()` silently follows
the 302, receives login-page HTML, and the React app shows "Not
Authenticated" — the user never sees the login form.

---

## Experiment 3 — Full login flow

**Purpose:** Verify the complete login experience end-to-end.

**Mode:** `npm run dev`  
**Config:** Use whichever config(s) redirected to `/_auth/login` in
Experiment 2. Also test Config A (which should always work).

### Steps

1. Clear cookies. Navigate to the app URL.
2. You should be redirected to `/_auth/login`. Enter an email address
   (e.g. `test@example.com`) and submit.
3. **Observe:** Were you redirected back to the original page?
4. **DevTools → Cookies:** Is `CF_Authorization` now present?
5. In the React app, click **Run** on **GET /api/me**.
6. **Observe:** Does it return `200` with your email?
7. **Refresh the page** (F5).
8. **Observe:** Is the Auth Status still "Authenticated"? (Cookie persisted.)
9. **Terminal:** Walk through the log entries for the full flow:
   - Initial `GET /` → redirect to `/_auth/login`
   - `GET /_auth/login` → login page served
   - `POST /_auth/callback` → cookie set, redirect
   - `GET /` → page served with cookie present
   - `GET /api/me` → user info returned

### Results

Only Config A is tested — it is the only config that redirects to login
(see Experiment 2). Configs B/C/D never reach the login form.

| Step                         | Config A                                      |
| ---------------------------- | --------------------------------------------- |
| Redirect to login?           | yes — `GET /` → 302 `/_auth/login?redirect=/` |
| Login form displayed?        | yes — `GET /_auth/login` → 200                |
| Redirect back after login?   | yes — `POST /_auth/callback` → 302 `/`        |
| Cookie set after login?      | yes — `CF_Authorization` present on `GET /`   |
| GET /api/me returns 200?     | yes — `{"email":"ahall@cloudflare.com",...}`  |
| Auth persists after refresh? | yes [^7]                                      |

[^7]:
    The cookie is `HttpOnly`, `SameSite=Lax`, and persists across
    page refreshes. With `run_worker_first: true` the refreshed
    `GET /` goes through the worker, `developerAuthentication` sees
    the cookie, injects CF headers, and `cloudflareAccess` verifies
    the token.

### Terminal log confirms the full flow

```
POST /_auth/callback  → [dev-auth] Issuing developer token {"email":"ahall@cloudflare.com"}
                      → 302 (Set-Cookie: CF_Authorization=eyJ...)
GET /                 → Cookie: present, CF_Authorization: present
                      → [dev-auth] Injected headers
                      → [cf-access] Verified token
                      → [assets] Proxying to ASSETS binding: /
                      → 200 (100ms)
GET /api/me           → Cookie: present
                      → [handler] GET /api/me (protected)
                      → 200
```

---

## Experiment 4 — React app API calls

**Purpose:** Verify that `fetch()` from the React app correctly includes
the cookie and that both public and protected endpoints work.

**Mode:** `npm run dev`  
**Config:** Use Config A (known working) and any other config that passed
Experiment 3.

### Steps

1. Complete the login flow (Experiment 3).
2. In the React app, click **Run All Tests**.
3. For each test case, record the result.

### Results

Only Config A is tested — it is the only config where auth works.

| Endpoint                       | Config A |
| ------------------------------ | -------- |
| GET /api/version (public)      | 200 OK   |
| GET /api/public/info (public)  | 200 OK   |
| POST /api/public/echo (public) | 200 OK   |
| GET /api/me (protected)        | 200 [^8] |
| POST /api/echo (protected)     | 200 OK   |
| GET /api/debug (public)        | 200 OK   |
| POST /api/debug (public)       | 200 OK   |

[^8]: Confirmed from Experiment 3 terminal log.

All endpoints return `200` — both public and protected work correctly
under Config A after login.

### What to check in debug responses

Open the response for **GET /api/debug**. Because `/api/debug` has
`authenticate: false` in the policy array, the middleware correctly
**skips auth processing** for this endpoint. This means:

- `middlewareAuth.*` — will all be null/absent (middleware skipped)
- `cookies.CF_Authorization` — should be "present" (browser sends it)
- `rawToken` — should show `{ present: true, valid: true, email: "...", sub: "..." }`

The `rawToken` field decodes the cookie directly (bypassing middleware)
so you can see the actual auth state even on public endpoints.

> **Why middleware values are null:** When a policy matches with
> `authenticate: false`, both `developerAuthentication` and
> `cloudflareAccess` call `next()` immediately without injecting
> headers or setting context variables. This is correct — the
> middleware respects the policy. Use `rawToken` for diagnostics.

#### Debug response (Config A, authenticated)

```json
{
  "request": {
    "method": "GET",
    "url": "http://localhost:5174/api/debug",
    "path": "/api/debug",
    "headers": {
      "accept": "*/*",
      "accept-encoding": "br, gzip",
      "accept-language": "en-US,en;q=0.9",
      "cf-connecting-ip": "127.0.0.1",
      "connection": "close",
      "cookie": "CF_Authorization=eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImFoYWxsQGNsb3VkZmxhcmUuY29tIiwic3ViIjoiZGV2LWFoYWxsQGNsb3VkZmxhcmUuY29tIiwidHlwZSI6ImRldiIsImlzcyI6ImRldi1hdXRoZW50aWNhdGlvbiIsImlhdCI6MTc3OTgxMjAwMiwiZXhwIjoxNzc5ODk4NDAyfQ.9gZkbB4LhVdJRJmwpVKSXBOrVtsXv8P9XnDXniNuS5E",
      "host": "localhost:5174",
      "referer": "http://localhost:5174/",
      "sec-ch-ua": "\"Chromium\";v=\"148\", \"Google Chrome\";v=\"148\", \"Not/A)Brand\";v=\"99\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"macOS\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      "x-forwarded-host": "localhost:5174"
    }
  },
  "cookies": {
    "raw": "CF_Authorization=eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImFoYWxsQGNsb3VkZmxhcmUuY29tIiwic3ViIjoiZGV2LWFoYWxsQGNsb3VkZmxhcmUuY29tIiwidHlwZSI6ImRldiIsImlzcyI6ImRldi1hdXRoZW50aWNhdGlvbiIsImlhdCI6MTc3OTgxMjAwMiwiZXhwIjoxNzc5ODk4NDAyfQ.9gZkbB4LhVdJRJmwpVKSXBOrVtsXv8P9XnDXniNuS5E",
    "CF_Authorization": "present"
  },
  "middlewareAuth": {
    "cf-access-jwt-assertion": "absent",
    "cf-access-authenticated-user-email": null,
    "cf-access-user": null,
    "contextEmail": null,
    "contextSub": null
  },
  "rawToken": {
    "present": true,
    "valid": true,
    "email": "ahall@cloudflare.com",
    "sub": "dev-ahall@cloudflare.com"
  },
  "note": "middlewareAuth values are null on public endpoints (authenticate: false) — this is correct. Check rawToken for the actual auth state.",
  "body": null,
  "timestamp": "2026-05-26T16:13:24.429Z"
}
```

---

## Experiment 5 — curl testing (no browser)

**Purpose:** Verify API access via curl, both with and without JWT tokens.
This is the primary interaction model for non-browser API consumers.

**Mode:** `npm run dev`  
**Config:** Config A

### Steps

Generate a token first:

```bash
TOKEN=$(node -e "import('@adrianhall/cloudflare-auth').then(m=>m.signDevJwt('curl-user@example.com')).then(console.log)")
echo $TOKEN
```

Then run each test:

#### 5a. Public endpoint — no auth needed

```bash
curl -s http://localhost:5173/api/version | jq .
```

Expected: `200` with `{ "version": "1.0.0", ... }`.

#### 5b. Protected endpoint — no auth

```bash
curl -v http://localhost:5173/api/me 2>&1 | head -30
```

Expected: `302` redirect to `/_auth/login` (or `401` — record which one).

#### 5c. Protected endpoint — with JWT header

```bash
curl -s -H "cf-access-jwt-assertion: $TOKEN" http://localhost:5173/api/me | jq .
```

Expected: `200` with `{ "email": "curl-user@example.com", ... }`.

#### 5d. Protected POST — with JWT header and body

```bash
curl -s -X POST \
  -H "cf-access-jwt-assertion: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"test":"data"}' \
  http://localhost:5173/api/echo | jq .
```

Expected: `200` with the echo response including user info.

#### 5e. Debug endpoint — shows server-side request view

```bash
curl -s -H "cf-access-jwt-assertion: $TOKEN" http://localhost:5173/api/debug | jq .
```

Check the `auth` and `cookies` fields in the response.

#### Responses

```text
> sh -x docs/experiment5.sh
++ node -e 'import('\''@adrianhall/cloudflare-auth'\'').then(m=>m.signDevJwt('\''curl-user@example.com'\'')).then(console.log)'
+ TOKEN=eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImN1cmwtdXNlckBleGFtcGxlLmNvbSIsInN1YiI6ImRldi1jdXJsLXVzZXJAZXhhbXBsZS5jb20iLCJ0eXBlIjoiZGV2IiwiaXNzIjoiZGV2LWF1dGhlbnRpY2F0aW9uIiwiaWF0IjoxNzc5ODEzNjIyLCJleHAiOjE3Nzk5MDAwMjJ9.O0u7eCzW10O-SNc9DTWdaj1vVkAajo6VZv2KpMcnwVY
+ echo eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImN1cmwtdXNlckBleGFtcGxlLmNvbSIsInN1YiI6ImRldi1jdXJsLXVzZXJAZXhhbXBsZS5jb20iLCJ0eXBlIjoiZGV2IiwiaXNzIjoiZGV2LWF1dGhlbnRpY2F0aW9uIiwiaWF0IjoxNzc5ODEzNjIyLCJleHAiOjE3Nzk5MDAwMjJ9.O0u7eCzW10O-SNc9DTWdaj1vVkAajo6VZv2KpMcnwVY
eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImN1cmwtdXNlckBleGFtcGxlLmNvbSIsInN1YiI6ImRldi1jdXJsLXVzZXJAZXhhbXBsZS5jb20iLCJ0eXBlIjoiZGV2IiwiaXNzIjoiZGV2LWF1dGhlbnRpY2F0aW9uIiwiaWF0IjoxNzc5ODEzNjIyLCJleHAiOjE3Nzk5MDAwMjJ9.O0u7eCzW10O-SNc9DTWdaj1vVkAajo6VZv2KpMcnwVY
+ echo -----
-----
+ curl -s http://localhost:5174/api/version
+ jq .
{
  "version": "1.0.0",
  "timestamp": "2026-05-26T16:40:22.522Z",
  "note": "This endpoint requires no authentication."
}
+ echo -----
-----
+ curl -v http://localhost:5174/api/me
+ head -30
* Host localhost:5174 was resolved.
* IPv6: ::1
* IPv4: 127.0.0.1
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0*   Trying [::1]:5174...
* Connected to localhost (::1) port 5174
> GET /api/me HTTP/1.1
> Host: localhost:5174
> User-Agent: curl/8.7.1
> Accept: */*
>
* Request completely sent off
< HTTP/1.1 302 Found
< Vary: Origin
< content-length: 0
< location: /_auth/login?redirect=%2Fapi%2Fme
< Date: Tue, 26 May 2026 16:40:22 GMT
< Connection: keep-alive
< Keep-Alive: timeout=5
<
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
* Connection #0 to host localhost left intact
+ echo -----
-----
+ curl -s -H 'cf-access-jwt-assertion: eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImN1cmwtdXNlckBleGFtcGxlLmNvbSIsInN1YiI6ImRldi1jdXJsLXVzZXJAZXhhbXBsZS5jb20iLCJ0eXBlIjoiZGV2IiwiaXNzIjoiZGV2LWF1dGhlbnRpY2F0aW9uIiwiaWF0IjoxNzc5ODEzNjIyLCJleHAiOjE3Nzk5MDAwMjJ9.O0u7eCzW10O-SNc9DTWdaj1vVkAajo6VZv2KpMcnwVY' http://localhost:5174/api/me
+ jq .
{
  "email": "curl-user@example.com",
  "sub": "dev-curl-user@example.com",
  "timestamp": "2026-05-26T16:40:22.545Z"
}
+ echo -----
-----
+ curl -s -X POST -H 'cf-access-jwt-assertion: eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImN1cmwtdXNlckBleGFtcGxlLmNvbSIsInN1YiI6ImRldi1jdXJsLXVzZXJAZXhhbXBsZS5jb20iLCJ0eXBlIjoiZGV2IiwiaXNzIjoiZGV2LWF1dGhlbnRpY2F0aW9uIiwiaWF0IjoxNzc5ODEzNjIyLCJleHAiOjE3Nzk5MDAwMjJ9.O0u7eCzW10O-SNc9DTWdaj1vVkAajo6VZv2KpMcnwVY' -H 'Content-Type: application/json' -d '{"test":"data"}' http://localhost:5174/api/echo
+ jq .
{
  "echo": {
    "test": "data"
  },
  "user": {
    "email": "curl-user@example.com",
    "sub": "dev-curl-user@example.com"
  },
  "timestamp": "2026-05-26T16:40:22.556Z"
}
+ echo -----
-----
+ curl -s -H 'cf-access-jwt-assertion: eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImN1cmwtdXNlckBleGFtcGxlLmNvbSIsInN1YiI6ImRldi1jdXJsLXVzZXJAZXhhbXBsZS5jb20iLCJ0eXBlIjoiZGV2IiwiaXNzIjoiZGV2LWF1dGhlbnRpY2F0aW9uIiwiaWF0IjoxNzc5ODEzNjIyLCJleHAiOjE3Nzk5MDAwMjJ9.O0u7eCzW10O-SNc9DTWdaj1vVkAajo6VZv2KpMcnwVY' http://localhost:5174/api/debug
+ jq .
{
  "request": {
    "method": "GET",
    "url": "http://localhost:5174/api/debug",
    "path": "/api/debug",
    "headers": {
      "accept": "*/*",
      "accept-encoding": "br, gzip",
      "accept-language": "*",
      "cf-access-jwt-assertion": "eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImN1cmwtdXNlckBleGFtcGxlLmNvbSIsInN1YiI6ImRldi1jdXJsLXVzZXJAZXhhbXBsZS5jb20iLCJ0eXBlIjoiZGV2IiwiaXNzIjoiZGV2LWF1dGhlbnRpY2F0aW9uIiwiaWF0IjoxNzc5ODEzNjIyLCJleHAiOjE3Nzk5MDAwMjJ9.O0u7eCzW10O-SNc9DTWdaj1vVkAajo6VZv2KpMcnwVY",
      "cf-connecting-ip": "127.0.0.1",
      "connection": "close",
      "host": "localhost:5174",
      "sec-fetch-mode": "cors",
      "user-agent": "curl/8.7.1",
      "x-forwarded-host": "localhost:5174"
    }
  },
  "cookies": {
    "raw": null,
    "CF_Authorization": "absent"
  },
  "middlewareAuth": {
    "cf-access-jwt-assertion": "present",
    "cf-access-authenticated-user-email": null,
    "cf-access-user": null,
    "contextEmail": null,
    "contextSub": null
  },
  "rawToken": {
    "present": true,
    "valid": true,
    "email": "curl-user@example.com",
    "sub": "dev-curl-user@example.com"
  },
  "note": "middlewareAuth values are null on public endpoints (authenticate: false) — this is correct. Check rawToken for the actual auth state.",
  "body": null,
  "timestamp": "2026-05-26T16:40:22.567Z"
}
+ echo -----
-----
```

### Results

| Test                  | Status | Notes                                               |
| --------------------- | ------ | --------------------------------------------------- |
| 5a. Public GET        | 200    | Returns version JSON as expected                    |
| 5b. Protected no auth | 302    | Redirects to `/_auth/login` as expected             |
| 5c. Protected + JWT   | 200    | `email: "curl-user@example.com"` — JWT header works |
| 5d. Protected POST    | 200    | Echo body + user info returned correctly            |
| 5e. Debug + JWT       | 200    | See analysis below                                  |

**5b confirms:** Without a JWT header or cookie, `developerAuthentication`
returns `302` to `/_auth/login`. curl does not follow redirects by
default, so the `302` and `Location` header are visible directly. This
is the same redirect that `fetch()` silently follows in Config B/C/D
(Experiment 1), but here it's transparent.

### Analysis of 5e (debug + JWT via curl)

The debug response via curl differs from the browser debug response in
a revealing way:

| Field                           | Browser (Exp 4)   | curl (Exp 5)       |
| ------------------------------- | ----------------- | ------------------ |
| `cookies.CF_Authorization`      | present           | absent             |
| `middlewareAuth[jwt-assertion]` | absent            | **present** [^9]   |
| `middlewareAuth[user-email]`    | null              | null               |
| `middlewareAuth.contextEmail`   | null              | null               |
| `rawToken.valid`                | true              | true               |
| `rawToken.email`                | ahall@cloudflare… | curl-user@example… |

[^9]:
    "present" because **curl sent the JWT header explicitly** — it
    is a raw request header, not one injected by the middleware.
    `developerAuthentication` sees the JWT header and does a no-op
    (production path). `cloudflareAccess` sees the policy
    `authenticate: false` and skips validation. So the header
    passes through untouched, but no context variables are set.

**Key takeaway:** `signDevJwt()` + the `cf-access-jwt-assertion` header
is a clean way to authenticate curl/API requests without needing a
cookie. This is the recommended approach for non-browser consumers and
for Playwright tests.

---

## Experiment 6 — Vite dev vs wrangler dev

**Purpose:** Determine whether the Vite plugin routes requests differently
from `wrangler dev`. If they behave the same, SKILL.md can recommend
either. If they differ, we need to document the differences.

**Config:** Config A (`run_worker_first: true`)

### Steps

#### 6a. Vite dev

```bash
npm run dev
```

Repeat Experiment 1 (steps 3–6) and Experiment 2 (steps 3–6). Record
results.

#### 6b. wrangler dev (production-like)

```bash
npm run build
npm run preview
```

Repeat the same steps. Record results.

### Results

All results use **Config A** (`run_worker_first: true`).

| Observation               | `vite dev` | `wrangler dev` |
| ------------------------- | ---------- | -------------- |
| `GET /` hits worker?      | yes        | yes            |
| `GET /assets/*.js` hits?  | yes [^10]  | yes [^11]      |
| `GET /api/version` hits?  | yes        | yes            |
| Redirect to login on `/`? | yes        | yes            |
| Cookie set after login?   | yes        | yes            |
| Full login flow works?    | yes        | yes [^12]      |

[^10]:
    In `vite dev`, asset paths are Vite dev-mode modules like
    `/src/main.tsx`, `/@vite/client`, `/node_modules/.vite/deps/*.js`
    — all routed through the worker.

[^11]:
    In `wrangler dev`, assets are production-built files like
    `/assets/index-DYk2-Fr-.js` and `/assets/index-DUgpSMfE.css`.
    All go through the worker with `run_worker_first: true`.

[^12]:
    Cookie from the `vite dev` session was still present (same
    `localhost` domain). The worker validated it successfully —
    `developerAuthentication` injected headers, `cloudflareAccess`
    verified the token, `GET /api/me` returned 200. Login redirect
    was not re-tested because the cookie persisted, but `GET /` goes
    through the worker so the redirect would fire if no cookie were
    present.

### What this tells us

**`vite dev` and `wrangler dev` behave identically with
`run_worker_first: true`.** Both route every request — page loads,
assets, API calls — through the worker. The middleware chain runs on
all of them, and the auth flow works in both modes.

SKILL.md can safely recommend either mode. `vite dev` is better for
React iteration (HMR), `wrangler dev` is closer to production (bundled
assets, no Vite overlay). The auth behaviour is the same.

One minor difference: `vite dev` serves unbundled source files
(`/src/main.tsx`) while `wrangler dev` serves production bundles
(`/assets/index-DYk2-Fr-.js`). Both go through the worker with
`run_worker_first: true`.

---

## Experiment 7 — Minimal correct configuration

**Purpose:** Starting from Config A (known working), remove settings one at
a time to find the minimum configuration that still passes all tests.

**Mode:** Both `npm run dev` and `npm run build && npm run preview`

### Steps

1. Start with Config A. Verify Experiments 2–4 pass.
2. Remove `run_worker_first: true`. Restart. Repeat Experiments 2–4.
   - If it fails, `run_worker_first` is required. Put it back.
3. Remove `binding: "ASSETS"`. Restart. Repeat Experiments 2–4.
   - You will also need to comment out the catch-all route in
     `worker/index.ts` since `c.env.ASSETS` will be undefined.
   - If it fails, the ASSETS binding is required. Put it back.
4. Change `not_found_handling` to `"none"`. Restart. Navigate to `/`.
   - Does the SPA load correctly, or do you get a 404?

Record the minimal config that passes everything.

### Results

| Removed setting      | vite dev works? | wrangler dev works? |
| -------------------- | --------------- | ------------------- |
| `run_worker_first`   | no [^13]        | no [^13]            |
| `binding: "ASSETS"`  | no [^14]        | no [^14]            |
| `not_found_handling` | yes             | yes                 |

[^13]:
    Opens home page without redirecting to login. The page loads
    directly from the asset layer, bypassing the worker.
    `developerAuthentication` never runs, cookie is never set.
    Same failure as Configs B/C/D in Experiment 1.

[^14]:
    Redirects to login correctly (because `run_worker_first: true`
    is still present), but after login the redirect back to `/`
    hits the catch-all route `c.env.ASSETS.fetch(c.req.raw)` which
    fails because `ASSETS` is undefined — "Internal Server Error".
    The binding is required for the worker to serve static assets.

### Minimal working config

```jsonc
"assets": {
  "binding": "ASSETS",
  "run_worker_first": true
}
```

**`not_found_handling: "single-page-application"` is not required** for
the auth flow to work. With `run_worker_first: true`, all requests go
through the worker. The catch-all `app.get("*", c => c.env.ASSETS.fetch(c.req.raw))`
serves assets, and the ASSETS binding itself handles SPA fallback when
`not_found_handling` is set — but even without it, the index page is
served for `/` because it matches an asset (`index.html`).

However, `not_found_handling: "single-page-application"` **is needed for
client-side routing**. If your React app uses React Router and a user
navigates directly to (or refreshes) `/dashboard`, the ASSETS binding
needs to return `index.html` instead of 404. Without `not_found_handling`,
only paths that match real files work.

**Recommended config for SKILL.md** (includes SPA fallback for safety):

```jsonc
"assets": {
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": true
}
```

---

## Experiment 8 — Production considerations

These questions may not all be testable locally, but they need answers
before updating SKILL.md.

### 8a. Does Cloudflare Access set the cookie on static-asset requests?

**Confirmed: CF Access intercepts ALL requests** (including static
assets and API calls) and sets the `CF_Authorization` cookie and
`Cf-Access-Jwt-Assertion` header before they reach the Worker.

Tested by deploying the example app behind a Cloudflare Access policy
with `run_worker_first: true`. The debug endpoint shows CF Access
headers present on a `fetch()` call from the React app:

| Header / Cookie                      | Present? | Value                              |
| ------------------------------------ | -------- | ---------------------------------- |
| `cf-access-jwt-assertion`            | yes      | RS256 JWT from CF Access           |
| `cf-access-authenticated-user-email` | yes      | `ahall@cloudflare.com`             |
| `cf-access-user`                     | **no**   | CF Access does not set this header |
| `CF_Authorization` cookie            | yes      | Same RS256 JWT                     |
| `CF_AppSession` cookie               | yes      | Session token                      |

Additional observations:

- The CF Access JWT is RS256 (signed with team JWKS), not HS256 (dev).
  `verifyDevJwt()` correctly returns false; `cloudflareAccess` validates
  it via the JWKS endpoint.
- `cf-access-user` is NOT set by CF Access. The `sub` claim is extracted
  from the JWT by `cloudflareAccess` middleware instead.
  `developerAuthentication` injects this header in dev, but it is absent
  in production.
- The CF Access cookie is **not HttpOnly** (visible to `document.cookie`),
  unlike the dev cookie which IS HttpOnly.
- The home page loaded successfully through CF Access, and `GET /api/me`
  returned the authenticated user — `cloudflareAccess` validated the
  RS256 JWT and set `userEmail`/`userSub` on protected routes.

**Implication for `run_worker_first`:** In production with CF Access,
the cookie and JWT header are set at the edge for ALL requests. The
Worker does not need to run on every request for the cookie to exist.
`run_worker_first: true` is needed **only in development** where
`developerAuthentication` replaces CF Access.

However, `run_worker_first: true` still has value in production for
cases where the Worker needs to process every request (logging, custom
headers, HTML rewriting). For most apps, `run_worker_first: true` in
both dev and production is the simplest correct config.

### 8b. Cost implications of `run_worker_first: true`

With `run_worker_first: true`, every request invokes the Worker —
including static assets (JS, CSS, images).

- On the **Workers Free plan**: free (10M requests/month). No concern.
- On the **Workers Paid plan**: $0.30 per million requests after 10M.
  For a typical internal app, this is negligible.
- For **high-traffic public sites**: selective routing
  (`run_worker_first: ["/api/*"]`) reduces cost by serving assets
  directly. But this only works in production with CF Access — in dev,
  `run_worker_first: true` is still required.

**Recommendation for SKILL.md:** Use `run_worker_first: true` for
simplicity. The cost is negligible for internal apps. Document the
selective option for high-traffic production apps.

### 8c. Can we use different configs for dev vs production?

We already do — `wrangler.jsonc` for dev (used by `vite dev` and
`wrangler dev`) and `wrangler.prod.jsonc` for production (generated
from Terraform outputs). Both use `run_worker_first: true`.

If cost optimisation is needed in production, the production template
can use `run_worker_first: ["/api/*"]` while dev keeps `true`.
This works because CF Access handles the cookie in production.

**Recommendation for SKILL.md:** Document both configs are maintained
separately. Default to `run_worker_first: true` in both.

### 8d. Do other bindings (D1, KV, DO, Queues, Workflows) affect routing?

Bindings are always available to the Worker regardless of routing config.
Routing only determines **when** the Worker is invoked. When the Worker
runs, all bindings configured in `wrangler.jsonc` are available in `c.env`.

- [x] Confirmed: bindings are available regardless of `run_worker_first`
      setting (the example app uses the `ASSETS` binding in all configs).

---

## Summary — Conclusions Checklist

Completed based on Experiments 1–8.

### Wrangler configuration

- [x] What `assets` config should SKILL.md recommend?
  ```jsonc
  "assets": {
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": true
  }
  ```
- [x] Is `run_worker_first` required?
  - [x] Always required (`true`) — simplest correct config for both
        dev and production. In production with CF Access it is
        technically optional (CF Access handles the cookie), but using
        `true` everywhere avoids a dev-vs-production config split.
- [x] Is `binding: "ASSETS"` needed?
  - [x] Yes, for the catch-all asset route
        (`app.get("*", c => c.env.ASSETS.fetch(c.req.raw))`).
        Without it, the worker cannot serve static assets.
- [x] Is `not_found_handling: "single-page-application"` needed?
  - [x] Not strictly required for auth, but needed for client-side
        routing (React Router). Direct navigation to `/dashboard`
        returns 404 without it. Include it for all SPAs.

### Development workflow

- [x] Should SKILL.md recommend `vite dev` or `wrangler dev`?
  - [x] Both, with notes on differences.
        `vite dev` for React HMR; `npm run build && wrangler dev` for
        production-like testing. Auth behaviour is identical (Exp 6).
- [x] Does the Vite plugin change routing behaviour in dev?
  - [x] No: with `run_worker_first: true`, both `vite dev` and
        `wrangler dev` route all requests through the worker.

### Authentication flow

- [x] What happens to `GET /` (page load) without auth?
  - [x] Redirected to `/_auth/login` (with `run_worker_first: true`).
        Without `run_worker_first`, the page loads without auth and
        the React app's API calls fail silently.
- [x] Does `fetch()` from React correctly send the cookie?
  - [x] Yes, automatically (same-origin). No `credentials: "include"`
        needed.
- [x] What does a protected API return without auth?
  - [x] `302` redirect to `/_auth/login`. `fetch()` follows the
        redirect silently and receives login-page HTML.

### Anti-patterns (confirmed by experiment)

| Anti-pattern                                                        | Config | Evidence                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Using `run_worker_first: ["/api/*", "/_auth/*"]` instead of `true`  | B      | Page loads bypass worker; cookie never set; React API calls get 302→HTML silently (Exp 1)                                                                                                  |
| Using `binding: "ASSETS"` without `run_worker_first`                | C      | Identical failure to Config B — binding alone does not change routing (Exp 1)                                                                                                              |
| No `binding` and no `run_worker_first`                              | D      | Same auth failure as C, plus catch-all route crashes (no ASSETS binding) (Exp 1)                                                                                                           |
| Omitting `binding: "ASSETS"` while keeping `run_worker_first: true` | Exp 7  | Login redirect works, but post-login redirect to `/` crashes — worker can't serve assets (Exp 7)                                                                                           |
| Assuming `cf-access-user` header is set by CF Access                | Exp 8  | CF Access does NOT set this header; only `cf-access-jwt-assertion` and `cf-access-authenticated-user-email` are set. The `sub` is extracted from the JWT by `cloudflareAccess` middleware. |

### Recommended curl workflow

```bash
# Generate a token:
TOKEN=$(node -e "import('@adrianhall/cloudflare-auth').then(m=>m.signDevJwt('test@example.com')).then(console.log)")

# Public endpoint (no auth needed):
curl -s http://localhost:5173/api/version | jq .

# Protected endpoint (with JWT header):
curl -s -H "cf-access-jwt-assertion: $TOKEN" http://localhost:5173/api/me | jq .

# Protected POST:
curl -s -X POST \
  -H "cf-access-jwt-assertion: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"value"}' \
  http://localhost:5173/api/echo | jq .
```

---

## Appendix: Default Cloudflare Asset Routing Decision Tree

From the official Cloudflare docs. This is the behaviour when
`run_worker_first` is NOT set:

```
Request
  └── run_worker_first matches?
        ├── Yes → Worker invoked
        ├── Negative match → Asset serving
        └── No match → Request matches a static asset?
              ├── Yes → Asset served directly (BYPASSES worker)
              └── No → Worker script present?
                    ├── No → Asset serving (404 / SPA fallback)
                    └── Yes → Navigation request? (Sec-Fetch-Mode: navigate)
                          ├── Yes → Asset serving (SPA fallback)*
                          └── No → Worker invoked
```

\* Since `compatibility_date >= 2025-04-01`, the compat flag
`assets_navigation_prefers_asset_serving` causes navigation requests to
prefer asset serving even when no exact asset match exists. This means
`GET /` goes to the SPA fallback, NOT the worker.

`run_worker_first: true` overrides all of this — every request goes to the
worker first.
