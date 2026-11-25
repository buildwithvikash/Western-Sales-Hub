// Outgoing email, as in QMAS: mail is queued in mail_outbox and sent by a background worker.
//   MAIL_TRANSPORT=log   (default) nothing leaves the machine; the mail is printed to the console
//   MAIL_TRANSPORT=smtp  sent through SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS
//   MAIL_TRANSPORT=graph sent through Outlook / Microsoft 365 with OAuth (Microsoft Graph sendMail)
//   MAIL_REDIRECT_TO     testing only: every mail goes to this address (subject names the real recipient)
import nodemailer from "nodemailer";
import { q, pool } from "./db.js";

const MAX_ATTEMPTS = 8;
const LEASE_MINUTES = 5;

/** True when mail really leaves the machine. */
export const mailSends = () => mailMode() !== "log";
export const mailMode = () => (["smtp", "graph"].includes(process.env.MAIL_TRANSPORT) ? process.env.MAIL_TRANSPORT : "log");
/** Sender: MAIL_FROM, else the SMTP mailbox (Outlook only sends as the signed-in account). */
export const from = () =>
  process.env.MAIL_FROM || (process.env.SMTP_USER ? `Western Sales Hub <${process.env.SMTP_USER}>` : "Western Sales Hub <no-reply@example.com>");
/** "Name <a@b.com>" → "a@b.com" */
const addressOf = (s) => (String(s).match(/<([^>]+)>/)?.[1] || String(s)).trim();

/* ---------- Outlook / Microsoft 365 through Microsoft Graph (OAuth, app-only) ----------
 * Needs an app registration in Microsoft Entra ID with the Microsoft Graph application permission
 * Mail.Send (admin consent), and a client secret. MAIL_FROM must be a real mailbox in the tenant
 * (a shared mailbox such as no-reply@company.com is fine). Env: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET.
 * MS_LOGIN_HOST / MS_GRAPH_HOST are only for national clouds (e.g. login.microsoftonline.us).
 */
const loginHost = () => process.env.MS_LOGIN_HOST || "https://login.microsoftonline.com";
const graphHost = () => process.env.MS_GRAPH_HOST || "https://graph.microsoft.com";
let graphToken = null; // { value, expires }

async function getGraphToken() {
  if (graphToken && graphToken.expires > Date.now() + 60_000) return graphToken.value;
  for (const k of ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET"]) if (!process.env[k]) throw new Error(`${k} is not set.`);
  const res = await fetch(`${loginHost()}/${encodeURIComponent(process.env.MS_TENANT_ID)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      scope: `${graphHost()}/.default`,
      grant_type: "client_credentials",
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) throw new Error(`Microsoft sign-in failed: ${d.error_description?.split("\r\n")[0] || d.error || res.status}`);
  graphToken = { value: d.access_token, expires: Date.now() + (d.expires_in || 3600) * 1000 };
  return graphToken.value;
}

const graphTransport = {
  async sendMail({ from: fromHeader, to, subject, text, html }) {
    const sender = addressOf(fromHeader);
    const res = await fetch(`${graphHost()}/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await getGraphToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: html ? { contentType: "HTML", content: html } : { contentType: "Text", content: text },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: false,
      }),
    });
    if (res.status === 401) graphToken = null; // fetch a fresh token next time
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(`Outlook rejected the email (${res.status}): ${d.error?.message || res.statusText}`);
    }
  },
};

let transport;
function getTransport() {
  if (transport) return transport;
  if (mailMode() === "graph") transport = graphTransport;
  else if (mailMode() === "smtp") {
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } else transport = nodemailer.createTransport({ jsonTransport: true });
  return transport;
}

/** Checks the mail settings (SMTP login, or a Microsoft token for Graph); sends nothing. */
export async function verifyMail() {
  if (mailMode() === "graph") {
    if (!/@/.test(addressOf(from()))) throw new Error("MAIL_FROM must contain the sending mailbox's address.");
    await getGraphToken();
    return { transport: "graph", host: "Microsoft Graph", sender: addressOf(from()) };
  }
  if (mailMode() !== "smtp") return { transport: "log" };
  for (const k of ["SMTP_HOST", ...(/office365|outlook/i.test(process.env.SMTP_HOST || "") ? ["SMTP_USER", "SMTP_PASS"] : [])])
    if (!process.env[k]) throw new Error(`${k} is not set in server/.env.`);
  await getTransport().verify();
  return { transport: "smtp", host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587 };
}

/** Queue a mail. Pass `db` to queue it inside a transaction. */
export async function queueMail({ to, subject, text, html }, db = pool) {
  await db.query("INSERT INTO mail_outbox (to_address, subject, body_text, body_html) VALUES ($1,$2,$3,$4)", [to, subject, text, html || null]);
  kick();
}

/**
 * Send due mail. Rows are leased (next_attempt_at pushed ahead) under SKIP LOCKED, so two server
 * processes never send the same mail twice; failures retry with growing delays, then FAILED.
 */
export async function sendPendingMail(limit = 20) {
  const { rows } = await q(
    `UPDATE mail_outbox SET next_attempt_at = now() + make_interval(mins => ${LEASE_MINUTES})
      WHERE id IN (SELECT id FROM mail_outbox WHERE status = 'PENDING' AND next_attempt_at <= now()
                    ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
      RETURNING id, to_address, subject, body_text, body_html, attempts`,
    [limit],
  );
  let sent = 0;
  for (const m of rows) {
    try {
      const redirect = process.env.MAIL_REDIRECT_TO;
      const to = redirect || m.to_address;
      const subject = redirect ? `${m.subject} (for ${m.to_address})` : m.subject;
      await getTransport().sendMail({ from: from(), to, subject, text: m.body_text, html: m.body_html || undefined });
      await q("UPDATE mail_outbox SET status = 'SENT', sent_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1", [m.id]);
      if (mailMode() === "log") console.log(`[mail not sent: MAIL_TRANSPORT=log] to ${m.to_address}: ${m.subject}\n${m.body_text}\n`);
      sent++;
    } catch (err) {
      const attempts = m.attempts + 1;
      await q(
        `UPDATE mail_outbox SET attempts = $2::smallint, last_error = $3,
                status = CASE WHEN $2::smallint >= ${MAX_ATTEMPTS} THEN 'FAILED' ELSE 'PENDING' END,
                next_attempt_at = now() + make_interval(mins => $4::int) WHERE id = $1`,
        [m.id, attempts, String(err.message).slice(0, 500), Math.min(2 ** attempts, 240)],
      );
      console.warn(`[mail] send to ${m.to_address} failed (attempt ${attempts}): ${err.message}`);
    }
  }
  return sent;
}

/* ---------- background worker ---------- */
let timer;
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    while ((await sendPendingMail()) > 0);
  } catch (e) {
    console.warn("[mail] worker error:", e.message);
  } finally {
    running = false;
  }
}
/** Send soon after something is queued, instead of waiting for the next poll. */
const kick = () => setTimeout(tick, 50);

export function startMailWorker(intervalMs = 30_000) {
  if (timer) return;
  timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  console.log(
    mailMode() === "graph"
      ? `Mail: Outlook (Microsoft Graph) from ${addressOf(from())}${process.env.MAIL_REDIRECT_TO ? ` (all mail redirected to ${process.env.MAIL_REDIRECT_TO})` : ""}`
      : mailMode() === "smtp"
      ? `Mail: SMTP via ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}${process.env.MAIL_REDIRECT_TO ? ` (all mail redirected to ${process.env.MAIL_REDIRECT_TO})` : ""}`
      : "Mail: MAIL_TRANSPORT=log, emails are printed here and not sent",
  );
}

/* ---------- templates ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function layout({ heading, intro, button, link, outro }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f2f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f9;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
<tr><td style="height:4px;background:#3f8f3a"></td></tr>
<tr><td style="padding:28px 32px 8px"><div style="font-size:20px;font-weight:700;color:#06457a">Western Sales Hub</div></td></tr>
<tr><td style="padding:8px 32px 0"><h1 style="margin:0 0 12px;font-size:18px;color:#0f172a">${esc(heading)}</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155">${esc(intro)}</p>
<a href="${esc(link)}" style="display:inline-block;background:#0067b8;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px">${esc(button)}</a>
<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#64748b">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;color:#0067b8">${esc(link)}</span></p>
<p style="margin:16px 0 28px;font-size:12px;line-height:1.6;color:#64748b">${esc(outro)}</p></td></tr>
</table><p style="font-size:11px;color:#94a3b8;margin:16px 0 0">Western Refrigeration Pvt. Ltd. · This is an automatic message, please do not reply.</p>
</td></tr></table></body></html>`;
  const text = `${heading}\n\n${intro}\n\n${button}: ${link}\n\n${outro}\n\nWestern Refrigeration Pvt. Ltd. - automatic message, please do not reply.`;
  return { html, text };
}

const fmtMinutes = (m) => (m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? "" : "s"}` : m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`);

export function resetMail({ name, link, minutes }) {
  return {
    subject: "Reset your Sales Hub password",
    ...layout({
      heading: `Hello ${name},`,
      intro: "We received a request to reset the password for your Western Sales Hub account. Use the button below to choose a new password.",
      button: "Reset password",
      link,
      outro: `This link works once and expires in ${fmtMinutes(minutes)}. If you did not ask for a password reset, you can ignore this email; your password stays the same.`,
    }),
  };
}

export function inviteMail({ name, link, minutes }) {
  return {
    subject: "Your Sales Hub account is ready",
    ...layout({
      heading: `Welcome, ${name}`,
      intro: "An account has been created for you on the Western Sales Hub, where you will find specs, brochures, sales pitches and battlecards for every product. Set your password to get started.",
      button: "Set your password",
      link,
      outro: `This link works once and expires in ${fmtMinutes(minutes)}. If it has expired, use "Forgot password?" on the sign-in page.`,
    }),
  };
}
