/**
 * Console-based fallback logger.
 *
 * Used by the authentication middleware when no external logger is
 * provided in settings.  Each method prefixes its output with the
 * module name so that log lines remain identifiable.
 *
 * @module
 */
import type { Logger } from "./types.js";
/**
 * Create a console-based {@link Logger} that prefixes every message
 * with `[module]`.
 *
 * This is the default used by {@link developerAuthentication} and
 * {@link cloudflareAccess} when the caller does not supply a logger.
 */
export declare function createDefaultLogger(module: string, providedLogger?: Logger): Logger;
//# sourceMappingURL=default-logger.d.ts.map