import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  ChevronRight,
  FolderKanban,
  KeyRound,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  Store,
  Sun,
} from "lucide-react";
import { useAuth } from "../auth.jsx";
import { api, extraWhere } from "../api.js";
import { THEMES, useApplyTheme, useTheme } from "../theme.js";
import { initials } from "./ui.jsx";
import logo from "../assets/logo.png";

const MOBILE = 768;
const WIDE = 1100;

/** Menu sections. `prefix` keeps a section highlighted on its detail pages. */
function useMenu() {
  const { isAdmin } = useAuth();
  const menu = [
    {
      key: "catalogue",
      label: "Catalogue",
      icon: Store,
      prefix: "/product/",
      items: [
        { label: "Home", path: "/home" },
        { label: "All products", path: "/search" },
      ],
    },
  ];
  if (isAdmin)
    menu.push(
      {
        key: "content",
        label: "Content",
        icon: FolderKanban,
        prefix: "/admin/products/",
        items: [
          { label: "Products", path: "/admin/products" },
          { label: "Categories", path: "/admin/categories" },
          { label: "Files", path: "/admin/files" },
        ],
      },
      {
        key: "insights",
        label: "Insights",
        icon: BarChart3,
        items: [
          { label: "Dashboard", path: "/admin" },
          { label: "Reports", path: "/admin/reports" },
          { label: "Activity log", path: "/admin/audit" },
        ],
      },
      {
        key: "admin",
        label: "Administration",
        icon: Settings2,
        items: [
          { label: "Users", path: "/admin/users" },
          { label: "Settings", path: "/admin/settings" },
        ],
      },
    );
  return menu;
}

/** App shell from QMAS: top bar, collapsible sidebar, scrolling content area. */
export default function Layout({ children }) {
  useApplyTheme();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE);
  const [expanded, setExpanded] = useState(() => window.innerWidth >= WIDE);
  useEffect(() => {
    const onResize = () => {
      const m = window.innerWidth < MOBILE;
      setIsMobile(m);
      if (m) setExpanded(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const toggle = useCallback(() => setExpanded((e) => !e), []);
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col h-screen">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar expanded={expanded} onToggle={toggle} isMobile={isMobile} />
        <main className={`flex-1 overflow-auto transition-all duration-300 ${isMobile ? "ml-0" : expanded ? "ml-64" : "ml-[56px]"}`}>
          <div key={pathname} className="animate-page min-h-full">
            {children || <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ---------- sidebar ---------- */
const PALETTE = [
  { iconBg: "bg-blue-100", iconText: "text-blue-600", activeIconBg: "bg-blue-600", activeBg: "bg-blue-50", activeText: "text-blue-700", dot: "bg-blue-500", border: "border-l-blue-500" },
  { iconBg: "bg-emerald-100", iconText: "text-emerald-600", activeIconBg: "bg-emerald-600", activeBg: "bg-emerald-50", activeText: "text-emerald-700", dot: "bg-emerald-500", border: "border-l-emerald-500" },
  { iconBg: "bg-violet-100", iconText: "text-violet-600", activeIconBg: "bg-violet-600", activeBg: "bg-violet-50", activeText: "text-violet-700", dot: "bg-violet-500", border: "border-l-violet-500" },
  { iconBg: "bg-orange-100", iconText: "text-orange-600", activeIconBg: "bg-orange-600", activeBg: "bg-orange-50", activeText: "text-orange-700", dot: "bg-orange-500", border: "border-l-orange-500" },
];

function Sidebar({ expanded, onToggle, isMobile }) {
  const menu = useMenu();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => Object.fromEntries(menu.map((m) => [m.key, true])));
  const showLabels = expanded || isMobile;

  useEffect(() => {
    if (isMobile && expanded) onToggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleSection = (key) => {
    if (!showLabels) return onToggle();
    setOpen((o) => ({ ...o, [key]: !o[key] }));
  };

  return (
    <>
      {isMobile && expanded && <div className="fixed inset-0 top-16 bg-slate-900/40 z-30 backdrop-blur-sm" onClick={onToggle} />}
      {isMobile && !expanded && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Open menu"
          className="fixed top-[72px] left-3 z-30 w-10 h-10 flex items-center justify-center bg-white text-slate-600 rounded-xl shadow-md border border-slate-200"
        >
          <Menu className="w-4 h-4" />
        </button>
      )}
      <aside
        aria-label="Main navigation"
        className={`fixed top-16 left-0 h-[calc(100vh-64px)] z-40 flex flex-col bg-white border-r border-slate-100 shadow-sm transition-all duration-300 select-none ${
          isMobile ? (expanded ? "w-72 translate-x-0 shadow-xl" : "w-72 -translate-x-full") : expanded ? "w-64" : "w-[56px]"
        }`}
      >
        <div className={`flex items-center h-12 px-2.5 border-b border-slate-100 shrink-0 ${showLabels ? "justify-between" : "justify-center"}`}>
          {showLabels && <span className="text-xs font-medium text-slate-500 px-1">Navigation</span>}
          <button
            type="button"
            onClick={onToggle}
            aria-label={showLabels ? "Collapse menu" : "Expand menu"}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            {showLabels ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-0.5">
          {menu.map((section, idx) => {
            const color = PALETTE[idx % PALETTE.length];
            const Icon = section.icon;
            const active = section.items.some((i) => i.path === pathname) || (section.prefix && pathname.startsWith(section.prefix));
            const isOpen = !!open[section.key];
            return (
              <div key={section.key}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  title={showLabels ? undefined : section.label}
                  aria-expanded={isOpen}
                  className={`relative w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border-l-2 ${
                    active ? `${color.activeBg} ${color.activeText} ${color.border} font-semibold` : "border-l-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${active ? `${color.activeIconBg} text-white shadow-sm` : `${color.iconBg} ${color.iconText}`}`}>
                    <Icon className="w-[15px] h-[15px]" />
                  </span>
                  {showLabels && (
                    <>
                      <span className="flex-1 text-left truncate text-[13px]">{section.label}</span>
                      <ChevronRight className={`w-3.5 h-3.5 text-slate-300 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </>
                  )}
                  {!showLabels && active && <span className={`absolute right-1 top-1 w-1.5 h-1.5 rounded-full ${color.dot}`} />}
                </button>
                {showLabels && isOpen && (
                  <div className="mt-0.5 ml-[14px] pl-3 border-l-2 border-slate-100 pb-1.5">
                    {section.items.map((item) => {
                      const on = item.path === pathname;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          aria-current={on ? "page" : undefined}
                          className={`flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[12.5px] font-medium transition-all group ${
                            on ? `${color.activeBg} ${color.activeText} font-semibold` : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${on ? `${color.dot} scale-125` : "bg-slate-300 group-hover:bg-slate-400"}`} />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        {showLabels && <p className="shrink-0 border-t border-slate-100 px-3 py-2 text-[10px] text-slate-300 text-center">Sales Hub · Western Refrigeration</p>}
      </aside>
    </>
  );
}

/* ---------- top bar ---------- */
function Navbar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 bg-white h-16 flex items-center gap-3 px-4 border-b border-slate-200/80">
      <span className="bg-wrl absolute top-0 inset-x-0 h-[3px]" aria-hidden="true" />
      <Link to="/" className="flex items-center gap-3 min-w-0 shrink-0">
        <img src={logo} alt="Western Refrigeration" className="h-10 w-auto" />
        <div className="hidden xl:block leading-tight">
          <div className="text-lg font-bold text-blue-800 tracking-wide">Sales Hub</div>
          <div className="text-[11px] text-slate-400">Specs, files, pitches &amp; battlecards</div>
        </div>
      </Link>

      <SearchBar />

      <div className="ml-auto flex items-center">
        <ThemeButton />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50 cursor-pointer"
          >
            <span className="w-10 h-10 bg-blue-800 rounded-full flex items-center justify-center text-sm font-semibold text-white">{initials(user?.name)}</span>
            <span className="hidden lg:block text-left">
              <span className="block text-sm font-semibold text-slate-800">{user?.name}</span>
              <span className="block text-xs text-slate-400">
                {user?.role}
                {user?.region ? ` · ${user.region}` : ""}
              </span>
            </span>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div role="menu" className="animate-fadeIn absolute right-0 mt-2 w-72 z-50 card shadow-xl p-2">
                <div className="px-3 py-2 border-b border-slate-100 mb-1">
                  <div className="text-sm font-semibold text-slate-800">{user?.name}</div>
                  <div className="text-xs text-slate-400">{user?.email}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    {user?.role}
                    {user?.team ? <span className="text-slate-400"> · {user.team}</span> : null}
                  </div>
                </div>
                <ThemeChoice />
                <Link
                  role="menuitem"
                  to="/account"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                >
                  <KeyRound className="w-4 h-4 text-slate-400" /> My account &amp; password
                </Link>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };

function ThemeButton() {
  const [, setChoice, resolved] = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  const Icon = resolved === "dark" ? Sun : Moon;
  return (
    <button type="button" onClick={() => setChoice(next)} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`} className="p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
      <Icon className="w-5 h-5 text-slate-600" />
    </button>
  );
}

function ThemeChoice() {
  const [choice, setChoice] = useTheme();
  return (
    <div className="px-3 py-2">
      <p className="mb-1.5 text-[11px] font-medium text-slate-500">Appearance</p>
      <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
        {THEMES.map((t) => {
          const Icon = THEME_ICON[t.value];
          const on = choice === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setChoice(t.value)}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${on ? "bg-white text-blue-700 ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Product search in the top bar: suggestions while typing, live results on the search page. */
function SearchBar() {
  const nav = useNavigate();
  const loc = useLocation();
  const [params, setParams] = useSearchParams();
  const onSearchPage = loc.pathname === "/search";
  const [v, setV] = useState(onSearchPage ? params.get("q") || "" : "");
  const [sugg, setSugg] = useState(null);
  const box = useRef();

  useEffect(() => {
    if (!onSearchPage) setV("");
    setSugg(null);
  }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (onSearchPage || !v.trim()) return setSugg(null);
    let live = true;
    const t = setTimeout(() => {
      api("/search?q=" + encodeURIComponent(v.trim()))
        .then((d) => live && setSugg(d.results.slice(0, 5)))
        .catch(() => live && setSugg(null));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [v, onSearchPage]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setSugg(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const submit = () => {
    const qs = new URLSearchParams();
    if (v.trim()) qs.set("q", v.trim());
    if (onSearchPage && params.get("cat")) qs.set("cat", params.get("cat"));
    setSugg(null);
    nav("/search" + (qs.toString() ? "?" + qs : ""), { state: { track: Date.now() } });
  };

  const change = (val) => {
    setV(val);
    if (onSearchPage) {
      const next = new URLSearchParams(params);
      if (val.trim()) next.set("q", val);
      else next.delete("q");
      setParams(next, { replace: true });
    }
  };

  return (
    <div ref={box} className="relative hidden md:block ml-6 w-full max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        type="search"
        placeholder="Search products, specs, pitch, files…"
        aria-label="Search"
        autoComplete="off"
        value={v}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="w-full pl-9 pr-16 py-2 rounded-lg border border-slate-200 bg-canvas text-sm text-slate-800 placeholder-slate-500 outline-none hover:bg-white hover:border-blue-300 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-colors [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-slate-200 bg-white text-slate-500">Enter</kbd>
      {sugg && (
        <div className="animate-fadeIn absolute left-0 right-0 top-full mt-1.5 card shadow-xl overflow-hidden z-50">
          {sugg.length ? (
            sugg.map((x) => (
              <Link key={x.id} to={`/product/${x.id}/pitch`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm hover:bg-blue-50/60 border-b border-slate-100">
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-slate-800">{x.name}</span> <span className="text-xs text-slate-400">{x.category}</span>
                </span>
                <span className="text-[11px] text-slate-400 shrink-0">{extraWhere(x.where).join(", ")}</span>
              </Link>
            ))
          ) : (
            <p className="px-3.5 py-2.5 text-sm text-slate-500">No matches</p>
          )}
          <button type="button" onClick={submit} className="w-full text-left px-3.5 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50/60 cursor-pointer">
            See all results for “{v.trim()}”
          </button>
        </div>
      )}
    </div>
  );
}
