/**
 * Shared path-policy evaluation used by both middleware functions.
 *
 * @module
 */
/**
 * Evaluate a request pathname against an ordered list of policies.
 *
 * Returns the `authenticate` value of the **first matching** policy, or
 * `undefined` when no policy matches (the caller decides what to do in
 * that case).
 */
export function matchPolicy(pathname, policies) {
    for (const { pattern, authenticate } of policies) {
        if (pattern.test(pathname)) {
            return authenticate;
        }
    }
    return undefined;
}
//# sourceMappingURL=policy.js.map