// UI primitives in the QMAS design system (Tailwind v4 + lucide icons).
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { AlertTriangle, ChevronRight, Home as HomeIcon, ImageOff, Inbox, Loader2, X } from "lucide-react";
import { api } from "../api.js";

/* ---------- toasts (pages call toast.success / toast.error from react-hot-toast) ---------- */
export { toast };

export function ToastProvider({ children }) {
  useEffect(() => {
    const off = () => toast.error("You are offline. Changes cannot be saved until you reconnect.");
    const on = () => toast.success("Back online");
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
    };
  }, []);
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          className: "!font-sans !text-sm !rounded-xl !shadow-lift !ring-1 !ring-slate-900/10",
          duration: 3000,
        }}
      />
    </>
  );
}

/* ---------- buttons and badges ---------- */
const BTN_VARIANTS = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  "danger-soft": "bg-white text-rose-600 border border-rose-200 hover:bg-rose-50",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
};
const BTN_SIZES = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-lg",
  md: "px-4 py-2 text-sm gap-2 rounded-lg",
  lg: "px-5 py-3 text-sm gap-2 rounded-lg",
};
export const btnCls = (variant = "primary", size = "md") =>
  `inline-flex items-center justify-center font-semibold transition-all duration-150 cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${BTN_VARIANTS[variant]} ${BTN_SIZES[size]}`;

/** Button; `loading` disables it and shows a spinner. `to` renders a router Link, `href` a plain link. */
export function Button({ variant = "primary", size = "md", icon: Icon, loading = false, className = "", children, type = "button", to, href, ...props }) {
  const inner = (
    <>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon && <Icon className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />}
      {children}
    </>
  );
  const cls = `${btnCls(variant, size)} ${className}`;
  if (to)
    return (
      <Link to={to} className={cls} {...props}>
        {inner}
      </Link>
    );
  if (href)
    return (
      <a href={href} className={cls} {...props}>
        {inner}
      </a>
    );
  return (
    <button type={type} disabled={loading || props.disabled} className={cls} {...props}>
      {inner}
    </button>
  );
}

/** A label wrapping a hidden file input, styled as a button. */
export function FileButton({ variant = "secondary", size = "sm", icon: Icon, children, onFiles, multiple, disabled, busy }) {
  return (
    <label className={`${btnCls(variant, size)} ${disabled || busy ? "opacity-50 pointer-events-none" : ""}`}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
      <input
        type="file"
        hidden
        multiple={multiple}
        disabled={disabled || busy}
        onChange={(e) => {
          const files = [...e.target.files];
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </label>
  );
}

const BADGE = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
};
const DOT = { success: "bg-emerald-500", warning: "bg-amber-500", info: "bg-blue-500", danger: "bg-rose-500", neutral: "bg-slate-400", violet: "bg-violet-500" };

export function Badge({ variant = "neutral", dot = false, children }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-md border ${BADGE[variant]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${DOT[variant]}`} />}
      {children}
    </span>
  );
}
export const StatusBadge = ({ published }) => (
  <Badge variant={published ? "success" : "warning"} dot>
    {published ? "Published" : "Draft"}
  </Badge>
);

/* ---------- form fields ---------- */
export const inputCls =
  "w-full px-3 py-2.5 text-sm rounded-lg border bg-white text-slate-800 placeholder-slate-400 outline-none transition-colors focus:ring-4 disabled:bg-slate-50 disabled:text-slate-400 border-slate-300 hover:border-slate-400 focus:border-blue-500 focus:ring-blue-500/10";

export function Field({ label, hint, error, id, className = "", size, children }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className={`block font-semibold ${size === "lg" ? "text-sm text-slate-800 mb-2" : "text-[11px] text-slate-600 mb-1.5"}`}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
      )}
    </div>
  );
}

export function TextInput({ label, hint, error, className, icon: Icon, trailing, size, ...props }) {
  const id = useId();
  const lg = size === "lg";
  return (
    <Field label={label} hint={hint} error={error} id={id} className={className} size={size}>
      <div className="relative">
        {Icon && <Icon className={`absolute top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none ${lg ? "left-4 w-5 h-5" : "left-3 w-4 h-4"}`} />}
        <input
          id={id}
          className={`${inputCls} ${Icon ? (lg ? "pl-12" : "pl-9") : ""} ${trailing ? "pr-12" : ""} ${lg ? "py-3.5! text-base! rounded-xl!" : ""}`}
          {...props}
        />
        {trailing && <div className="absolute right-3 top-1/2 -translate-y-1/2 flex">{trailing}</div>}
      </div>
    </Field>
  );
}

export function TextArea({ label, hint, className, ...props }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} id={id} className={className}>
      <textarea id={id} className={`${inputCls} min-h-20`} {...props} />
    </Field>
  );
}

/** Native select. options: values, or [value, label] pairs. Without `label` it is a compact filter. */
export function Select({ label, value, onChange, options, className = "", hint, ...props }) {
  const id = useId();
  const control = (
    <select
      id={id}
      aria-label={props["aria-label"] || label}
      disabled={props.disabled}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={label ? `${inputCls} cursor-pointer` : "h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer outline-none focus:border-blue-500"}
    >
      {options.map((o) => {
        const [v, t] = Array.isArray(o) ? o : [o, o];
        return (
          <option key={v} value={v}>
            {t}
          </option>
        );
      })}
    </select>
  );
  return label ? (
    <Field label={label} hint={hint} id={id} className={className}>
      {control}
    </Field>
  ) : (
    control
  );
}

export const FormError = ({ message }) =>
  message ? (
    <p role="alert" className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      {message}
    </p>
  ) : null;

/* ---------- modal ---------- */
export function Modal({ title, subtitle, onClose, children, footer, size = "md" }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const open = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (open[open.length - 1] === ref.current) onClose();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector("input, select, textarea")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const width = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`animate-fadeIn bg-white rounded-xl shadow-lift ring-1 ring-slate-900/10 w-full ${width} max-h-[92vh] overflow-hidden flex flex-col`}>
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6 space-y-4">{children}</div>
        {footer && <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ModalFooter({ onCancel, onSave, saveLabel = "Save", saving, saveVariant = "primary", cancelLabel = "Cancel" }) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel}>
        {cancelLabel}
      </Button>
      {onSave && (
        <Button variant={saveVariant} onClick={onSave} loading={saving}>
          {saveLabel}
        </Button>
      )}
    </>
  );
}

/* ---------- page structure ---------- */
/**
 * Sticky, frosted page header: breadcrumbs, icon chip, title, subtitle and actions (QMAS style).
 * crumbs: [{ label, to? }]
 */
export function PageHeader({ icon: Icon, title, subtitle, crumbs = [], children }) {
  return (
    <div className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-slate-200/80">
      <div className="px-5 pt-2.5 pb-3">
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[11px] text-slate-400 mb-1.5 min-w-0">
            <Link to="/" className="hover:text-blue-600 shrink-0" aria-label="Home">
              <HomeIcon className="w-3 h-3" />
            </Link>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="w-3 h-3 shrink-0 text-slate-300" />
                {c.to ? (
                  <Link to={c.to} className="hover:text-blue-600 truncate">
                    {c.label}
                  </Link>
                ) : (
                  <span className="truncate">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="p-2 rounded-lg bg-blue-50 ring-1 ring-blue-100 shrink-0">
                <Icon className="w-4 h-4 text-blue-700" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-900 leading-tight truncate flex items-center gap-2">{title}</h1>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Page body below the header. */
export const PageBody = ({ children, className = "" }) => <div className={`p-5 space-y-5 ${className}`}>{children}</div>;

/** Segmented tabs. tabs: [{ key, label, to?, count? }]; links when `to` is given. */
export function Tabs({ tabs, active, onChange, className = "" }) {
  return (
    <div role="tablist" className={`no-scrollbar flex gap-1 overflow-x-auto p-1 rounded-lg bg-slate-200/70 w-fit max-w-full ${className}`}>
      {tabs.map((t) => {
        const on = active === t.key;
        const cls = `shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium rounded-md cursor-pointer transition-colors whitespace-nowrap ${
          on ? "bg-white text-blue-800 ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"
        }`;
        const inner = (
          <>
            {t.icon && <t.icon className="w-3.5 h-3.5" />}
            {t.label}
            {t.count != null && (
              <span className={`min-w-5 px-1.5 rounded-full text-[10px] font-bold tabular ${on ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"}`}>{t.count}</span>
            )}
          </>
        );
        return t.to ? (
          <Link key={t.key} role="tab" aria-selected={on} to={t.to} className={cls}>
            {inner}
          </Link>
        ) : (
          <button key={t.key} role="tab" type="button" aria-selected={on} onClick={() => onChange(t.key)} className={cls}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/** Card with an optional title row. */
export function Card({ title, icon: Icon, action, className = "", bodyClass = "p-4", children, tone }) {
  return (
    <section className={`card ${tone === "amber" ? "!bg-amber-50/60 !border-amber-200" : ""} ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <h2 className="section-title flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-blue-600" />}
            {title}
          </h2>
          {action}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

const TONES = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
  violet: "bg-violet-100 text-violet-600",
  rose: "bg-rose-100 text-rose-600",
  sky: "bg-sky-100 text-sky-700",
  slate: "bg-slate-100 text-slate-600",
};
/** QMAS stat card: icon tile, label, big number, optional note. */
export function Kpi({ label, value, icon: Icon, tone = "blue", note }) {
  return (
    <div className="card px-4 py-3">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${TONES[tone]}`}>
            <Icon className="w-5 h-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-600 truncate">{label}</p>
          <p className="text-2xl font-bold tabular text-slate-900 leading-tight">{value ?? "—"}</p>
        </div>
      </div>
      {note && <p className="mt-2 text-[11px] text-slate-500">{note}</p>}
    </div>
  );
}
export const KpiGrid = ({ children }) => <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">{children}</div>;

/** Simple data table inside a card. columns: [{ key, header, render?(row), className?, align? }] */
export function Table({ columns, rows, rowKey = (r) => r.id, empty = "Nothing here yet." }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200">
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-2.5 text-[11px] font-semibold text-slate-500 whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? (
              rows.map((r) => (
                <tr key={rowKey(r)} className="hover:bg-blue-50/40 transition-colors">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-2.5 text-slate-700 ${c.align === "right" ? "text-right whitespace-nowrap" : ""} ${c.className || ""}`}>
                      {c.render ? c.render(r) : r[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length}>
                  <Empty icon={Inbox} title={empty} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, text, children }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <span className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6" />
      </span>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {text && <p className="text-xs text-slate-500 mt-1 max-w-sm">{text}</p>}
      {children && <div className="mt-4 flex gap-2">{children}</div>}
    </div>
  );
}

/* ---------- data loading ---------- */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api(path)
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error) => live && setState({ data: null, error, loading: false }));
    return () => {
      live = false;
    };
  }, [path, n]);
  return {
    ...state,
    reload: () => setN((x) => x + 1),
    setData: (fn) => setState((s) => ({ ...s, data: typeof fn === "function" ? fn(s.data) : fn })),
  };
}

export function Loading({ rows = 3 }) {
  return (
    <div className="space-y-3" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-12" />
      ))}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <span className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        {error?.message || "Something went wrong."}
        {error?.ref ? ` (Reference: ${error.ref})` : ""}
      </span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Dismissible error banner for failed uploads and the like. */
export const Flash = ({ message, onDismiss }) =>
  message ? (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <span className="flex gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        {message}
      </span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="p-0.5 rounded hover:bg-rose-100 cursor-pointer">
        <X className="w-4 h-4" />
      </button>
    </div>
  ) : null;

/** Show a placeholder when a value is empty. */
export const Ph = ({ v, fb }) => (v && String(v).trim() ? v : <span className="text-slate-400 italic">{fb}</span>);

export const SpecRow = ({ a, b }) => (
  <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0 text-sm">
    <span className="text-slate-500">{a}</span>
    <span className="font-semibold text-slate-800 text-right">{b}</span>
  </div>
);

export function ProductImage({ src, alt, className = "h-40" }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <div className={`photo flex items-center justify-center overflow-hidden ${className}`}>
      <img src={src} alt={alt} onError={() => setBroken(true)} className="max-w-full max-h-full object-contain" />
    </div>
  ) : (
    <div className={`rounded-lg bg-slate-100 flex flex-col items-center justify-center gap-1 text-slate-400 ${className}`}>
      <ImageOff className="w-6 h-6" />
      <span className="text-[11px]">No image</span>
    </div>
  );
}

export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
