import { Fragment, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileDown,
  FolderKanban,
  History,
  LogIn,
  LogOut,
  Search,
  Settings2,
  ShieldAlert,
  UserCog,
  X,
} from "lucide-react";
import { Badge, Button, Empty, ErrorBox, Loading, PageBody, PageHeader, Select, Tabs, initials, useApi } from "../../components/ui.jsx";

const CATS = [
  { key: "", label: "All activity", icon: History },
  { key: "auth", label: "Sign-ins & sessions", icon: LogIn },
  { key: "content", label: "Content changes", icon: FolderKanban },
  { key: "download", label: "Downloads", icon: Download },
  { key: "usage", label: "Views & searches", icon: Eye },
  { key: "users", label: "User admin", icon: UserCog },
  { key: "settings", label: "Settings", icon: Settings2 },
];

/** Badge colour and icon for an action. */
function look(a) {
  if (/failed|locked|deactivated|deleted|unpublished|timed out/i.test(a.action)) return { variant: "danger", icon: a.action === "Session timed out" ? LogOut : ShieldAlert };
  if (a.action === "Signed in") return { variant: "success", icon: LogIn };
  if (a.action === "Signed out") return { variant: "neutral", icon: LogOut };
  if (a.category === "download") return { variant: "violet", icon: Download };
  if (a.category === "usage") return { variant: "neutral", icon: a.action === "Searched" ? Search : Eye };
  if (/published|added|activated|created|imported|uploaded/i.test(a.action)) return { variant: "success", icon: FolderKanban };
  if (a.category === "auth") return { variant: "warning", icon: ShieldAlert };
  return { variant: "info", icon: a.category === "settings" ? Settings2 : a.category === "users" ? UserCog : FolderKanban };
}

const dateOf = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const timeOf = (d) => new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const ymd = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const LABELS = {
  session: "Session",
  signedInAt: "Signed in at",
  lastActivityAt: "Last activity",
  duration: "Session length",
  product: "Product",
  type: "File type",
  version: "Version",
  replaces: "Replaces",
  size: "Size",
  results: "Results",
  category: "Category",
  emailed: "Email sent",
  inviteEmailed: "Invite emailed",
  browser: "Browser",
  attempt: "Attempt",
  lockAfter: "Locks after",
  lockedUntil: "Locked until",
  file: "File",
  published: "Published",
  skipped: "Skipped rows",
  note: "Note",
  link: "Link",
  name: "Name",
  role: "Role",
  region: "Region",
  team: "Team",
  productId: "Product id",
};
const fmtVal = (k, v) => {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (/At$|Until$/.test(k) && typeof v === "string" && !isNaN(Date.parse(v))) return `${dateOf(v)}, ${timeOf(v)}`;
  if (k === "size") return v > 1048576 ? `${(v / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(v / 1024))} KB`;
  if (Array.isArray(v)) return v.join("; ");
  return String(v);
};

/** One-line summary shown in the table. */
function summary(a) {
  const d = a.details || {};
  if (d.changes?.length) {
    const fields = d.changes.map((c) => c.field);
    return `Changed ${fields.slice(0, 3).join(", ")}${fields.length > 3 ? ` +${fields.length - 3} more` : ""}`;
  }
  if (a.category === "download") return [d.product, d.type, d.version && `v${d.version}`].filter(Boolean).join(" · ");
  if (a.action === "Searched") return `${d.results} result${d.results === 1 ? "" : "s"}${d.category ? ` in ${d.category}` : ""}`;
  if (a.action === "Viewed product") return d.category || "";
  if (d.duration) return `Session length ${d.duration}`;
  if (d.product) return [d.product, d.type, d.version && `v${d.version}`].filter(Boolean).join(" · ");
  return "";
}

function Details({ a }) {
  const d = a.details || {};
  const rest = Object.entries(d).filter(([k, v]) => k !== "changes" && k !== "productId" && v != null && v !== "" && !(Array.isArray(v) && !v.length));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px] bg-slate-50/70 px-5 py-4 border-t border-slate-100">
      <div className="space-y-3 min-w-0">
        {d.changes?.length > 0 && (
          <div className="space-y-2">
            <p className="eyebrow">What changed</p>
            {d.changes.map((c, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <p className="font-semibold text-slate-800">{c.field}</p>
                {"from" in c ? (
                  <div className="mt-1 grid gap-1 sm:grid-cols-[1fr_auto_1fr] items-start">
                    <span className="rounded bg-rose-50 px-2 py-1 text-rose-800 line-through decoration-rose-300 break-words">{c.from || <i className="no-underline">empty</i>}</span>
                    <span className="hidden sm:block text-slate-400 pt-1">→</span>
                    <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-800 break-words">{c.to || <i>empty</i>}</span>
                  </div>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {c.added.map((x, j) => (
                      <li key={"a" + j} className="text-emerald-700 break-words">
                        + {x}
                      </li>
                    ))}
                    {c.removed.map((x, j) => (
                      <li key={"r" + j} className="text-rose-700 line-through decoration-rose-300 break-words">
                        − {x}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
        {rest.length > 0 && (
          <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-sm">
            {rest.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="eyebrow">{LABELS[k] || k}</dt>
                <dd className="text-slate-800 break-words">{fmtVal(k, v)}</dd>
              </div>
            ))}
          </dl>
        )}
        {!d.changes?.length && !rest.length && <p className="text-sm text-slate-500">No further details.</p>}
      </div>
      <dl className="space-y-1.5 text-sm lg:border-l lg:border-slate-200 lg:pl-4">
        <div>
          <dt className="eyebrow">When</dt>
          <dd className="text-slate-800">
            {dateOf(a.at)}, {timeOf(a.at)}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Who</dt>
          <dd className="text-slate-800 break-all">
            {a.name ? `${a.name} · ` : ""}
            {a.email}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">IP address</dt>
          <dd className="text-slate-800 tabular">{a.ip || "–"}</dd>
        </div>
        <div>
          <dt className="eyebrow">Browser</dt>
          <dd className="text-slate-800">{a.browser || "–"}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function Audit() {
  const [f, setF] = useState({ category: "", user: "", from: "", to: "", q: "" });
  const [qInput, setQInput] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const people = useApi("/admin/audit/people");

  // Debounce the text search.
  useEffect(() => {
    const t = setTimeout(() => setF((x) => (x.q === qInput ? x : { ...x, q: qInput })), 300);
    return () => clearTimeout(t);
  }, [qInput]);
  useEffect(() => {
    setPage(1);
    setOpen(null);
  }, [f]);

  // The browser's time zone, so date filters and the CSV use the viewer's clock, not the server's.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const qs = new URLSearchParams([...Object.entries(f).filter(([, v]) => v), ...(tz ? [["tz", tz]] : [])]).toString();
  const { data, error, reload, loading } = useApi(`/admin/audit?${qs}&page=${page}&pageSize=50`);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const range = (days) => {
    const to = new Date();
    const from = new Date(Date.now() - (days - 1) * 86400000);
    setF((x) => ({ ...x, from: ymd(from), to: ymd(to) }));
  };
  const filtered = f.user || f.from || f.to || f.q;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));
  const counts = data?.counts || {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const dateCls = "h-9 px-2.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 outline-none focus:border-blue-500";

  return (
    <>
      <PageHeader icon={History} title="Activity log" subtitle="Who did what and when: sign-ins and sign-outs, changes, uploads, downloads, views and searches" crumbs={[{ label: "Insights" }, { label: "Activity log" }]}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search name, file, product, IP…"
            aria-label="Search activity"
            className="h-9 pl-8 pr-3 text-sm rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 w-64"
          />
        </div>
        <Button variant="secondary" icon={FileDown} href={`/api/admin/audit/export.csv?${qs}`}>
          Export CSV
        </Button>
      </PageHeader>
      <PageBody>
        <Tabs active={f.category} onChange={set("category")} tabs={CATS.map((c) => ({ ...c, count: data ? (c.key ? counts[c.key] || 0 : all) : undefined }))} />

        <div className="card px-3 py-2.5 flex flex-wrap items-center gap-2">
          <Select
            aria-label="Who"
            value={f.user}
            onChange={set("user")}
            options={[["", "Everyone"], ...(people.data || []).map((p) => [p.email, p.name ? `${p.name} (${p.email})` : p.email])]}
          />
          <span className="text-xs text-slate-500 ml-2">From</span>
          <input type="date" aria-label="From date" value={f.from} max={f.to || undefined} onChange={(e) => set("from")(e.target.value)} className={dateCls} />
          <span className="text-xs text-slate-500">to</span>
          <input type="date" aria-label="To date" value={f.to} min={f.from || undefined} onChange={(e) => set("to")(e.target.value)} className={dateCls} />
          <div className="flex gap-1 ml-1">
            {[
              ["Today", 1],
              ["7 days", 7],
              ["30 days", 30],
            ].map(([l, d]) => (
              <Button key={l} size="sm" variant="ghost" onClick={() => range(d)}>
                {l}
              </Button>
            ))}
          </div>
          {filtered && (
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              className="ml-auto"
              onClick={() => {
                setQInput("");
                setF({ category: f.category, user: "", from: "", to: "", q: "" });
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {error && <ErrorBox error={error} onRetry={reload} />}
        {!data && !error && <Loading rows={6} />}
        {data && (
          <div className={`card overflow-hidden transition-opacity ${loading ? "opacity-60" : ""}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] text-slate-500">
                    <th className="text-left font-semibold px-4 py-2.5 w-36">When</th>
                    <th className="text-left font-semibold px-4 py-2.5">Who</th>
                    <th className="text-left font-semibold px-4 py-2.5">Action</th>
                    <th className="text-left font-semibold px-4 py-2.5">Item</th>
                    <th className="text-left font-semibold px-4 py-2.5">Details</th>
                    <th className="text-left font-semibold px-4 py-2.5">IP · Browser</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((a) => {
                    const L = look(a);
                    const isOpen = open === a.id;
                    return (
                      <Fragment key={a.id}>
                        <tr onClick={() => setOpen(isOpen ? null : a.id)} className={`cursor-pointer transition-colors ${isOpen ? "bg-blue-50/50" : "hover:bg-blue-50/30"}`}>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="block font-medium text-slate-800 tabular">{dateOf(a.at)}</span>
                            <span className="block text-xs text-slate-500 tabular">{timeOf(a.at)}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold ${a.userId ? "bg-blue-800 text-white" : "bg-slate-200 text-slate-600"}`}>
                                {initials(a.name || a.email.replace(/@.*/, "").replace(/[._-]/g, " "))}
                              </span>
                              <span className="min-w-0">
                                <span className="block font-semibold text-slate-900 truncate">{a.name || a.email.replace(/@.*/, "")}</span>
                                <span className="block text-xs text-slate-500 truncate">{a.email}</span>
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <Badge variant={L.variant}>
                              <L.icon className="w-3 h-3" />
                              {a.action}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-slate-800 max-w-64">
                            <span className="block truncate" title={a.item}>
                              {a.item || "–"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 max-w-72">
                            <span className="block truncate" title={summary(a)}>
                              {summary(a) || "–"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                            <span className="block tabular">{a.ip || "–"}</span>
                            <span className="block">{a.browser}</span>
                          </td>
                          <td className="pr-3 text-slate-400">
                            {/* The row is clickable with a mouse; this button makes it reachable by keyboard and screen readers. */}
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-controls={`audit-details-${a.id}`}
                              aria-label={`${isOpen ? "Hide" : "Show"} details: ${a.action}, ${a.item || ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpen(isOpen ? null : a.id);
                              }}
                              className="p-1.5 rounded-md hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                            >
                              <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr id={`audit-details-${a.id}`}>
                            <td colSpan={7} className="p-0">
                              <Details a={a} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {!data.rows.length && (
                    <tr>
                      <td colSpan={7}>
                        <Empty icon={History} title="No activity matches these filters" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">
                <span className="tabular">
                  Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total.toLocaleString("en-IN")}
                </span>
                <span className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <span className="px-2 tabular">
                    Page {page} of {pages}
                  </span>
                  <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </span>
              </div>
            )}
          </div>
        )}
        <p className="text-[11px] text-slate-400">
          Click a row to see exactly what changed, the IP address and the browser. A session that times out is logged when the person next opens the app. Export CSV uses the current filters.
        </p>
      </PageBody>
    </>
  );
}
