/**
 * Cloudflare Access authentication library for Hono.
 *
 * Provides two middleware functions that, used together, authenticate
 * requests whether the application is fronted by Cloudflare Access
 * (production) or running locally without it (development).
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import {
 *   developerAuthentication,
 *   cloudflareAccess,
 *   type AuthVariables
 * } from "@adrianhall/cloudflare-auth";
 *
 * const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
 *
 * app.use(developerAuthentication());
 * app.use(cloudflareAccess());
 *
 * app.get("/api/me", (c) => {
 *   return c.json({ email: c.get("userEmail"), sub: c.get("userSub") });
 * });
 * ```
 *
 * @module
 */
// Middleware factories
export { developerAuthentication } from "./developer-authentication.js";
export { cloudflareAccess } from "./cloudflare-access.js";
// Policy evaluation
export { matchPolicy } from "./policy.js";
// JWT utilities (exported for advanced use-cases and testing)
export { signDevJwt, verifyDevJwt, verifyAccessJwt, parseCookie, buildCookieHeader, clearCookieHeader, DEFAULT_DEV_SECRET, COOKIE_NAME, JWT_HEADER, EMAIL_HEADER, USER_HEADER } from "./jwt.js";
//# sourceMappingURL=index.js.map