import { useState, useEffect, useCallback } from "react";

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  email?: string;
  sub?: string;
  redirected?: boolean;
  redirectUrl?: string;
  status?: number;
  error?: string;
  cookieVisibleToJs: boolean;
}

export function AuthStatus() {
  const [auth, setAuth] = useState<AuthState>({
    loading: true,
    authenticated: false,
    cookieVisibleToJs: false
  });

  const checkAuth = useCallback(async () => {
    setAuth((prev) => ({ ...prev, loading: true }));

    const cookieVisibleToJs = document.cookie.includes("CF_Authorization");

    try {
      const res = await fetch("/api/me");
      const contentType = res.headers.get("content-type") ?? "";

      if (res.ok && contentType.includes("application/json")) {
        const data = (await res.json()) as { email: string; sub: string };
        setAuth({
          loading: false,
          authenticated: true,
          email: data.email,
          sub: data.sub,
          redirected: res.redirected,
          redirectUrl: res.redirected ? res.url : undefined,
          status: res.status,
          cookieVisibleToJs
        });
      } else {
        setAuth({
          loading: false,
          authenticated: false,
          redirected: res.redirected,
          redirectUrl: res.redirected ? res.url : undefined,
          status: res.status,
          cookieVisibleToJs
        });
      }
    } catch (err) {
      setAuth({
        loading: false,
        authenticated: false,
        error: String(err),
        cookieVisibleToJs
      });
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const handleLogin = () => {
    window.location.href = "/_auth/login?redirect=" + encodeURIComponent(window.location.pathname);
  };

  return (
    <section data-testid="auth-status">
      <h2>Authentication Status</h2>

      {auth.loading ?
        <p data-testid="auth-loading">Checking authentication...</p>
      : auth.authenticated ?
        <>
          <span className="auth-badge authenticated" data-testid="auth-badge">
            Authenticated
          </span>
          <p className="auth-detail">
            Email: <code data-testid="auth-email">{auth.email}</code>
          </p>
          <p className="auth-detail">
            Sub: <code data-testid="auth-sub">{auth.sub}</code>
          </p>
          <p className="auth-detail">
            CF_Authorization cookie visible to JS:{" "}
            <code data-testid="cookie-visible">
              {auth.cookieVisibleToJs ? "yes" : "no (HttpOnly)"}
            </code>
          </p>
          {auth.redirected && (
            <p className="auth-detail">
              Note: /api/me response was redirected to <code>{auth.redirectUrl}</code>
            </p>
          )}
          <div className="btn-group">
            <button onClick={() => void checkAuth()}>Refresh</button>
          </div>
        </>
      : <>
          <span className="auth-badge unauthenticated" data-testid="auth-badge">
            Not Authenticated
          </span>
          {auth.status !== undefined && (
            <p className="auth-detail">
              /api/me returned: <code data-testid="auth-status-code">{auth.status}</code>
              {auth.redirected && (
                <>
                  {" "}
                  (redirected to <code>{auth.redirectUrl}</code>)
                </>
              )}
            </p>
          )}
          {auth.error && (
            <p className="auth-detail">
              Error: <code data-testid="auth-error">{auth.error}</code>
            </p>
          )}
          <p className="auth-detail">
            CF_Authorization cookie visible to JS:{" "}
            <code data-testid="cookie-visible">{auth.cookieVisibleToJs ? "yes" : "no"}</code>
          </p>
          <div className="btn-group">
            <button className="primary" onClick={handleLogin} data-testid="login-button">
              Log In
            </button>
            <button onClick={() => void checkAuth()}>Retry</button>
          </div>
        </>
      }
    </section>
  );
}
