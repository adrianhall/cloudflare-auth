/**
 * Diagnostic Hono worker for cloudflare-auth.
 *
 * Every request is logged with full headers, cookie state, and auth
 * decisions so you can see exactly what is happening in the terminal.
 *
 * See docs/MANUAL_TESTS.md for the experiment matrix.
 */
import { Hono } from "hono";
import {
  developerAuthentication,
  cloudflareAccess,
  parseCookie,
  verifyDevJwt,
  JWT_HEADER,
  EMAIL_HEADER,
  USER_HEADER,
  COOKIE_NAME,
  type AuthVariables,
  type PathPolicy
} from "@adrianhall/cloudflare-auth";
import { createVerboseLogger } from "./verbose-logger.js";

// ---------------------------------------------------------------------------
// Types – defined manually to avoid @cloudflare/workers-types collisions
// with DOM types in the React client code.
// ---------------------------------------------------------------------------

interface CloudflareAssets {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
}

type AppBindings = {
  CLOUDFLARE_TEAM_DOMAIN: string;
  ASSETS: CloudflareAssets;
};

type AppEnv = {
  Bindings: AppBindings;
  Variables: AuthVariables;
};

// ---------------------------------------------------------------------------
// Auth policies – shared by both middleware (SKILL.md Rule #2)
// ---------------------------------------------------------------------------

const authPolicies: PathPolicy[] = [
  { pattern: /^\/api\/version$/, authenticate: false },
  { pattern: /^\/api\/public\//, authenticate: false },
  { pattern: /^\/api\/debug/, authenticate: false },
  { pattern: /^\/api\//, authenticate: true }
  // NOTE: /_auth/* is intentionally absent (SKILL.md Rule #3)
];

// ---------------------------------------------------------------------------
// Loggers
// ---------------------------------------------------------------------------

const devAuthLogger = createVerboseLogger("dev-auth");
const cfAccessLogger = createVerboseLogger("cf-access");

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// 1) Request logging middleware – runs BEFORE auth so we see the raw request
// ---------------------------------------------------------------------------

app.use("*", async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const url = c.req.url;
  const path = new URL(url).pathname;

  const separator = "=".repeat(60);
  const thin = "-".repeat(60);

  console.log(`\n${separator}`);
  console.log(`[REQ] ${method} ${path}`);
  console.log(thin);

  // Dump all headers
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((v, k) => {
    headers[k] = v;
  });
  console.log("Headers:", JSON.stringify(headers, null, 2));

  // Cookie state
  const cookieHeader = c.req.header("cookie");
  const cfAuthToken = parseCookie(cookieHeader);
  console.log(`Cookie header: ${cookieHeader ? "present" : "absent"}`);
  console.log(
    `  ${COOKIE_NAME}: ${cfAuthToken ? "present (" + cfAuthToken.substring(0, 20) + "...)" : "absent"}`
  );

  // JWT header state
  const jwtHeader = c.req.header(JWT_HEADER);
  console.log(
    `${JWT_HEADER}: ${jwtHeader ? "present (" + jwtHeader.substring(0, 20) + "...)" : "absent"}`
  );

  // Sec-Fetch-Mode (helps diagnose navigation vs. fetch requests)
  const fetchMode = c.req.header("sec-fetch-mode");
  console.log(`sec-fetch-mode: ${fetchMode ?? "absent"}`);

  console.log(thin);

  await next();

  const duration = Date.now() - start;
  console.log(`[RES] ${method} ${path} -> ${c.res.status} (${duration}ms)`);
  console.log(`${separator}\n`);
});

// ---------------------------------------------------------------------------
// 2) Auth middleware – developerAuthentication FIRST (SKILL.md Rule #1)
// ---------------------------------------------------------------------------

app.use(developerAuthentication({ policies: authPolicies, logger: devAuthLogger }));
app.use(cloudflareAccess({ policies: authPolicies, logger: cfAccessLogger }));

// ---------------------------------------------------------------------------
// 3) Public routes
// ---------------------------------------------------------------------------

app.get("/api/version", (c) => {
  console.log("  [handler] GET /api/version (public)");
  return c.json({
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    note: "This endpoint requires no authentication."
  });
});

app.get("/api/public/info", (c) => {
  console.log("  [handler] GET /api/public/info (public)");
  return c.json({
    message: "This is a public endpoint.",
    method: c.req.method,
    path: c.req.path,
    timestamp: new Date().toISOString()
  });
});

app.post("/api/public/echo", async (c) => {
  console.log("  [handler] POST /api/public/echo (public)");
  let body: unknown = null;
  try {
    body = await c.req.json();
  } catch {
    body = await c.req.text();
  }
  return c.json({
    echo: body,
    timestamp: new Date().toISOString()
  });
});

// ---------------------------------------------------------------------------
// 4) Protected routes
// ---------------------------------------------------------------------------

app.get("/api/me", (c) => {
  console.log("  [handler] GET /api/me (protected)");
  return c.json({
    email: c.get("userEmail"),
    sub: c.get("userSub"),
    timestamp: new Date().toISOString()
  });
});

app.post("/api/echo", async (c) => {
  console.log("  [handler] POST /api/echo (protected)");
  let body: unknown = null;
  try {
    body = await c.req.json();
  } catch {
    body = await c.req.text();
  }
  return c.json({
    echo: body,
    user: {
      email: c.get("userEmail"),
      sub: c.get("userSub")
    },
    timestamp: new Date().toISOString()
  });
});

// ---------------------------------------------------------------------------
// 5) Debug routes – public, but show full auth state
// ---------------------------------------------------------------------------

app.all("/api/debug", async (c) => {
  console.log(`  [handler] ${c.req.method} /api/debug (public debug)`);

  // Collect all headers
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((v, k) => {
    headers[k] = v;
  });

  // Try to read body for non-GET methods
  let body: unknown = null;
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    try {
      const text = await c.req.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    } catch {
      body = null;
    }
  }

  // --- Middleware-set values ---
  // These will be null on public routes (authenticate: false) because
  // the middleware correctly skips auth processing for those paths.
  const middlewareAuth = {
    [JWT_HEADER]: c.req.header(JWT_HEADER) ? "present" : "absent",
    [EMAIL_HEADER]: c.req.header(EMAIL_HEADER) ?? null,
    [USER_HEADER]: c.req.header(USER_HEADER) ?? null,
    contextEmail: c.get("userEmail") ?? null,
    contextSub: c.get("userSub") ?? null
  };

  // --- Raw token inspection ---
  // Reads the cookie/header directly and decodes the JWT without going
  // through the middleware.  This shows the real auth state even on
  // public endpoints where the middleware skips processing.
  const rawToken = c.req.header(JWT_HEADER) || parseCookie(c.req.header("cookie"));
  let tokenInfo: Record<string, unknown> = { present: false };
  if (rawToken) {
    const verified = await verifyDevJwt(rawToken);
    if (verified) {
      tokenInfo = { present: true, valid: true, email: verified.email, sub: verified.sub };
    } else {
      tokenInfo = {
        present: true,
        valid: false,
        note: "Not a valid dev token (may be a production CF Access token)"
      };
    }
  }

  return c.json({
    request: {
      method: c.req.method,
      url: c.req.url,
      path: new URL(c.req.url).pathname,
      headers
    },
    cookies: {
      raw: c.req.header("cookie") ?? null,
      [COOKIE_NAME]: parseCookie(c.req.header("cookie")) ? "present" : "absent"
    },
    middlewareAuth,
    rawToken: tokenInfo,
    note: "middlewareAuth values are null on public endpoints (authenticate: false) — this is correct. Check rawToken for the actual auth state.",
    body,
    timestamp: new Date().toISOString()
  });
});

// ---------------------------------------------------------------------------
// 6) Catch-all – serve static assets via the ASSETS binding
// ---------------------------------------------------------------------------

app.get("*", (c) => {
  console.log(`  [assets] Proxying to ASSETS binding: ${c.req.path}`);
  return c.env.ASSETS.fetch(c.req.raw);
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default app;
