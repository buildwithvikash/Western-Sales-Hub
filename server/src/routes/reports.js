import { Router } from "express";
import { q } from "../db.js";
import { toCsv, FILE_TYPES } from "../lib.js";

const r = Router(); // mounted behind requireAdmin

/** Shared WHERE clause for ?days=&region=&team= filters over events e JOIN users u. */
function scope(req) {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const params = [days];
  const ev = ["e.created_at > now() - make_interval(days => $1)"];
  const usr = [];
  for (const k of ["region", "team"]) {
    if (req.query[k]) {
      params.push(String(req.query[k]));
      ev.push(`u.${k} = $${params.length}`);
      usr.push(`u.${k} = $${params.length}`);
    }
  }
  return { days, params, where: ev.join(" AND "), userWhere: usr.length ? " AND " + usr.join(" AND ") : "" };
}
const FROM = "FROM events e LEFT JOIN users u ON u.id = e.user_id";

r.get("/filters", async (req, res) => {
  const { rows: regions } = await q("SELECT DISTINCT region FROM users WHERE region <> '' ORDER BY 1");
  const { rows: teams } = await q("SELECT DISTINCT team FROM users WHERE team <> '' ORDER BY 1");
  res.json({ regions: regions.map((x) => x.region), teams: teams.map((x) => x.team) });
});

r.get("/dashboard", async (req, res) => {
  const s = scope(req);
  const [kpi, reps, buckets, top, noRes, recent] = await Promise.all([
    q(
      `SELECT count(DISTINCT e.user_id) FILTER (WHERE u.role = 'Rep')::int AS active_reps,
              count(*) FILTER (WHERE e.kind = 'view')::int AS opens,
              count(*) FILTER (WHERE e.kind = 'download')::int AS downloads,
              count(*) FILTER (WHERE e.kind = 'search' AND e.result_count = 0)::int AS no_result
       ${FROM} WHERE ${s.where}`,
      s.params,
    ),
    q(`SELECT count(*)::int AS n FROM users u WHERE u.role = 'Rep' AND u.active ${s.userWhere.replace(/\$(\d+)/g, (m, d) => "$" + (d - 1))}`, s.params.slice(1)),
    q(
      `SELECT width_bucket(extract(epoch FROM now() - e.created_at), 0, $1 * 86400, 6) AS b, count(*)::int AS n
       ${FROM} WHERE ${s.where} AND e.kind = 'view' GROUP BY 1`,
      s.params,
    ),
    q(
      `SELECT p.name, c.name AS category, count(*)::int AS n ${FROM} JOIN products p ON p.id = e.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${s.where} AND e.kind = 'view' GROUP BY p.id, c.name ORDER BY n DESC LIMIT 5`,
      s.params,
    ),
    q(`SELECT e.term, count(*)::int AS n ${FROM} WHERE ${s.where} AND e.kind = 'search' AND e.result_count = 0 GROUP BY 1 ORDER BY n DESC LIMIT 5`, s.params),
    q("SELECT user_email, action, item, created_at FROM audit_log ORDER BY id DESC LIMIT 5"),
  ]);
  const series = [0, 0, 0, 0, 0, 0];
  for (const b of buckets.rows) if (b.b >= 1 && b.b <= 6) series[6 - b.b] += b.n; // oldest → newest
  const k = kpi.rows[0];
  res.json({
    kpis: { activeReps: k.active_reps, totalReps: reps.rows[0].n, opens: k.opens, downloads: k.downloads, noResult: k.no_result },
    opensOverTime: series,
    topViewed: top.rows,
    noResultSearches: noRes.rows,
    recentActivity: recent.rows,
  });
});

r.get("/", async (req, res) => {
  const s = scope(req);
  const [top, noRes, viewed, dl, active, inactive] = await Promise.all([
    q(`SELECT e.term, count(*)::int AS n ${FROM} WHERE ${s.where} AND e.kind = 'search' GROUP BY 1 ORDER BY n DESC LIMIT 5`, s.params),
    q(`SELECT e.term, count(*)::int AS n ${FROM} WHERE ${s.where} AND e.kind = 'search' AND e.result_count = 0 GROUP BY 1 ORDER BY n DESC LIMIT 5`, s.params),
    q(`SELECT p.name, count(*)::int AS n ${FROM} JOIN products p ON p.id = e.product_id WHERE ${s.where} AND e.kind = 'view' GROUP BY p.id ORDER BY n DESC LIMIT 5`, s.params),
    q(`SELECT e.file_type, count(*)::int AS n ${FROM} WHERE ${s.where} AND e.kind = 'download' GROUP BY 1`, s.params),
    q(`SELECT u.name, count(*)::int AS n ${FROM} WHERE ${s.where} AND u.role = 'Rep' GROUP BY u.id ORDER BY n DESC LIMIT 5`, s.params),
    q(
      `SELECT u.name, u.last_seen_at FROM users u WHERE u.role = 'Rep' AND u.active ${s.userWhere}
         AND NOT EXISTS (SELECT 1 FROM events e WHERE e.user_id = u.id AND e.created_at > now() - make_interval(days => $1))
       ORDER BY u.last_seen_at NULLS FIRST LIMIT 10`,
      s.params,
    ),
  ]);
  const dlMap = Object.fromEntries(dl.rows.map((x) => [x.file_type, x.n]));
  res.json({
    topSearches: top.rows,
    noResultSearches: noRes.rows,
    mostViewed: viewed.rows,
    downloadsByType: Object.entries(FILE_TYPES).map(([t, label]) => ({ type: t, label, n: dlMap[t] || 0 })),
    mostActiveReps: active.rows,
    inactiveReps: inactive.rows.map((x) => ({ name: x.name, lastSeenAt: x.last_seen_at })),
  });
});

r.get("/export.csv", async (req, res) => {
  const s = scope(req);
  const { rows } = await q(
    `SELECT e.created_at, u.email, u.region, u.team, e.kind, p.name AS product, e.file_type, e.term, e.result_count
     ${FROM} LEFT JOIN products p ON p.id = e.product_id WHERE ${s.where} ORDER BY e.created_at DESC`,
    s.params,
  );
  res.type("text/csv").attachment(`activity-last-${s.days}-days.csv`);
  res.send(
    toCsv(
      ["When", "User", "Region", "Team", "Event", "Product", "File type", "Search term", "Results"],
      rows.map((x) => [x.created_at, x.email, x.region, x.team, x.kind, x.product, x.file_type, x.term, x.result_count]),
    ),
  );
});

export default r;
