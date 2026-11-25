import { Router } from "express";
import bcrypt from "bcryptjs";
import { q } from "../db.js";
import { clearSession, startSession, readSession, endSession, endUserSessions, requireAuth, USER_COLS } from "../auth.js";
import { audit, track, getSettings, sendPasswordLink, sha256, HttpError, isEmail, browserOf, fmtDuration } from "../lib.js";

const r = Router();
const LOCK_MINUTES = 15;

r.post("/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!isEmail(email)) throw new HttpError(400, "Enter your work email.");
  if (!password) throw new HttpError(400, "Enter your password.");

  const s = await getSettings();
  const { rows } = await q(`SELECT ${USER_COLS}, password_hash, failed_attempts, locked_until FROM users WHERE lower(email) = $1`, [email]);
  const u = rows[0];
  const bad = () => new HttpError(401, "Email or password is incorrect.");
  const failed = (reason, extra) => audit(req, "auth", "Failed sign-in", reason, { browser: browserOf(req.get("user-agent")), ...extra }, u || { email });
  if (!u) {
    await failed("Unknown email");
    throw bad();
  }
  if (!u.active || !u.password_hash) {
    await failed(u.active ? "Password not set yet" : "Account deactivated");
    throw bad();
  }
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    await failed("Account locked", { lockedUntil: new Date(u.locked_until).toISOString() });
    throw new HttpError(423, "This account is locked after too many failed attempts. Try again later or ask your admin to reset your password.");
  }

  if (!(await bcrypt.compare(password, u.password_hash))) {
    const n = u.failed_attempts + 1;
    await failed("Wrong password", { attempt: n, lockAfter: s.lockout_attempts });
    if (n >= s.lockout_attempts) {
      await q("UPDATE users SET failed_attempts = 0, locked_until = now() + make_interval(mins => $2) WHERE id = $1", [u.id, LOCK_MINUTES]);
      await audit(req, "auth", "Account locked", `Locked for ${LOCK_MINUTES} minutes after ${n} failed sign-ins`, null, u);
    } else await q("UPDATE users SET failed_attempts = $2 WHERE id = $1", [u.id, n]);
    throw bad();
  }

  await q("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_seen_at = now() WHERE id = $1", [u.id]);
  const session = await startSession(req, res, u);
  await audit(req, "auth", "Signed in", browserOf(req.get("user-agent")), { session: session.sid.slice(0, 12) }, u);
  track(u.id, "login");
  const { password_hash, failed_attempts, locked_until, ...user } = u;
  res.json({ user, policy: { passwordMinLength: s.password_min_length } });
});

r.post("/logout", async (req, res) => {
  const s = readSession(req);
  clearSession(res);
  const ended = s && (await endSession(s.sid, "signed_out"));
  if (ended) {
    const { rows } = await q("SELECT id, name, email FROM users WHERE id = $1", [ended.user_id]);
    const length = fmtDuration(new Date(ended.ended_at) - new Date(ended.started_at));
    if (rows[0])
      await audit(req, "auth", "Signed out", `Session ${length}`, {
        session: ended.id.slice(0, 12),
        signedInAt: new Date(ended.started_at).toISOString(),
        duration: length,
      }, rows[0]);
  }
  res.json({ ok: true });
});

r.get("/me", requireAuth, async (req, res) => {
  const s = await getSettings();
  res.json({ user: req.user, policy: { passwordMinLength: s.password_min_length } });
});

r.post("/forgot", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!isEmail(email)) throw new HttpError(400, "Enter your work email.");
  const { rows } = await q("SELECT id, name, email FROM users WHERE lower(email) = $1 AND active", [email]);
  if (rows[0]) {
    const sent = await sendPasswordLink(rows[0], "reset");
    await audit(req, "auth", "Requested password reset", "Forgot password", { emailed: sent.emailed }, rows[0]);
  } else await audit(req, "auth", "Password reset for unknown email", email, null, { email });
  // Same answer either way, so the form does not reveal which emails exist.
  res.json({ ok: true });
});

r.post("/reset", async (req, res) => {
  const token = String(req.body?.token || "");
  const password = String(req.body?.password || "");
  const s = await getSettings();
  if (password.length < s.password_min_length)
    throw new HttpError(400, `Use at least ${s.password_min_length} characters for the new password.`);
  const { rows } = await q(
    `SELECT pr.user_id, u.id, u.name, u.email FROM password_resets pr JOIN users u ON u.id = pr.user_id
     WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > now() AND u.active`,
    [sha256(token)],
  );
  if (!rows[0]) throw new HttpError(400, "This link is invalid or has expired. Ask for a new one.");
  const hash = await bcrypt.hash(password, 12);
  await q("UPDATE users SET password_hash = $2, failed_attempts = 0, locked_until = NULL WHERE id = $1", [rows[0].user_id, hash]);
  await q("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [rows[0].user_id]);
  const closed = await endUserSessions(rows[0].user_id, "password_changed");
  await audit(req, "auth", "Password set by link", "Reset / invite link used", closed ? { otherSessionsSignedOut: closed } : null, rows[0]);
  res.json({ ok: true });
});

r.post("/change-password", requireAuth, async (req, res) => {
  const current = String(req.body?.current || "");
  const next = String(req.body?.next || "");
  const s = await getSettings();
  if (!current) throw new HttpError(400, "Enter your current password.");
  if (next.length < s.password_min_length) throw new HttpError(400, `Use at least ${s.password_min_length} characters for the new password.`);
  if (next === current) throw new HttpError(400, "Choose a password different from the current one.");
  const { rows } = await q("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
  if (!rows[0]?.password_hash || !(await bcrypt.compare(current, rows[0].password_hash)))
    throw new HttpError(400, "Your current password is not correct.");
  await q("UPDATE users SET password_hash = $2 WHERE id = $1", [req.user.id, await bcrypt.hash(next, 12)]);
  const closed = await endUserSessions(req.user.id, "password_changed", req.session.sid);
  await audit(req, "auth", "Changed password", "From My account", closed ? { otherSessionsSignedOut: closed } : null);
  res.json({ ok: true });
});

export default r;
