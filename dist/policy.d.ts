/**
 * Shared path-policy evaluation used by both middleware functions.
 *
 * @module
 */
import type { PathPolicy } from "./types.js";
/**
 * Evaluate a request pathname against an ordered list of policies.
 *
 * Returns the `authenticate` value of the **first matching** policy, or
 * `undefined` when no policy matches (the caller decides what to do in
 * that case).
 */
export declare function matchPolicy(pathname: string, policies: PathPolicy[]): boolean | undefined;
//# sourceMappingURL=policy.d.ts.map