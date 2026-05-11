/**
 * Developer authentication middleware for Hono.
 *
 * Simulates Cloudflare Access one-time-PIN authentication when the
 * application is running locally (i.e. without real Cloudflare Access
 * headers).  In production the middleware is a transparent no-op.
 *
 * @module
 */
import type { Context, MiddlewareHandler } from "hono";
import type { DeveloperAuthSettings, Logger } from "./types.js";
/**
 * Create a Hono middleware that simulates Cloudflare Access
 * authentication for local development.
 *
 * When the incoming request already contains the `Cf-Access-Jwt-Assertion`
 * header (set by real Cloudflare Access), the middleware does nothing.
 *
 * Otherwise it drives an interactive email-based login flow:
 *
 * 1. Un-authenticated requests to protected paths are redirected to a
 *    login form.
 * 2. The login form posts the email to a callback endpoint which
 *    generates a signed JWT, sets the `CF_Authorization` cookie, and
 *    redirects back to the original URL.
 * 3. Subsequent requests carry the cookie.  The middleware reads it and
 *    injects the standard `Cf-Access-*` headers so that downstream
 *    middleware (e.g. {@link cloudflareAccess}) can process them
 *    uniformly.
 */
export declare function developerAuthentication(settings?: DeveloperAuthSettings): MiddlewareHandler;
/**
 * Handle the `POST /_auth/callback` form submission.
 *
 * Reads the `email` field, generates a developer JWT, sets the cookie,
 * and redirects to the URL the user originally requested.
 */
export declare function handleCallback(c: Context, opts: {
    loginPath: string;
    devSecret?: string;
    tokenLifetime?: number;
    logger?: Logger;
}): Promise<Response>;
/**
 * Inject Cloudflare-Access-style headers derived from the cookie JWT
 * and forward the request to the next middleware.
 *
 * The headers are added to the *incoming* `Request` object so that
 * downstream middleware (particularly {@link cloudflareAccess}) sees
 * them as if Cloudflare Access had set them.
 */
export declare function forwardWithHeaders(c: Context, token: string, next: () => Promise<void>, logger?: Logger): Promise<void | Response>;
/**
 * Converts a potentially undefined or null value to a default.
 * @param value the value to test
 * @param defaultValue the default value to return if the input value is undefined or null
 * @returns the defined value or the default value
 */
export declare function defaultTo<T>(value: T | undefined | null, defaultValue: T): T;
//# sourceMappingURL=developer-authentication.d.ts.map