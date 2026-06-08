/**
 * Shared path-policy evaluation used by both middleware functions.
 *
 * @module
 */
import type { PathPolicy, PolicyMatch } from "./types.js";
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
export declare function matchPolicy(pathname: string, policies: PathPolicy[]): PolicyMatch | undefined;
//# sourceMappingURL=policy.d.ts.map