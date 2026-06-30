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
import { createDefaultLogger } from "./default-logger.js";
import { matchPolicy } from "./policy.js";
import { verifyDevJwt, verifyAccessJwt, parseCookie, JWT_HEADER, DEFAULT_DEV_SECRET } from "./jwt.js";
const LOG_MODULE = "cf-access";
// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------
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
export function cloudflareAccess(settings) {
    const policies = settings?.policies;
    const defaultAction = settings?.defaultAction ?? "block";
    const enableDevTokens = settings?.enableDevTokens ?? false;
    const devSecretProvided = typeof settings?.devSecret === "string";
    const devSecret = settings?.devSecret ?? DEFAULT_DEV_SECRET;
    const audience = settings?.audience;
    const teamDomainOverride = settings?.teamDomain;
    const log = createDefaultLogger(LOG_MODULE, settings?.logger);
    // Loud, one-time warning: dev-token verification is on but no explicit
    // secret was supplied, so the public DEFAULT_DEV_SECRET is in use.  This
    // is only safe on localhost — never in a deployed Worker.
    if (enableDevTokens && !devSecretProvided) {
        log.warn("enableDevTokens is true but no devSecret was provided; verifying HS256 dev tokens "
            + "with the public DEFAULT_DEV_SECRET. This is only safe in local development.");
    }
    return async (c, next) => {
        const pathname = new URL(c.req.url).pathname;
        // -----------------------------------------------------------------
        // 1.  Evaluate path policies.
        // -----------------------------------------------------------------
        const policyMatch = policies ? matchPolicy(pathname, policies) : undefined;
        if (policyMatch?.authenticate === false) {
            // Explicitly public — skip JWT validation entirely.
            log.debug("Path is public – bypassing auth", { pathname });
            return next();
        }
        // Determine whether auth is *required* for this path.
        //   - Explicit `true` from a policy  → required.
        //   - No matching policy + block      → required.
        //   - No matching policy + bypass     → optional (best-effort).
        const authRequired = policyMatch?.authenticate === true
            || (policyMatch === undefined && defaultAction === "block");
        // -----------------------------------------------------------------
        // 2.  Extract the token.
        // -----------------------------------------------------------------
        const token = c.req.header(JWT_HEADER) ?? parseCookie(c.req.header("cookie"));
        if (!token) {
            if (authRequired) {
                log.warn("No JWT found in header or cookie");
                return c.json({ error: "Authentication required" }, 401);
            }
            // Optional auth — no token, continue without user info.
            log.debug("No JWT – continuing (bypass)", { pathname });
            return next();
        }
        // -----------------------------------------------------------------
        // 3.  Verify the token.
        // -----------------------------------------------------------------
        const result = await verifyToken(c, token, {
            enableDevTokens,
            devSecret,
            audience,
            teamDomainOverride,
            logger: log
        });
        if (result) {
            log.debug("Verified token", { email: result.email });
            c.set("userEmail", result.email);
            c.set("userSub", result.sub);
            return next();
        }
        // -----------------------------------------------------------------
        // 4.  Verification failed.
        // -----------------------------------------------------------------
        if (authRequired) {
            log.warn("JWT verification failed");
            return c.json({ error: "Invalid or expired token" }, 401);
        }
        // Optional auth — bad token, continue without user info.
        log.info("JWT invalid – continuing (bypass)", { pathname });
        return next();
    };
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Attempt to verify a JWT.
 *
 * When `enableDevTokens` is `true`, the dev (HS256) secret is tried first
 * as a fast in-process path; otherwise that path is skipped entirely and
 * only Cloudflare Access JWKS verification runs (fail-closed default).
 *
 * Returns the verified claims or `null`.
 */
async function verifyToken(c, token, opts) {
    const log = createDefaultLogger(LOG_MODULE, opts.logger);
    // Fast path: dev-signed token.  Opt-in only — disabled by default so a
    // deployed Worker never trusts a forgeable HS256 token.
    if (opts.enableDevTokens) {
        const devResult = await verifyDevJwt(token, opts.devSecret);
        if (devResult)
            return devResult;
    }
    // Slow path: Cloudflare Access JWKS.
    const teamDomain = opts.teamDomainOverride ?? c.env.CLOUDFLARE_TEAM_DOMAIN;
    if (!teamDomain) {
        log.error("No team domain configured – set CLOUDFLARE_TEAM_DOMAIN in env or pass teamDomain in settings");
        return null;
    }
    return verifyAccessJwt(token, teamDomain, opts.audience);
}
//# sourceMappingURL=cloudflare-access.js.map