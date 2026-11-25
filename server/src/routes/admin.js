// Activity log and settings (admin only).
import { Router } from "express";
import { q } from "../db.js";
import { audit, getSettings, toCsv, HttpError, SETTING_DEFAULTS, diffFields, browserOf } from "../lib.js";
import { mailMode, queueMail, verifyMail, from as mailFrom } from "../mailer.js";

const r = Router();

/* ---------- activity log ---------- */
const CATEGORIES = ["auth", "content", "users", "settings", "download", "usage"];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

/**
 * WHERE clause for ?category=&user=&from=&to=&q= (dates are YYYY-MM-DD, whole days, server time zone).
 * `skip` leaves one filter out (used for the per-category counts).
 */
function auditFilter(query, skip) {
  const where = [];
  const params = [];
  const add = (sql, v) => {
    params.push(v);
    where.push(sql.replace(/\$\?/g, `$${params.length}`));
  };
  if (skip !== "category" && CATEGORIES.includes(query.category)) add("category = $?", query.category);
  if (query.user) /^\d+$/.test(query.user) ? add("user_id = $?", Number(query.user)) : add("lower(user_email) = lower($?)", query.user);
  if (isDate(query.from)) add("created_at >= $?::date", query.from);
  if (isDate(query.to)) add("created_at < $?::date + 1", query.to);
  if (query.q) add("(user_email ILIKE $? OR coalesce(user_name,'') ILIKE $? OR action ILIKE $? OR item ILIKE $? OR coalesce(details::text,'') ILIKE $?)", `%${String(query.q).slice(0, 100)}%`);
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

const auditRow = (a) => ({
  id: Number(a.id),
  at: a.created_at,
  userId: a.user_id,
  email: a.user_email,
  name: a.user_name,
  category: a.category,
  action: a.action,
  item: a.item,
  details: a.details,
  ip: a.ip,
  browser: browserOf(a.user_agent || ""),
});

r.get("/audit", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize) || 50));
  const f = auditFilter(req.query);
  const c = auditFilter(req.query, "category");
  const [rows, total, counts] = await Promise.all([
    q(`SELECT * FROM audit_log ${f.sql} ORDER BY created_at DESC, id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, f.params),
    q(`SELECT count(*)::int AS n FROM audit_log ${f.sql}`, f.params),
    q(`SELECT category, count(*)::int AS n FROM audit_log ${c.sql} GROUP BY category`, c.params),
  ]);
  res.json({
    rows: rows.rows.map(auditRow),
    total: total.rows[0].n,
    page,
    pageSize,
    counts: Object.fromEntries(counts.rows.map((x) => [x.category, x.n])),
  });
});

/** Everyone who appears in the log (for the "who" filter), including deleted users and unknown emails. */
r.get("/audit/people", async (req, res) => {
  const { rows } = await q(
    `SELECT lower(user_email) AS email, max(user_name) AS name, count(*)::int AS n FROM audit_log
      GROUP BY lower(user_email) ORDER BY max(user_name) NULLS LAST, 1`,
  );
  res.json(rows);
});

/** Details as one line of text, for CSV. */
function detailsText(d) {
  if (!d) return "";
  const parts = [];
  for (const ch of d.changes || []) {
    if ("from" in ch) parts.push(`${ch.field}: "${ch.from}" → "${ch.to}"`);
    else parts.push(`${ch.field}: ${[...ch.added.map((x) => `+ ${x}`), ...ch.removed.map((x) => `− ${x}`)].join("; ")}`);
  }
  for (const [k, v] of Object.entries(d)) if (k !== "changes" && v != null && v !== "") parts.push(`${k}: ${Array.isArray(v) ? v.join("; ") : v}`);
  return parts.join(" | ");
}

r.get("/audit/export.csv", async (req, res) => {
  const f = auditFilter(req.query);
  const { rows } = await q(`SELECT * FROM audit_log ${f.sql} ORDER BY created_at DESC, id DESC LIMIT 100000`, f.params);
  res.type("text/csv").attachment(`activity-log-${new Date().toISOString().slice(0, 10)}.csv`);
  res.send(
    "﻿" + // so Excel opens it as UTF-8
      toCsv(
        ["Date", "Time", "Name", "Email", "Category", "Action", "Item", "Details", "IP address", "Browser"],
        rows.map((a) => {
          const t = new Date(a.created_at);
          return [
            t.toLocaleDateString("en-GB"),
            t.toLocaleTimeString("en-GB"),
            a.user_name,
            a.user_email,
            a.category,
            a.action,
            a.item,
            detailsText(a.details),
            a.ip,
            browserOf(a.user_agent || ""),
          ];
        }),
      ),
  );
});

r.get("/settings", async (req, res) => res.json(await getSettings()));

// Email: how mail is sent, the queue, and recent failures.
r.get("/mail", async (req, res) => {
  const { rows: counts } = await q("SELECT status, count(*)::int AS n FROM mail_outbox GROUP BY status");
  const { rows: failed } = await q(
    "SELECT to_address, subject, last_error, attempts, created_at FROM mail_outbox WHERE status = 'FAILED' OR (status = 'PENDING' AND attempts > 0) ORDER BY id DESC LIMIT 5",
  );
  res.json({
    transport: mailMode(),
    from: mailFrom(),
    host: mailMode() === "smtp" ? `${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}` : mailMode() === "graph" ? "Outlook (Microsoft Graph, OAuth)" : null,
    redirectTo: process.env.MAIL_REDIRECT_TO || null,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    problems: failed,
  });
});

r.post("/mail/test", async (req, res) => {
  try {
    await verifyMail();
  } catch (e) {
    throw new HttpError(400, `Could not log in to the mail server: ${e.message}`);
  }
  await queueMail({
    to: req.user.email,
    subject: "Sales Hub test email",
    text: "This is a test email from the Western Sales Hub. If you can read it, password reset and invite emails will reach your users.",
  });
  await audit(req, "settings", "Sent test email", req.user.email);
  res.json({ ok: true, to: req.user.email, transport: mailMode() });
});

const LIMITS = {
  password_min_length: [8, 128],
  lockout_attempts: [1, 100],
  reset_valid_minutes: [5, 1440],
  session_timeout_minutes: [5, 1440],
};

r.put("/settings", async (req, res) => {
  const out = {};
  for (const key of Object.keys(SETTING_DEFAULTS)) {
    const v = Number(req.body?.[key]);
    const [lo, hi] = LIMITS[key];
    if (!Number.isInteger(v) || v < lo || v > hi) throw new HttpError(400, `${key.replace(/_/g, " ")} must be a whole number from ${lo} to ${hi}.`);
    out[key] = v;
  }
  const before = await getSettings();
  for (const [k, v] of Object.entries(out))
    await q("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [k, String(v)]);
  const changes = diffFields(Object.keys(out).map((k) => [k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), before[k], out[k]]));
  if (changes.length) await audit(req, "settings", "Changed settings", "Password policy", { changes });
  res.json(out);
});

export default r;
