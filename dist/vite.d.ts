/**
 * Dev-only Vite plugin that emulates the Cloudflare Access edge in front
 * of `@cloudflare/vite-plugin`.
 *
 * In production, Cloudflare Access sits at the edge and injects the
 * `Cf-Access-Jwt-Assertion` header (and friends) into every request
 * before it reaches your Worker.  During `vite dev` there is no Access
 * in the loop.  This plugin reproduces that behaviour at the Vite
 * connect layer so the Worker can keep **only** the production
 * {@link cloudflareAccess} middleware — no `developerAuthentication`,
 * no `run_worker_first`.
 *
 * @example
 * ```ts
 * import { defineConfig } from "vite";
 * import react from "@vitejs/plugin-react";
 * import { cloudflare } from "@cloudflare/vite-plugin";
 * import { cloudflareAccessPlugin } from "@adrianhall/cloudflare-auth/vite";
 *
 * export default defineConfig({
 *   plugins: [
 *     cloudflareAccessPlugin({ policies, users }),
 *     cloudflare(),
 *     react(),
 *   ],
 * });
 * ```
 *
 * @module
 */
import type { Connect, Plugin } from "vite";
import type { PathPolicy } from "./types.js";
import { type DevLoginUser } from "./vite-login-page.js";
/** Configuration for {@link cloudflareAccessPlugin}. */
export interface CloudflareAccessPluginOptions {
    /**
     * Path policies evaluated in order (first match wins).
     *
     * Pass the **same array** you give to {@link cloudflareAccess} in the
     * Worker so dev and prod agree on which paths are protected.
     *
     * - `authenticate: false` → public (no gating, no header injection).
     * - `authenticate: true`  → protected.  Unauthenticated navigations are
     *   redirected to the login form; API routes with `redirect: false`
     *   receive a 401.
     *
     * When omitted, **all** non-internal paths are treated as protected.
     */
    policies?: PathPolicy[];
    /**
     * HMAC secret used to sign the dev JWT.
     *
     * Must match the `devSecret` passed to {@link cloudflareAccess} in the
     * Worker (if you override the default there).  Defaults to the same
     * well-known development key.
     */
    devSecret?: string;
    /**
     * Selectable identities rendered on the dev login form.  When omitted
     * the form shows a single free-text email input.
     */
    users?: DevLoginUser[];
    /** Pathname for the login form (default `"/cdn-cgi/access/login"`). */
    loginPath?: string;
    /** Dev JWT lifetime in seconds (default `86400` / 24 h). */
    tokenLifetime?: number;
}
/**
 * Create the dev-only Cloudflare Access emulation plugin.
 *
 * Register it **before** `@cloudflare/vite-plugin` (and any framework
 * plugin) so its connect middleware runs first:
 *
 * ```ts
 * plugins: [cloudflareAccessPlugin(), cloudflare(), react()]
 * ```
 *
 * The middleware is registered synchronously in the `configureServer`
 * hook body (combined with `enforce: "pre"`) so that it sits ahead of
 * the request → `workerd` dispatch handler that `@cloudflare/vite-plugin`
 * registers from its post hook.
 */
export declare function cloudflareAccessPlugin(options?: CloudflareAccessPluginOptions): Plugin;
/**
 * Build the connect middleware that emulates Cloudflare Access.
 *
 * Exported separately so it can be unit-tested with mock `req`/`res`
 * objects without booting a real Vite server.
 */
export declare function createAccessDevMiddleware(options?: CloudflareAccessPluginOptions): Connect.NextHandleFunction;
/**
 * Returns a `value` or the default value if not set
 * @param value the source value
 * @param defaultValue the default value
 * @returns the `value` or default value if `value` is not set
 */
export declare function valueOrDefault<T>(value: T | undefined | null, defaultValue: T): T;
//# sourceMappingURL=vite.d.ts.map