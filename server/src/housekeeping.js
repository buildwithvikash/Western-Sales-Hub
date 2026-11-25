// Background jobs:
//  - every minute: close sessions that passed the inactivity timeout and log "Session timed out"
//    at the moment they actually expired (even if the person never comes back);
//  - every 6 hours: delete activity-log entries and usage events older than the retention setting,
//    old closed sessions, used/expired password links, sent mail and empty untitled drafts.
import { q } from "./db.js";
import { getSettings } from "./lib.js";
import { logTimeout } from "./auth.js";

export async function closeTimedOutSessions() {
  const s = await getSettings();
  const { rows } = await q(
    `UPDATE sessions SET ended_at = last_seen_at + make_interval(mins => $1), end_reason = 'timed_out'
      WHERE ended_at IS NULL AND last_seen_at < now() - make_interval(mins => $1)
      RETURNING *`,
    [s.session_timeout_minutes],
  );
  for (const row of rows) {
    const { rows: u } = await q("SELECT id, name, email FROM users WHERE id = $1", [row.user_id]);
    if (u[0]) await logTimeout(row, u[0]);
  }
  return rows.length;
}

export async function applyRetention() {
  const s = await getSettings();
  const out = {};
  if (s.activity_retention_days > 0) {
    out.activity = (await q("DELETE FROM audit_log WHERE created_at < now() - make_interval(days => $1)", [s.activity_retention_days])).rowCount;
    out.events = (await q("DELETE FROM events WHERE created_at < now() - make_interval(days => $1)", [s.activity_retention_days])).rowCount;
  }
  out.sessions = (await q("DELETE FROM sessions WHERE ended_at < now() - interval '90 days'")).rowCount;
  out.resetLinks = (await q("DELETE FROM password_resets WHERE expires_at < now() - interval '30 days'")).rowCount;
  out.mail = (await q("DELETE FROM mail_outbox WHERE status = 'SENT' AND sent_at < now() - interval '90 days'")).rowCount;
  // Untitled drafts with no files, left over from older versions of the editor.
  out.emptyDrafts = (
    await q(`DELETE FROM products p WHERE p.name = '' AND NOT p.published AND p.created_at < now() - interval '1 day'
              AND NOT EXISTS (SELECT 1 FROM product_files f WHERE f.product_id = p.id)`)
  ).rowCount;
  return out;
}

export function startHousekeeping() {
  const safe = (fn, name) => () => fn().catch((e) => console.warn(`[housekeeping] ${name} failed:`, e.message));
  const sessions = safe(closeTimedOutSessions, "session timeouts");
  const retention = safe(async () => {
    const r = await applyRetention();
    const n = Object.values(r).reduce((a, b) => a + b, 0);
    if (n) console.log("[housekeeping] removed old records:", JSON.stringify(r));
  }, "retention");
  sessions();
  retention();
  setInterval(sessions, 60_000).unref();
  setInterval(retention, 6 * 3600_000).unref();
}
