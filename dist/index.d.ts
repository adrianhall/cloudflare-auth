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
export { developerAuthentication } from "./developer-authentication.js";
export { cloudflareAccess } from "./cloudflare-access.js";
export type { AuthVariables, DeveloperAuthSettings, CloudflareAccessSettings, PathPolicy, PolicyMatch, Logger } from "./types.js";
export { matchPolicy } from "./policy.js";
export { signDevJwt, verifyDevJwt, verifyAccessJwt, parseCookie, buildCookieHeader, clearCookieHeader, DEFAULT_DEV_SECRET, COOKIE_NAME, JWT_HEADER, EMAIL_HEADER, USER_HEADER } from "./jwt.js";
//# sourceMappingURL=index.d.ts.map