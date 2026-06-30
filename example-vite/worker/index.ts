/**
 * Demo Worker API for the Vite + Cloudflare Access plugin.
 *
 * Note what is NOT here:
 *   - No `developerAuthentication()` — the dev-time Access emulation
 *     lives entirely in `cloudflareAccessPlugin()` (see vite.config.ts).
 *   - No `run_worker_first` in wrangler.jsonc — static assets are served
 *     directly by the asset layer; only `/api/*` reaches this Worker.
 *
 * The Worker uses ONLY the production `cloudflareAccess()` middleware.
 * In dev it validates the plugin's HS256 token via HMAC (no network); in
 * production it validates the real Access RS256 token via JWKS.
 *
 * Dev-token verification is fail-closed and gated on `import.meta.env.DEV`
 * (statically `true` under `vite dev`, `false` in the production build),
 * so the deployed Worker never trusts a forgeable HS256 token.
 */
import { Hono } from "hono";
import { cloudflareAccess, type AuthVariables, type PathPolicy } from "@adrianhall/cloudflare-auth";

import { authPolicies } from "../shared/policies";

type Bindings = {
  CLOUDFLARE_TEAM_DOMAIN: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

app.use(
  cloudflareAccess({
    policies: authPolicies as PathPolicy[],
    enableDevTokens: import.meta.env.DEV
  })
);

// Public — no authentication required.
app.get("/api/version", (c) => c.json({ version: "1.0.0" }));

// Protected — echoes the authenticated identity injected by Access.
app.get("/api/me", (c) =>
  c.json({
    email: c.get("userEmail"),
    sub: c.get("userSub")
  })
);

export default app;
