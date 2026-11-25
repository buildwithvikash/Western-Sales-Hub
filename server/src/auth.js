// Sessions and access checks.
//
// Every sign-in creates a row in `sessions`; the cookie holds a signed token naming that row. A request is
// accepted only while the row is open (ended_at IS NULL) and the user has been active within the timeout.
// Ending the row (sign-out, timeout, password change, deactivation, admin "sign out everywhere") signs that
// device out on its next request.
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { q } from "./db.js";
import { audit, browserOf, fmtDuration, getSettings, HttpError } from "./lib.js";

const COOKIE = "wsh_session";
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
  console.error("JWT_SECRET must be set to a random string of at least 16 characters (see server/.env.example).");
  process.exit(1);
}

export const USER_COLS = "id, name, email, role, region, team, active";
const TOUCH_EVERY_MS = 60_000; // update last_seen_at at most once a minute per session

export const END_MESSAGES = {
  signed_out: "You signed out.",
  timed_out: "For your security you were signed out after a period of inactivity.",
  password_changed: "You were signed out because the password for this account was changed.",
  deactivated: "Your account has been deactivated. Contact your admin.",
  revoked: "An admin signed you out of this device.",
};

/** HTTPS-only cookies whenever the request came over HTTPS (or always in production). */
const secureFor = (req) => !!(req?.secure || process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true");

function setCookie(req, res, user, session, minutes) {
  const token = jwt.sign({ uid: user.id, sid: session.sid, st: session.started }, SECRET, { expiresIn: minutes * 60 });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureFor(req), maxAge: 7 * 24 * 3600 * 1000 });
}

export const clearSession = (res) => res.clearCookie(COOKIE);

/** Start a session for a user who just signed in; sets the cookie. */
export async function startSession(req, res, user) {
  const sid = crypto.randomBytes(16).toString("hex");
  const { rows } = await q(
    "INSERT INTO sessions (id, user_id, ip, user_agent) VALUES ($1,$2,$3,$4) RETURNING started_at",
    [sid, user.id, req.ip?.replace(/^::ffff:/, "") || null, req.get("user-agent")?.slice(0, 300) || null],
  );
  const session = { sid, started: new Date(rows[0].started_at).getTime() };
  const s = await getSettings();
  setCookie(req, res, user, session, s.session_timeout_minutes);
  return session;
}

/** The session named by the request's cookie, if its signature is valid (expired token or not). */
export function readSession(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, SECRET, { ignoreExpiration: true });
    return p.sid ? { uid: p.uid, sid: p.sid, started: p.st } : null;
  } catch {
    return null;
  }
}

/** Close one session; returns the closed row, or null if it was already closed. */
export async function endSession(sid, reason, at = null) {
  const { rows } = await q(
    `UPDATE sessions SET ended_at = coalesce($3::timestamptz, now()), end_reason = $2
      WHERE id = $1 AND ended_at IS NULL RETURNING *`,
    [sid, reason, at],
  );
  return rows[0] || null;
}

/** Close every open session of a user (optionally keeping one); returns how many were closed. */
export async function endUserSessions(userId, reason, exceptSid = null) {
  const { rowCount } = await q(
    "UPDATE sessions SET ended_at = now(), end_reason = $2 WHERE user_id = $1 AND ended_at IS NULL AND id IS DISTINCT FROM $3",
    [userId, reason, exceptSid],
  );
  return rowCount;
}

/** Activity-log entry for a session that timed out (written at the time it actually ended). */
export async function logTimeout(row, user) {
  const fakeReq = { ip: row.ip, get: (h) => (h.toLowerCase() === "user-agent" ? row.user_agent : undefined) };
  const started = new Date(row.started_at);
  const last = new Date(row.last_seen_at);
  await audit(
    fakeReq,
    "auth",
    "Session timed out",
    "Signed out after inactivity",
    {
      session: row.id.slice(0, 12),
      signedInAt: started.toISOString(),
      lastActivityAt: last.toISOString(),
      duration: fmtDuration(last - started),
    },
    user,
    row.ended_at,
  );
}

export async function requireAuth(req, res, next) {
  const s = readSession(req);
  if (!s) {
    if (req.cookies?.[COOKIE]) clearSession(res);
    throw new HttpError(401, "Please sign in.", "NO_SESSION");
  }
  const settings = await getSettings();
  const { rows } = await q(
    `SELECT s.*, ${USER_COLS.split(", ").map((c) => `u.${c} AS u_${c}`).join(", ")}
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
    [s.sid],
  );
  const row = rows[0];
  if (!row) {
    clearSession(res);
    throw new HttpError(401, "Please sign in.", "NO_SESSION");
  }
  const user = Object.fromEntries(USER_COLS.split(", ").map((c) => [c, row[`u_${c}`]]));

  if (row.ended_at) {
    clearSession(res);
    throw new HttpError(401, END_MESSAGES[row.end_reason] || END_MESSAGES.timed_out, row.end_reason === "timed_out" ? "SESSION_EXPIRED" : "SESSION_ENDED");
  }
  if (!user.active) {
    await endSession(row.id, "deactivated");
    clearSession(res);
    throw new HttpError(401, END_MESSAGES.deactivated, "SESSION_ENDED");
  }
  const timeoutMs = settings.session_timeout_minutes * 60_000;
  const lastSeen = new Date(row.last_seen_at).getTime();
  if (Date.now() - lastSeen > timeoutMs) {
    const ended = await endSession(row.id, "timed_out", new Date(lastSeen + timeoutMs).toISOString());
    if (ended) await logTimeout(ended, user);
    clearSession(res);
    throw new HttpError(401, END_MESSAGES.timed_out, "SESSION_EXPIRED");
  }

  req.user = user;
  req.session = { sid: row.id, started: new Date(row.started_at).getTime() };
  if (Date.now() - lastSeen > TOUCH_EVERY_MS) {
    q("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [row.id]).catch(() => {});
    q("UPDATE users SET last_seen_at = now() WHERE id = $1", [user.id]).catch(() => {});
  }
  setCookie(req, res, user, req.session, settings.session_timeout_minutes);
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "Admin") throw new HttpError(403, "Only admins can do this.");
  next();
}

export const isAdmin = (req) => req.user?.role === "Admin";

export { browserOf };
