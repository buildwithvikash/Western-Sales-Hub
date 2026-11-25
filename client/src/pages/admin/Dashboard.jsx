import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, Download, Eye, LayoutDashboard, SearchX, TrendingUp, Users } from "lucide-react";
import { Card, Empty, ErrorBox, Kpi, KpiGrid, Loading, PageBody, PageHeader, Select, SpecRow, useApi } from "../../components/ui.jsx";
import { fmtStamp } from "../../api.js";

export const DAYS = [
  ["30", "Last 30 days"],
  ["7", "Last 7 days"],
  ["90", "Last 90 days"],
];

/** Region / team / period filters shared by dashboard and reports. */
export function useReportFilters() {
  const filters = useApi("/reports/filters");
  const [f, setF] = useState({ days: "30", region: "", team: "" });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const controls = (keys = ["region", "team", "days"]) => (
    <>
      {keys.includes("region") && <Select aria-label="Region" value={f.region} onChange={(region) => setF({ ...f, region })} options={[["", "All regions"], ...(filters.data?.regions || [])]} />}
      {keys.includes("team") && <Select aria-label="Team" value={f.team} onChange={(team) => setF({ ...f, team })} options={[["", "All teams"], ...(filters.data?.teams || [])]} />}
      {keys.includes("days") && <Select aria-label="Period" value={f.days} onChange={(days) => setF({ ...f, days })} options={DAYS} />}
    </>
  );
  return { qs, f, controls };
}

export default function Dashboard() {
  const { qs, f, controls } = useReportFilters();
  const { data, error, reload } = useApi("/reports/dashboard?" + qs);
  const series = data?.opensOverTime || [];
  const max = Math.max(1, ...series);
  const period = DAYS.find((d) => d[0] === f.days)[1].toLowerCase();

  return (
    <>
      <PageHeader icon={LayoutDashboard} title="Admin dashboard" subtitle={`How reps are using the Sales Hub, ${period}`} crumbs={[{ label: "Insights" }, { label: "Dashboard" }]}>
        {controls()}
      </PageHeader>
      <PageBody>
        {error && <ErrorBox error={error} onRetry={reload} />}
        {!data && !error && <Loading rows={4} />}
        {data && (
          <>
            <KpiGrid>
              <Kpi icon={Users} tone="blue" label="Active reps" value={`${data.kpis.activeReps} / ${data.kpis.totalReps}`} note="Reps who used the hub in this period" />
              <Kpi icon={Eye} tone="green" label="Content opens" value={data.kpis.opens} note="Product pages opened" />
              <Kpi icon={Download} tone="violet" label="File downloads" value={data.kpis.downloads} note="Brochures, KLDs and other files" />
              <Kpi icon={SearchX} tone="amber" label="Searches with no result" value={data.kpis.noResult} note="Where content may be missing" />
            </KpiGrid>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Content opens over time" icon={TrendingUp}>
                <div className="flex items-end gap-3 h-40">
                  {series.map((n, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="text-[11px] font-semibold tabular text-slate-600">{n}</span>
                      <div className="w-full max-w-12 rounded-t-md bg-blue-600 transition-all" style={{ height: `${Math.max(3, (n / max) * 100)}%`, opacity: 0.45 + (i / 10) }} title={`${n} opens`} />
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-slate-400">The period split into six equal parts, oldest on the left</p>
              </Card>
              <Card title="Top viewed products" icon={Eye}>
                {data.topViewed.length ? data.topViewed.map((p, i) => <SpecRow key={i} a={`${p.name} · ${p.category || "–"}`} b={p.n} />) : <Empty icon={Eye} title="No product views in this period" />}
              </Card>
              <Card
                title="Recent activity"
                icon={Activity}
                action={
                  <Link to="/admin/audit" className="text-xs font-semibold text-blue-700 hover:underline inline-flex items-center gap-1">
                    View all <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                }
              >
                {data.recentActivity.map((a, i) => (
                  <div key={i} className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0 text-sm">
                    <span className="text-slate-700 min-w-0">
                      <b className="font-semibold">{a.action}</b>
                      {a.item ? `: ${a.item}` : ""}
                    </span>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{fmtStamp(a.created_at)}</span>
                  </div>
                ))}
              </Card>
              <Card title="Searches with no result" icon={SearchX}>
                {data.noResultSearches.length ? data.noResultSearches.map((s, i) => <SpecRow key={i} a={s.term} b={s.n} />) : <Empty icon={SearchX} title="None in this period" text="Every search found something." />}
              </Card>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
