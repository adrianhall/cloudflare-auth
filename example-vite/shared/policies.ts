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

/** Selectable identities shown on the dev login form. */
export const devUsers = [
  { email: "alice@example.com", name: "Alice Admin" },
  { email: "bob@example.com", name: "Bob Viewer" }
];
