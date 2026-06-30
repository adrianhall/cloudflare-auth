import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { cloudflareAccessPlugin } from "@adrianhall/cloudflare-auth/vite";

import { authPolicies, devUsers } from "./shared/policies";

// `cloudflareAccessPlugin()` MUST come before `cloudflare()` so its connect
// middleware can inject the Cloudflare Access headers onto `req.rawHeaders`
// before the request is dispatched into the Worker runtime. In production
// there is no plugin — real Cloudflare Access does this at the edge — and the
// Worker code is unchanged.
export default defineConfig({
  plugins: [
    cloudflareAccessPlugin({ policies: authPolicies, users: devUsers }),
    cloudflare(),
    react()
  ]
});
