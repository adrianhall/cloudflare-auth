/**
 * HTML template for the Vite dev-server login page.
 *
 * Unlike {@link renderLoginPage} (used by the runtime
 * `developerAuthentication` middleware), this variant can render a list
 * of pre-configured, selectable identities so a developer can switch
 * users with a single click — while still allowing a free-text email
 * address to be entered.
 *
 * The form posts back to the plugin's login path, which signs a dev JWT
 * and sets the `CF_Authorization` cookie.
 *
 * @module
 */
/** A selectable identity rendered on the dev login form. */
export interface DevLoginUser {
    /** Email address used as the JWT `email`/`sub` source. */
    email: string;
    /** Optional human-friendly display name. */
    name?: string;
}
/**
 * Render a self-contained HTML page with a dev login form.
 *
 * @param loginPath  - The path the form submits to (handled by the plugin).
 * @param redirectTo - The URL the user is returned to after login.
 * @param users      - Optional selectable identities. When provided the
 *                     form shows a radio list plus a "custom email"
 *                     option; when empty it falls back to a single email
 *                     input.
 * @param error      - Optional error message to display.
 */
export declare function renderViteLoginPage(loginPath: string, redirectTo: string, users?: DevLoginUser[], error?: string): string;
//# sourceMappingURL=vite-login-page.d.ts.map