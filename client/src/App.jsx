import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { RequireAuth, useAuth } from "./auth.jsx";
import Layout from "./components/Layout.jsx";
import { Login, Forgot, ResetPassword, SessionExpired, ErrorPage } from "./pages/Public.jsx";
import Home from "./pages/Home.jsx";
import Search from "./pages/Search.jsx";
import Product from "./pages/Product.jsx";
import Account from "./pages/Account.jsx";
import Dashboard from "./pages/admin/Dashboard.jsx";
import Products from "./pages/admin/Products.jsx";
import ProductEditor from "./pages/admin/ProductEditor.jsx";
import Categories from "./pages/admin/Categories.jsx";
import Files from "./pages/admin/Files.jsx";
import Users from "./pages/admin/Users.jsx";
import Reports from "./pages/admin/Reports.jsx";
import Audit from "./pages/admin/Audit.jsx";
import Settings from "./pages/admin/Settings.jsx";

const TITLES = [
  [/^\/admin/, "Admin"],
  [/^\/product/, "Product"],
  [/^\/search/, "Search"],
  [/^\/home/, "Home"],
  [/^\/account/, "My account"],
];

function Root() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "Admin" ? "/admin" : "/home"} replace />;
}

export default function App() {
  const loc = useLocation();
  useEffect(() => {
    const t = TITLES.find(([re]) => re.test(loc.pathname));
    document.title = "Western Sales Hub – " + (t ? t[1] : "Sign in");
  }, [loc.pathname]);

  return (
    <Routes>
      <Route path="/" element={<Root />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/session-expired" element={<SessionExpired />} />
      <Route path="/error" element={<ErrorPage />} />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/home" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/product/:id" element={<Product />} />
        <Route path="/product/:id/:tab" element={<Product />} />
        <Route path="/account" element={<Account />} />
      </Route>

      <Route path="/admin" element={<RequireAuth admin><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="products/:id" element={<ProductEditor />} />
        <Route path="products/:id/:tab" element={<ProductEditor />} />
        <Route path="categories" element={<Categories />} />
        <Route path="files" element={<Files />} />
        <Route path="users" element={<Users />} />
        <Route path="reports" element={<Reports />} />
        <Route path="audit" element={<Audit />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Root />} />
    </Routes>
  );
}
