/**
 * Testing utilities for `@adrianhall/cloudflare-auth`.
 *
 * Use these helpers in Vitest / Playwright tests to mint dev JWTs
 * and build cookie headers without going through the login flow.
 *
 * @example
 * ```ts
 * import { signDevJwt, JWT_HEADER } from "@adrianhall/cloudflare-auth/testing";
 *
 * const token = await signDevJwt("alice@example.com");
 * const res = await app.fetch(
 *   new Request("http://localhost/api/me", {
 *     headers: { [JWT_HEADER]: token },
 *   }),
 *   env,
 * );
 * ```
 *
 * @module
 */
export { signDevJwt, buildCookieHeader, clearCookieHeader, JWT_HEADER, COOKIE_NAME } from "./jwt.js";
//# sourceMappingURL=testing.d.ts.map