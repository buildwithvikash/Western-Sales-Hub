import { BarChart3, Download, Eye, FileDown, Search, SearchX, Trophy, UserX } from "lucide-react";
import { Button, Card, Empty, ErrorBox, Loading, PageBody, PageHeader, SpecRow, useApi } from "../../components/ui.jsx";
import { fmtDate } from "../../api.js";
import { useReportFilters } from "./Dashboard.jsx";

const BAR = { blue: "bg-blue-600", amber: "bg-amber-500", green: "bg-emerald-500", violet: "bg-violet-500" };

function Bars({ items, label, tone = "blue", empty = "No data in this period." }) {
  const max = Math.max(1, ...items.map((x) => x.n));
  if (!items.length || items.every((x) => !x.n)) return <Empty title={empty} />;
  return (
    <div className="space-y-2.5">
      {items.map((x, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <span className="w-36 shrink-0 truncate text-slate-600" title={label(x)}>
            {label(x)}
          </span>
          <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full ${BAR[tone]}`} style={{ width: `${(x.n / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right font-semibold tabular text-slate-800">{x.n}</span>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const { qs, controls } = useReportFilters();
  const { data, error, reload } = useApi("/reports?" + qs);

  return (
    <>
      <PageHeader icon={BarChart3} title="Reports" subtitle="Searches, views, downloads and rep activity" crumbs={[{ label: "Insights" }, { label: "Reports" }]}>
        {controls(["region", "days"])}
        <Button variant="secondary" icon={FileDown} href={"/api/reports/export.csv?" + qs}>
          Export CSV
        </Button>
      </PageHeader>
      <PageBody>
        {error && <ErrorBox error={error} onRetry={reload} />}
        {!data && !error && <Loading rows={4} />}
        {data && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Top searches" icon={Search}>
              <Bars items={data.topSearches} label={(x) => x.term} />
            </Card>
            <Card title="Searches with no result" icon={SearchX}>
              <Bars items={data.noResultSearches} label={(x) => x.term} tone="amber" empty="None in this period." />
              <p className="mt-3 text-[11px] text-slate-400">These show where content is missing.</p>
            </Card>
            <Card title="Most viewed products" icon={Eye}>
              <Bars items={data.mostViewed} label={(x) => x.name} tone="green" />
            </Card>
            <Card title="Downloads by file type" icon={Download}>
              <Bars items={data.downloadsByType} label={(x) => x.label.replace(" (KLD)", "")} tone="violet" />
            </Card>
            <Card title="Most active reps" icon={Trophy}>
              {data.mostActiveReps.length ? data.mostActiveReps.map((r, i) => <SpecRow key={i} a={r.name} b={`${r.n} actions`} />) : <Empty title="No rep activity in this period" />}
            </Card>
            <Card title="Reps with no activity" icon={UserX}>
              {data.inactiveReps.length ? (
                data.inactiveReps.map((r, i) => <SpecRow key={i} a={r.name} b={r.lastSeenAt ? `Last seen ${fmtDate(r.lastSeenAt)}` : "Never signed in"} />)
              ) : (
                <Empty title="Every rep was active in this period" />
              )}
            </Card>
          </div>
        )}
      </PageBody>
    </>
  );
}
