import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { q } from "./db.js";
import { audit, fmtDuration, getSettings, HttpError } from "./lib.js";

const COOKIE = "wsh_session";
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
  console.error("JWT_SECRET must be set to a random string of at least 16 characters (see server/.env.example).");
  process.exit(1);
}

export const USER_COLS = "id, name, email, role, region, team, active";

/**
 * Issue a session cookie. The JWT expires after the inactivity timeout and is re-issued on
 * every request (sliding session). The cookie itself lives longer, so an expired token can be
 * told apart from "never signed in" and the app can show the "Session expired" screen.
 * `session` = { sid, started }: a session id and sign-in time (ms), kept across re-issues so the
 * activity log can tie sign-in, sign-out and timeout together and show how long a session lasted.
 */
export function issueSession(res, user, minutes, session) {
  const token = jwt.sign({ uid: user.id, sid: session.sid, st: session.started }, SECRET, { expiresIn: minutes * 60 });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

export const newSession = () => ({ sid: crypto.randomBytes(6).toString("hex"), started: Date.now() });

export const clearSession = (res) => res.clearCookie(COOKIE);

/** The session in the request's cookie, if its signature is valid (expired or not). */
export function readSession(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, SECRET, { ignoreExpiration: true });
    return { uid: p.uid, sid: p.sid, started: p.st, lastActive: p.iat * 1000, expired: p.exp * 1000 <= Date.now() };
  } catch {
    return null;
  }
}

// Several requests can arrive with the same expired cookie; log each timeout once.
const loggedTimeouts = new Map();
async function logTimeout(req, s) {
  const key = s.sid || `${s.uid}:${s.lastActive}`;
  if (loggedTimeouts.has(key)) return;
  loggedTimeouts.set(key, Date.now());
  for (const [k, t] of loggedTimeouts) if (Date.now() - t > 3600_000) loggedTimeouts.delete(k);
  const { rows } = await q("SELECT id, name, email FROM users WHERE id = $1", [s.uid]);
  if (!rows[0]) return;
  await audit(req, "auth", "Session timed out", "Signed out after inactivity", {
    session: s.sid,
    signedInAt: s.started ? new Date(s.started).toISOString() : undefined,
    lastActivityAt: new Date(s.lastActive).toISOString(),
    duration: s.started ? fmtDuration(s.lastActive - s.started) : undefined,
  }, rows[0]);
}

export async function requireAuth(req, res, next) {
  const s = readSession(req);
  if (!s) {
    if (req.cookies?.[COOKIE]) clearSession(res);
    throw new HttpError(401, "Please sign in.", "NO_SESSION");
  }
  if (s.expired) {
    clearSession(res);
    await logTimeout(req, s);
    throw new HttpError(401, "Your session has expired. Please sign in again.", "SESSION_EXPIRED");
  }
  const { rows } = await q(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [s.uid]);
  const user = rows[0];
  if (!user || !user.active) {
    clearSession(res);
    throw new HttpError(401, "Please sign in.", "NO_SESSION");
  }
  req.user = user;
  req.session = s;
  const settings = await getSettings();
  // Sessions from before session ids existed get one now.
  issueSession(res, user, settings.session_timeout_minutes, s.sid ? s : newSession());
  q("UPDATE users SET last_seen_at = now() WHERE id = $1", [user.id]).catch(() => {});
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "Admin") throw new HttpError(403, "Only admins can do this.");
  next();
}

export const isAdmin = (req) => req.user?.role === "Admin";
