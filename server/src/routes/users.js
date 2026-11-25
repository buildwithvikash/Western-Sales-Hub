import { Router } from "express";
import multer from "multer";
import { q } from "../db.js";
import { USER_COLS } from "../auth.js";
import { mailSends } from "../mailer.js";
import { audit, sendPasswordLink, HttpError, isEmail, parseCsv } from "../lib.js";

const r = Router(); // mounted behind requireAdmin
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

r.get("/", async (req, res) => {
  const { rows } = await q(`SELECT ${USER_COLS}, last_seen_at FROM users ORDER BY id`);
  res.json(rows.map(({ last_seen_at, ...u }) => ({ ...u, lastSeenAt: last_seen_at })));
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
  const { rows } = await q("UPDATE users SET active = NOT active WHERE id = $1 RETURNING email, active", [req.params.id]);
  if (!rows[0]) throw new HttpError(404, "User not found.");
  await audit(req, "users", rows[0].active ? "Activated user" : "Deactivated user", rows[0].email);
  res.json({ active: rows[0].active });
});

export default r;
