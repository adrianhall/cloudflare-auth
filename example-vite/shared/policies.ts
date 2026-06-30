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
 * Selectable identities shown on the dev login form.
 *
 * `sub` is optional. When pinned (as for Alice below) the identity gets a
 * stable, realistic UUID-style subject across logins; when omitted (Bob) a
 * fresh UUID is generated each time that identity signs in.
 */
export const devUsers = [
  { email: "alice@example.com", name: "Alice Admin", sub: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed" },
  { email: "bob@example.com", name: "Bob Viewer" }
];
