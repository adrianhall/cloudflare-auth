/**
 * Remote JWKS management for Cloudflare Access JWT verification.
 *
 * Extracted into its own module so that tests can mock
 * {@link getRemoteJwks} and supply a local key set instead of hitting
 * the real Cloudflare Access certs endpoint.
 *
 * @module
 */
/**
 * Return (or create-and-cache) a remote JWKS function for the given
 * Cloudflare Access team domain.
 */
export declare function getRemoteJwks(teamDomain: string): {
    (protectedHeader?: import("jose").JWSHeaderParameters, token?: import("jose").FlattenedJWSInput): Promise<import("jose").CryptoKey>;
    coolingDown: boolean;
    fresh: boolean;
    reloading: boolean;
    reload: () => Promise<void>;
    jwks: () => import("jose").JSONWebKeySet | undefined;
};
/**
 * Ensures the base URL for the JWKS endpoint is HTTPS.
 * @param url the base URL to check
 * @returns the modified base URL.
 */
export declare function ensureHttps(url: string): string;
//# sourceMappingURL=jwks.d.ts.map