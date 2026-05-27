import { useState } from "react";
import { ResponseDisplay, type TestResponse } from "./ResponseDisplay.js";

// ---------------------------------------------------------------------------
// Test-case definitions
// ---------------------------------------------------------------------------

interface TestCase {
  id: string;
  method: string;
  path: string;
  auth: "public" | "protected";
  description: string;
  body?: unknown;
}

const TEST_CASES: TestCase[] = [
  {
    id: "public-get-version",
    method: "GET",
    path: "/api/version",
    auth: "public",
    description: "Public GET — smoke test, returns version info"
  },
  {
    id: "public-get-info",
    method: "GET",
    path: "/api/public/info",
    auth: "public",
    description: "Public GET — returns request metadata"
  },
  {
    id: "public-post-echo",
    method: "POST",
    path: "/api/public/echo",
    auth: "public",
    body: { message: "hello from the diagnostic app" },
    description: "Public POST — echoes JSON body back"
  },
  {
    id: "protected-get-me",
    method: "GET",
    path: "/api/me",
    auth: "protected",
    description: "Protected GET — returns authenticated user info"
  },
  {
    id: "protected-post-echo",
    method: "POST",
    path: "/api/echo",
    auth: "protected",
    body: { message: "authenticated echo" },
    description: "Protected POST — echoes body with user info"
  },
  {
    id: "debug-get",
    method: "GET",
    path: "/api/debug",
    auth: "public",
    description:
      "Debug GET — shows full server-side view of the request (headers, cookies, auth state)"
  },
  {
    id: "debug-post",
    method: "POST",
    path: "/api/debug",
    auth: "public",
    body: { test: true, purpose: "diagnostic" },
    description: "Debug POST — same as above but for POST requests"
  }
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface TestResult {
  loading: boolean;
  response?: TestResponse;
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EndpointTester() {
  const [results, setResults] = useState<Record<string, TestResult>>({});

  const runTest = async (tc: TestCase) => {
    setResults((prev) => ({
      ...prev,
      [tc.id]: { loading: true }
    }));

    const start = performance.now();

    try {
      const init: RequestInit = { method: tc.method };
      if (tc.body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(tc.body);
      }

      const res = await fetch(tc.path, init);
      const durationMs = Math.round(performance.now() - start);

      // Collect response headers
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });

      const body = await res.text();

      setResults((prev) => ({
        ...prev,
        [tc.id]: {
          loading: false,
          response: {
            status: res.status,
            statusText: res.statusText,
            headers,
            body,
            redirected: res.redirected,
            url: res.url,
            durationMs
          }
        }
      }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [tc.id]: {
          loading: false,
          error: String(err)
        }
      }));
    }
  };

  const runAll = async () => {
    for (const tc of TEST_CASES) {
      await runTest(tc);
    }
  };

  return (
    <section data-testid="endpoint-tester">
      <h2>Endpoint Tester</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Run individual tests or all at once. Check the terminal for detailed worker logs.
      </p>

      <div className="btn-group" style={{ marginBottom: "1rem" }}>
        <button className="primary" onClick={() => void runAll()} data-testid="run-all">
          Run All Tests
        </button>
      </div>

      {TEST_CASES.map((tc) => {
        const result = results[tc.id];
        return (
          <div key={tc.id} className="test-case" data-testid={`test-case-${tc.id}`}>
            <div className="test-case-header">
              <span className={`method-badge ${tc.method.toLowerCase()}`}>{tc.method}</span>
              <span className="test-path">{tc.path}</span>
              <span className={`test-auth ${tc.auth}`}>{tc.auth}</span>
              <button
                onClick={() => void runTest(tc)}
                disabled={result?.loading}
                data-testid={`run-${tc.id}`}
              >
                {result?.loading ? "Running..." : "Run"}
              </button>
            </div>

            <div className="test-case-body">
              <p
                style={{
                  margin: "0 0 0.5rem",
                  fontSize: "0.85rem",
                  color: "var(--text-muted)"
                }}
              >
                {tc.description}
              </p>

              {result?.error && (
                <pre
                  style={{ color: "var(--danger)", fontSize: "0.85rem" }}
                  data-testid={`error-${tc.id}`}
                >
                  Error: {result.error}
                </pre>
              )}

              {result?.response && (
                <ResponseDisplay
                  method={tc.method}
                  path={tc.path}
                  requestBody={tc.body}
                  response={result.response}
                />
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
