import crypto from "node:crypto";
import { q } from "./db.js";
import { queueMail, mailSends, resetMail, inviteMail } from "./mailer.js";

export const FILE_TYPES = {
  brochure: "Brochure",
  kld: "Key Line Drawing (KLD)",
  sheet: "Sales Spreadsheet",
  images: "Images",
  videos: "Videos",
  media: "Media files",
};

export const SETTING_DEFAULTS = {
  password_min_length: 10,
  activity_retention_days: 365,
  lockout_attempts: 5,
  reset_valid_minutes: 30,
  session_timeout_minutes: 60,
};

export async function getSettings() {
  const { rows } = await q("SELECT key, value FROM settings");
  const s = { ...SETTING_DEFAULTS };
  for (const r of rows) if (r.key in s) s[r.key] = Number(r.value);
  return s;
}

/** Throw this from a route to send a specific status and message. */
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Write one activity-log entry.
 *   req       the request (gives the signed-in user, IP address and browser)
 *   category  auth | content | users | settings | download | usage
 *   details   optional JSON, e.g. { changes: [{ field, from, to }] }
 *   user      who did it, when it is not req.user (sign-in, failed sign-in, password reset by link)
 *   at        when it happened, if not now (e.g. the moment a session timed out)
 * Never throws: a logging problem must not fail the user's action.
 */
export function audit(req, category, action, item = "", details = null, user = req?.user, at = null) {
  return q(
    `INSERT INTO audit_log (user_id, user_email, user_name, category, action, item, details, ip, user_agent, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, coalesce($10::timestamptz, now()))`,
    [
      user?.id ?? null,
      user?.email || "unknown",
      user?.name || null,
      category,
      action,
      String(item ?? ""),
      details && Object.keys(details).length ? JSON.stringify(details) : null,
      req?.ip?.replace(/^::ffff:/, "") || null,
      req?.get?.("user-agent")?.slice(0, 300) || null,
      at,
    ],
  ).catch((e) => console.error("activity log write failed:", e.message));
}

/* ---------- change tracking for the activity log ---------- */
const clip = (v, n = 300) => {
  const s = v == null ? "" : String(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
};

/** Scalar changes: fields = [[label, oldValue, newValue]] → [{ field, from, to }] for those that differ. */
export function diffFields(fields) {
  return fields.filter(([, a, b]) => String(a ?? "") !== String(b ?? "")).map(([field, a, b]) => ({ field, from: clip(a), to: clip(b) }));
}

/** List changes: compares two lists of lines → { field, added, removed } (or null when equal). */
export function diffList(field, before, after) {
  const A = before.filter((x) => x.trim());
  const B = after.filter((x) => x.trim());
  const added = B.filter((x) => !A.includes(x)).map((x) => clip(x, 200));
  const removed = A.filter((x) => !B.includes(x)).map((x) => clip(x, 200));
  return added.length || removed.length ? { field, added, removed } : null;
}

/** "Chrome 131 on Windows" from a user-agent string (good enough for a log). */
export function browserOf(ua = "") {
  if (!ua) return "";
  const b = /Edg\/(\d+)/.exec(ua) ? `Edge ${RegExp.$1}` : /OPR\/(\d+)/.exec(ua) ? `Opera ${RegExp.$1}` : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${RegExp.$1}`
    : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${RegExp.$1}` : /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${RegExp.$1}` : /curl|node|python/i.test(ua) ? "Script" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${b} on ${os}` : b;
}

/** "1 h 5 min" */
export const fmtDuration = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

export const track = (userId, kind, { productId = null, fileType = null, term = null, resultCount = null } = {}) =>
  q(
    "INSERT INTO events (user_id, kind, product_id, file_type, term, result_count) VALUES ($1,$2,$3,$4,$5,$6)",
    [userId, kind, productId, fileType, term, resultCount],
  ).catch((e) => console.error("track failed", e.message));

export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** Create a one-time password set/reset link for a user. */
export async function createResetLink(userId, minutes) {
  const token = crypto.randomBytes(32).toString("hex");
  await q("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))", [
    sha256(token),
    userId,
    minutes,
  ]);
  const base = process.env.APP_URL || "http://localhost:5173";
  return `${base}/reset-password?token=${token}`;
}

export const INVITE_MINUTES = 7 * 24 * 60;

/**
 * Create a set-password link for a user and email it ("reset" or "invite").
 * Returns the link only when no real email is sent (MAIL_TRANSPORT=log, outside production),
 * so an admin can pass it on by hand while testing.
 */
export async function sendPasswordLink(user, kind) {
  const minutes = kind === "invite" ? INVITE_MINUTES : (await getSettings()).reset_valid_minutes;
  const link = await createResetLink(user.id, minutes);
  const mail = (kind === "invite" ? inviteMail : resetMail)({ name: user.name || user.email, link, minutes });
  await queueMail({ to: user.email, ...mail });
  const emailed = mailSends();
  return { emailed, link: !emailed && process.env.NODE_ENV !== "production" ? link : undefined };
}

/** Simple RFC-4180-ish CSV parser (handles quotes, escaped quotes, CRLF). */
export function parseCsv(t) {
  const rows = [];
  let r = [],
    c = "",
    inQ = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          c += '"';
          i++;
        } else inQ = false;
      } else c += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      r.push(c);
      c = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      r.push(c);
      c = "";
      if (r.some((x) => x.trim())) rows.push(r);
      r = [];
    } else c += ch;
  }
  r.push(c);
  if (r.some((x) => x.trim())) rows.push(r);
  return rows;
}

const csvCell = (v) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ""));
