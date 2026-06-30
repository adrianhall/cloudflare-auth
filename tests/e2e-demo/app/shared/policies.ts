import type { PathPolicy } from "@adrianhall/cloudflare-auth";

/**
 * Auth policies shared by the dev Vite plugin and the Worker's
 * `cloudflareAccess()` middleware so dev and prod agree on which paths
 * are protected.
 *
 * - `/api/version` is public.
 * - All other `/api/*` routes are protected and return 401 (no redirect)
 *   so the SPA's `fetch()` calls behave like production.
 * - Everything else (the SPA itself) is protected; unauthenticated
 *   navigations are redirected to the dev login form.
 */
export const authPolicies: PathPolicy[] = [
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\//, authenticate: true, redirect: false },
  { pattern: /^\/.*/, authenticate: true }
];

/**
 * Alice's pinned, realistic UUID-style subject.
 *
 * Exported so the e2e spec can assert the rendered `sub` against the
 * single source of truth instead of hard-coding the value.
 */
export const ALICE_SUB = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

/**
 * Selectable identities shown on the dev login form.
 *
 * `sub` is optional. When pinned (Alice) the identity gets a stable,
 * realistic UUID-style subject across logins; when omitted (Bob) a fresh
 * UUID is generated each time that identity signs in.
 */
export const devUsers = [
  { email: "alice@example.com", name: "Alice Admin", sub: ALICE_SUB },
  { email: "bob@example.com", name: "Bob Viewer" }
];
