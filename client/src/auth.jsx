import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, setOnExpired } from "./api.js";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, policy: { passwordMinLength: 10 }, ready: false });
  const navigate = useNavigate();

  useEffect(() => {
    api("/auth/me")
      .then((d) => setState({ user: d.user, policy: d.policy, ready: true }))
      .catch(() => setState((s) => ({ ...s, user: null, ready: true })));
  }, []);

  useEffect(() => {
    setOnExpired(() => {
      setState((s) => ({ ...s, user: null }));
      // On the sign-in pages an old cookie is simply ignored; elsewhere, explain why the user was signed out.
      if (!/^\/(login|forgot|reset-password|session-expired)/.test(window.location.pathname)) navigate("/session-expired", { replace: true });
    });
  }, [navigate]);

  const value = {
    ...state,
    isAdmin: state.user?.role === "Admin",
    async login(email, password) {
      const d = await api("/auth/login", { method: "POST", body: { email, password } });
      setState({ user: d.user, policy: d.policy, ready: true });
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

/** Gate a route on being signed in (and optionally being an admin). */
export function RequireAuth({ admin = false, children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (admin && user.role !== "Admin") return <Navigate to="/home" replace />;
  return children;
}
