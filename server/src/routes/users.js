import { Router } from "express";
import multer from "multer";
import { q } from "../db.js";
import { USER_COLS, endUserSessions } from "../auth.js";
import { mailSends } from "../mailer.js";
import { audit, sendPasswordLink, HttpError, isEmail, parseCsv, diffFields } from "../lib.js";

const r = Router(); // mounted behind requireAdmin
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

r.get("/", async (req, res) => {
  const { rows } = await q(
    `SELECT ${USER_COLS.split(", ").map((c) => "u." + c).join(", ")}, u.last_seen_at,
            (u.locked_until > now()) AS locked, u.locked_until, (u.password_hash IS NULL) AS invite_pending,
            (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.ended_at IS NULL) AS open_sessions
       FROM users u ORDER BY u.id`,
  );
  res.json(
    rows.map(({ last_seen_at, locked_until, invite_pending, open_sessions, ...u }) => ({
      ...u,
      lastSeenAt: last_seen_at,
      lockedUntil: u.locked ? locked_until : null,
      invitePending: invite_pending,
      openSessions: open_sessions,
    })),
  );
});

/** Admins left after a change: never allow zero active admins. */
async function guardLastAdmin(userId, { role, active }) {
  const { rows } = await q("SELECT count(*)::int AS n FROM users WHERE role = 'Admin' AND active AND id <> $1", [userId]);
  if (rows[0].n === 0 && (role === "Rep" || active === false)) throw new HttpError(400, "There must be at least one active admin.");
}

// Edit name, role, region and team (email is the sign-in name and stays as it is).
r.put("/:id", async (req, res) => {
  const { rows: cur } = await q(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [req.params.id]);
  const u = cur[0];
  if (!u) throw new HttpError(404, "User not found.");
  const b = req.body || {};
  const next = {
    name: String(b.name ?? u.name).trim(),
    role: b.role === "Admin" || b.role === "Rep" ? b.role : u.role,
    region: String(b.region ?? u.region).trim(),
    team: String(b.team ?? u.team).trim(),
  };
  if (!next.name) throw new HttpError(400, "Enter a name.");
  if (u.role === "Admin" && next.role === "Rep") await guardLastAdmin(u.id, { role: "Rep" });
  await q("UPDATE users SET name = $2, role = $3, region = $4, team = $5 WHERE id = $1", [u.id, next.name, next.role, next.region, next.team]);
  const changes = diffFields([
    ["Name", u.name, next.name],
    ["Role", u.role, next.role],
    ["Region", u.region, next.region],
    ["Team", u.team, next.team],
  ]);
  // A role change takes effect at once: end their sessions so menus and permissions refresh.
  if (u.role !== next.role && u.id !== req.user.id) await endUserSessions(u.id, "revoked");
  if (changes.length) await audit(req, "users", "Edited user", u.email, { changes });
  const { rows } = await q(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [u.id]);
  res.json(rows[0]);
});

r.post("/:id/unlock", async (req, res) => {
  const { rows } = await q("UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE id = $1 RETURNING email", [req.params.id]);
  if (!rows[0]) throw new HttpError(404, "User not found.");
  await audit(req, "users", "Unlocked user", rows[0].email);
  res.json({ ok: true });
});

r.post("/:id/sign-out", async (req, res) => {
  const { rows } = await q("SELECT id, email FROM users WHERE id = $1", [req.params.id]);
  if (!rows[0]) throw new HttpError(404, "User not found.");
  const n = await endUserSessions(rows[0].id, "revoked", rows[0].id === req.user.id ? req.session.sid : null);
  await audit(req, "users", "Signed user out everywhere", rows[0].email, { sessionsEnded: n });
  res.json({ ok: true, sessionsEnded: n });
});

r.post("/", async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  if (!name || !isEmail(email)) throw new HttpError(400, "Enter a name and a valid email.");
  const { rows: dup } = await q("SELECT 1 FROM users WHERE lower(email) = $1", [email]);
  if (dup.length) throw new HttpError(409, "A user with this email already exists.");
  const role = b.role === "Admin" ? "Admin" : "Rep";
  const { rows } = await q(
    `INSERT INTO users (name, email, role, region, team) VALUES ($1,$2,$3,$4,$5) RETURNING ${USER_COLS}`,
    [name, email, role, String(b.region || "").trim(), String(b.team || "").trim()],
  );
  const sent = await sendPasswordLink(rows[0], "invite");
  await audit(req, "users", "Added user", email, { name, role, region: rows[0].region, team: rows[0].team, inviteEmailed: sent.emailed });
  res.status(201).json({ user: rows[0], ...sent });
});

// CSV columns: name, email, role, region, team (header row optional).
r.post("/import", csvUpload.single("file"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "Choose a CSV file.");
  const rows = parseCsv(req.file.buffer.toString("utf8").replace(/^﻿/, ""));
  let imported = 0;
  const skipped = [];
  for (const [i, c] of rows.entries()) {
    const [name, email, role, region, team] = c.map((x) => x.trim());
    if (!isEmail(email)) {
      if (i > 0 || (email || "").toLowerCase() !== "email") skipped.push(`Row ${i + 1}: no valid email`);
      continue;
    }
    const { rows: ins } = await q(
      `INSERT INTO users (name, email, role, region, team) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ((lower(email))) DO NOTHING RETURNING id, name, email`,
      [name || email, email.toLowerCase(), /admin/i.test(role || "") ? "Admin" : "Rep", region || "", team || ""],
    );
    if (!ins[0]) { skipped.push(`Row ${i + 1} (${email}): already exists`); continue; }
    await sendPasswordLink(ins[0], "invite");
    imported++;
  }
  await audit(req, "users", "Imported users", `${imported} imported, ${skipped.length} skipped`, { file: req.file.originalname, skipped: skipped.slice(0, 20) });
  res.json({ imported, skipped, emailed: mailSends() });
});

r.post("/:id/reset-password", async (req, res) => {
  const { rows } = await q("SELECT id, name, email, active FROM users WHERE id = $1", [req.params.id]);
  if (!rows[0]) throw new HttpError(404, "User not found.");
  if (!rows[0].active) throw new HttpError(400, "Activate this user before sending a password reset.");
  const sent = await sendPasswordLink(rows[0], "reset");
  await audit(req, "users", "Sent password reset", rows[0].email, { emailed: sent.emailed });
  res.json({ ok: true, email: rows[0].email, ...sent });
});

r.post("/:id/toggle-active", async (req, res) => {
  if (Number(req.params.id) === req.user.id) throw new HttpError(400, "You cannot deactivate your own account.");
  const { rows: cur } = await q("SELECT role, active FROM users WHERE id = $1", [req.params.id]);
  if (!cur[0]) throw new HttpError(404, "User not found.");
  if (cur[0].role === "Admin" && cur[0].active) await guardLastAdmin(Number(req.params.id), { active: false });
  const { rows } = await q("UPDATE users SET active = NOT active WHERE id = $1 RETURNING id, email, active", [req.params.id]);
  if (!rows[0].active) await endUserSessions(rows[0].id, "deactivated");
  await audit(req, "users", rows[0].active ? "Activated user" : "Deactivated user", rows[0].email);
  res.json({ active: rows[0].active });
});

export default r;
