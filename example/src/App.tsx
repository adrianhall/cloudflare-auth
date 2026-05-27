import { AuthStatus } from "./components/AuthStatus.js";
import { EndpointTester } from "./components/EndpointTester.js";
import "./App.css";

export function App() {
  return (
    <div className="app" data-testid="app">
      <header className="app-header">
        <h1>cloudflare-auth diagnostic</h1>
        <p>
          Test authentication middleware behaviour across different wrangler configurations. See{" "}
          <code>docs/MANUAL_TESTS.md</code> for the full experiment matrix.
        </p>
      </header>

      <main>
        <AuthStatus />
        <EndpointTester />
      </main>

      <footer className="app-footer">
        <p>
          Page loaded at <time data-testid="page-load-time">{new Date().toISOString()}</time>
        </p>
      </footer>
    </div>
  );
}
