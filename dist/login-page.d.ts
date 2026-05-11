/**
 * HTML template for the developer-mode login page.
 *
 * Renders a minimal one-time-PIN–style form that collects an email
 * address and posts it to the callback endpoint.
 *
 * @module
 */
/**
 * Return a self-contained HTML page with an email login form.
 *
 * @param callbackPath - The URL path the form submits to.
 * @param redirectTo   - The original URL the user will be sent back to
 *                        after a successful login.
 * @param error        - An optional error message to display.
 */
export declare function renderLoginPage(callbackPath: string, redirectTo: string, error?: string): string;
//# sourceMappingURL=login-page.d.ts.map