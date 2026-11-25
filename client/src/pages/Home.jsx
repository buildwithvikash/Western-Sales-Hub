import { Link } from "react-router-dom";
import { ArrowRight, Clock, FileText, Home as HomeIcon, LayoutGrid, Sparkles } from "lucide-react";
import { useAuth } from "../auth.jsx";
import { fmtDate } from "../api.js";
import { Card, Empty, ErrorBox, Loading, PageBody, PageHeader, ProductImage, useApi } from "../components/ui.jsx";

export const ProductCard = ({ p }) => (
  <Link to={`/product/${p.id}/pitch`} className="card card-hover group p-3 flex flex-col gap-2">
    <ProductImage src={p.imageUrl} alt={p.name} className="h-40" />
    <div className="px-1 pb-1">
      <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 truncate">{p.name}</h3>
      <p className="text-xs text-slate-500 truncate">{p.subtitle || p.category}</p>
    </div>
  </Link>
);

export default function Home() {
  const { user } = useAuth();
  const { data, error, reload } = useApi("/home");
  const first = user?.name?.split(" ")[0];

  return (
    <>
      <PageHeader icon={HomeIcon} title={`Welcome${first ? ", " + first : ""}`} subtitle="Find any product, spec or pitch: search at the top, or pick a category" />
      <PageBody>
        {error && <ErrorBox error={error} onRetry={reload} />}
        {!data && !error && <Loading rows={4} />}
        {data && (
          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <div className="space-y-5 min-w-0">
              <Card title="Product categories" icon={LayoutGrid}>
                <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                  {data.categories.map((c) => (
                    <Link key={c.id} to={`/search?cat=${encodeURIComponent(c.name)}`} className="group rounded-xl border border-slate-200 p-3 hover:border-blue-300 hover:shadow-md transition-all">
                      <ProductImage src={c.imageUrl} alt={c.name} className="h-28" />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 truncate">{c.name}</span>
                        <span className="min-w-6 px-1.5 rounded-full text-[11px] font-bold tabular bg-slate-100 text-slate-600 text-center">{c.count}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>

              <Card
                title="Recently viewed"
                icon={Clock}
                action={
                  <Link to="/search" className="text-xs font-semibold text-blue-700 hover:underline inline-flex items-center gap-1">
                    All products <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                }
              >
                {data.recent.length ? (
                  <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                    {data.recent.map((p) => (
                      <ProductCard key={p.id} p={p} />
                    ))}
                  </div>
                ) : (
                  <Empty title="No products yet" text="Products are being added. Please check back soon." />
                )}
              </Card>
            </div>

            <Card title="New and updated" icon={Sparkles} className="self-start" bodyClass="p-2">
              {data.updates.length ? (
                data.updates.map((u, i) => (
                  <Link key={i} to={`/product/${u.productId}/pitch`} className="flex items-start gap-3 rounded-lg px-2.5 py-2.5 hover:bg-slate-50">
                    <span className="w-8 h-8 shrink-0 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <FileText className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800 truncate">{u.fileName}</span>
                      <span className="block text-xs text-slate-500 truncate">
                        {u.productName} · {fmtDate(u.uploadedAt)}
                      </span>
                    </span>
                  </Link>
                ))
              ) : (
                <Empty icon={FileText} title="No new files yet" />
              )}
            </Card>
          </div>
        )}
      </PageBody>
    </>
  );
}
