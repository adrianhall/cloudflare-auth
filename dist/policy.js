/**
 * Shared path-policy evaluation used by both middleware functions.
 *
 * @module
 */
/**
 * Evaluate a request pathname against an ordered list of policies.
 *
 * Returns a {@link PolicyMatch} for the **first matching** policy, or
 * `undefined` when no policy matches (the caller decides what to do in
 * that case).
 *
 * The `redirect` field defaults to `true` when the matching
 * {@link PathPolicy} does not specify one.
 */
export function matchPolicy(pathname, policies) {
    for (const { pattern, authenticate, redirect } of policies) {
        if (pattern.test(pathname)) {
            return { authenticate, redirect: redirect ?? true };
        }
    }
    return undefined;
}
//# sourceMappingURL=policy.js.map