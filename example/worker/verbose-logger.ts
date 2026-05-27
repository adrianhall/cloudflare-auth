/**
 * Verbose logger for diagnostic purposes.
 *
 * Outputs ALL log levels (including debug) with structured data,
 * so every decision the middleware makes is visible in the terminal.
 */
import type { Logger } from "@adrianhall/cloudflare-auth";

export function createVerboseLogger(module: string): Logger {
  const format = (level: string, message: string, data?: Record<string, unknown>): string => {
    const dataStr = data ? " " + JSON.stringify(data) : "";
    return `  [${module}] ${level}: ${message}${dataStr}`;
  };

  return {
    debug: (msg, data) => console.debug(format("DEBUG", msg, data)),
    info: (msg, data) => console.info(format("INFO ", msg, data)),
    warn: (msg, data) => console.warn(format("WARN ", msg, data)),
    error: (msg, data) => console.error(format("ERROR", msg, data))
  };
}
