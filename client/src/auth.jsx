import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { CloudOff, RefreshCw } from "lucide-react";
import { api, setOnExpired } from "./api.js";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);
const PUBLIC = /^\/(login|forgot|reset-password|session-expired)/;

export function AuthProvider({ children }) {
  // offline: the server could not be reached while checking the session (it is NOT treated as signed out).
  const [state, setState] = useState({ user: null, policy: { passwordMinLength: 10 }, ready: false, offline: false });
  const navigate = useNavigate();

  const check = useCallback(async (attempt = 0) => {
    try {
      const d = await api("/auth/me");
      setState({ user: d.user, policy: d.policy, ready: true, offline: false });
    } catch (e) {
      // 401 = genuinely not signed in. No answer or a server error = keep trying, do not sign out.
      if (e.status === 401) return setState((s) => ({ ...s, user: null, ready: true, offline: false }));
      if (attempt < 2) return setTimeout(() => check(attempt + 1), 1500 * (attempt + 1));
      setState((s) => ({ ...s, ready: true, offline: true }));
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    setOnExpired((message) => {
      setState((s) => ({ ...s, user: null }));
      // On the sign-in pages an old cookie is simply ignored; elsewhere, explain why the user was signed out.
      if (!PUBLIC.test(window.location.pathname)) navigate("/session-expired", { replace: true, state: { message } });
    });
  }, [navigate]);

  const value = {
    ...state,
    isAdmin: state.user?.role === "Admin",
    // One quiet attempt; the "can't reach" screen stays up until it succeeds (no blank flash).
    retry: () => check(2),
    async login(email, password) {
      const d = await api("/auth/login", { method: "POST", body: { email, password } });
      setState({ user: d.user, policy: d.policy, ready: true, offline: false });
      return d.user;
    },
    async logout() {
      await api("/auth/logout", { method: "POST" }).catch(() => {});
      setState((s) => ({ ...s, user: null }));
      navigate("/login");
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/** Shown instead of the sign-in page when the server cannot be reached. */
function Unreachable({ onRetry }) {
  useEffect(() => {
    const t = setInterval(onRetry, 10_000); // keep trying in the background
    return () => clearInterval(t);
  }, [onRetry]);
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-canvas">
      <div className="card max-w-md w-full p-8 text-center">
        <span className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
          <CloudOff className="w-7 h-7" />
        </span>
        <h1 className="text-lg font-semibold text-slate-900">Can't reach Sales Hub</h1>
        <p className="mt-2 text-sm text-slate-500">The server is not answering. You have not been signed out: this page reconnects by itself as soon as it is back.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Try again
        </button>
      </div>
    </div>
  );
}

/** Gate a route on being signed in (and optionally being an admin). */
export function RequireAuth({ admin = false, children }) {
  const { user, ready, offline, retry } = useAuth();
  const loc = useLocation();
  if (!ready) return null;
  if (offline) return <Unreachable onRetry={retry} />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (admin && user.role !== "Admin") return <Navigate to="/home" replace />;
  return children;
}
