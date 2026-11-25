import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, PackageSearch, Search as SearchIcon, SearchX } from "lucide-react";
import { api, extraWhere } from "../api.js";
import { Badge, Button, Empty, ErrorBox, Loading, PageBody, PageHeader, ProductImage, Tabs, useApi } from "../components/ui.jsx";

export default function Search() {
  const [params, setParams] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const raw = params.get("q") || "";
  const cat = params.get("cat") || "";
  const cats = useApi("/categories");
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);

  // Submitted searches are recorded for reports; live typing is not.
  const trackKey = loc.state?.track;
  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams();
    if (raw) qs.set("q", raw);
    if (cat) qs.set("cat", cat);
    if (trackKey) qs.set("track", "1");
    const t = setTimeout(() => {
      api("/search?" + qs)
        .then((d) => live && (setRes(d), setError(null)))
        .catch((e) => live && setError(e));
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [raw, cat, trackKey]);

  const setCat = (c) => {
    const next = new URLSearchParams(params);
    if (c) next.set("cat", c);
    else next.delete("cat");
    setParams(next);
  };
  const setQ = (v) => {
    const next = new URLSearchParams(params);
    if (v) next.set("q", v);
    else next.delete("q");
    setParams(next, { replace: true });
  };

  const title = cat ? cat : raw.trim() ? `Results for “${raw.trim()}”` : "All products";
  const r = res?.results || [];

  return (
    <>
      <PageHeader
        icon={PackageSearch}
        title={title}
        subtitle={res ? `${r.length} result${r.length === 1 ? "" : "s"} · searches names, specs, pitch, battlecard and file names` : "Searching…"}
        crumbs={[{ label: "Catalogue" }, { label: "All products" }]}
      >
        {/* Search box for small screens, where the top-bar search is hidden. */}
        <div className="relative md:hidden">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="search"
            value={raw}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nav(loc.pathname + loc.search, { replace: true, state: { track: Date.now() } })}
            placeholder="Search products…"
            aria-label="Search products"
            className="pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 w-56"
          />
        </div>
      </PageHeader>
      <PageBody>
        <Tabs
          active={cat}
          onChange={setCat}
          tabs={[
            { key: "", label: "All" },
            ...(cats.data || []).map((c) => ({ key: c.name, label: c.name, count: c.publishedCount })),
          ]}
        />
        {error && <ErrorBox error={error} />}
        {!res && !error && <Loading rows={3} />}
        {res && !res.hasProducts && (
          <div className="card">
            <Empty icon={PackageSearch} title="No products yet" text="Products are being added. Please check back soon." />
          </div>
        )}
        {res && res.hasProducts && !r.length && (
          <div className="card">
            <Empty icon={SearchX} title="Nothing found" text="Try another word, check the spelling, or pick another category. Searches cover product names, specs, pitch, battlecard and file names." />
          </div>
        )}
        <div className="grid gap-3">
          {r.map((p) => {
            const w = extraWhere(p.where);
            return (
              <div key={p.id} className="card card-hover p-3 flex items-center gap-4">
                <ProductImage src={p.imageUrl} alt={p.name} className="w-28 h-24 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1">
                  <Link to={`/product/${p.id}/pitch`} className="text-base font-semibold text-slate-900 hover:text-blue-700">
                    {p.name}
                  </Link>
                  <p className="text-xs text-slate-500">{p.subtitle || p.category}</p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <Badge variant="info">{p.category}</Badge>
                    {w.length > 0 && <span className="text-[11px] text-slate-500">Matched in: <b className="text-slate-700">{w.join(", ")}</b></span>}
                  </div>
                </div>
                <Button to={`/product/${p.id}/pitch`} size="sm" icon={ArrowRight}>
                  Open
                </Button>
              </div>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
