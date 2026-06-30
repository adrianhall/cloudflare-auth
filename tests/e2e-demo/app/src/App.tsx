import { useEffect, useState } from "react";

interface Identity {
  email: string;
  sub: string;
}

/**
 * Minimal SPA for the e2e guard: fetches the authenticated identity from
 * `/api/me` (proving the plugin's injected headers reach the Worker) and
 * renders it. The login form itself is served by `cloudflareAccessPlugin()`,
 * not by this SPA.
 */
function App() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`/api/me returned ${res.status}`);
        }
        return (await res.json()) as Identity;
      })
      .then((data) => {
        if (!cancelled) {
          setIdentity(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Cloudflare Access + Vite (e2e fixture)</h1>

      <section aria-labelledby="identity-heading">
        <h2 id="identity-heading">Your identity</h2>
        {loading && <p>Loading identity…</p>}
        {error && <p role="alert">Could not load identity: {error}</p>}
        {identity && (
          <dl>
            <dt>Email</dt>
            <dd data-testid="identity-email">{identity.email}</dd>
            <dt>Subject</dt>
            <dd data-testid="identity-sub">{identity.sub}</dd>
          </dl>
        )}
      </section>

      <nav>
        <a href="/cdn-cgi/access/login">Switch identity</a>
        <a href="/cdn-cgi/access/logout">Log out</a>
      </nav>
    </main>
  );
}

export default App;
