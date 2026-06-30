/**
 * Cloudflare Access JWT validation middleware for Hono.
 *
 * Reads the JWT from the `CF_Authorization` cookie (or the
 * `Cf-Access-Jwt-Assertion` header), verifies the signature, and
 * populates Hono context variables (`userEmail`, `userSub`) for
 * downstream handlers.
 *
 * @module
 */
import type { MiddlewareHandler } from "hono";
import type { CloudflareAccessSettings } from "./types.js";
/**
 * Create a Hono middleware that validates a Cloudflare Access JWT and
 * sets authenticated-user variables on the Hono context.
 *
 * **Policy evaluation** (same policy array as
 * {@link developerAuthentication}):
 *
 * | Policy match       | Behaviour                                      |
 * |--------------------|-------------------------------------------------|
 * | `authenticate: false` | Bypass — skip JWT validation entirely.       |
 * | `authenticate: true`  | Require — valid JWT or 401.                  |
 * | No matching policy    | Controlled by `defaultAction` (see below).   |
 *
 * **`defaultAction`** (applies when no policy matches):
 *
 * - `"block"` *(default)* — return 401 if no valid JWT is present.
 * - `"bypass"` — allow the request through.  If a JWT *is* present and
 *   valid the context variables are still set; otherwise the request
 *   continues with no authenticated user.
 *
 * **Verification order** (when JWT validation is performed):
 *
 * 1. *(Opt-in)* When `enableDevTokens` is `true`, try HMAC verification
 *    with the dev secret (fast, in-process).
 * 2. Verify against the remote JWKS endpoint for the team domain.
 *
 * Developer-token verification is **fail-closed**: it is disabled by
 * default so a deployed Worker never silently trusts a forgeable HS256
 * token signed with the public {@link DEFAULT_DEV_SECRET}.  Enable it only
 * in local development (e.g. `enableDevTokens: import.meta.env.DEV`).
 */
export declare function cloudflareAccess(settings?: CloudflareAccessSettings): MiddlewareHandler;
//# sourceMappingURL=cloudflare-access.d.ts.map