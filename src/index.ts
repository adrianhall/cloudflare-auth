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

// Types
export type {
  AuthVariables,
  DeveloperAuthSettings,
  CloudflareAccessSettings,
  PathPolicy,
  PolicyMatch,
  Logger
} from "./types.js";
