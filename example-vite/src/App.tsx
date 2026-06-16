import { useEffect, useState } from "react";
import "./App.css";

interface Identity {
  email: string;
  sub: string;
}

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
    <main className="container">
      <h1>Cloudflare Access + Vite</h1>
      <p className="subtitle">
        This SPA is gated by <code>cloudflareAccessPlugin()</code> in development and by real
        Cloudflare Access in production. The Worker only runs <code>cloudflareAccess()</code>.
      </p>

      <section aria-labelledby="identity-heading" className="card">
        <h2 id="identity-heading">Your identity</h2>
        {loading && <p>Loading identity…</p>}
        {error && (
          <p role="alert" className="error">
            Could not load identity: {error}
          </p>
        )}
        {identity && (
          <dl>
            <dt>Email</dt>
            <dd data-testid="identity-email">{identity.email}</dd>
            <dt>Subject</dt>
            <dd data-testid="identity-sub">{identity.sub}</dd>
          </dl>
        )}
      </section>

      <nav className="actions">
        <a className="button" href="/cdn-cgi/access/login">
          Switch identity
        </a>
        <a className="button secondary" href="/cdn-cgi/access/logout">
          Log out
        </a>
      </nav>
    </main>
  );
}

export default App;
