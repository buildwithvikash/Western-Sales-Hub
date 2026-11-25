# Western Sales Hub

A React + Node.js (Express) + PostgreSQL app built from `Western_Sales_Hub_Wireframe_Final_v3.html`.

- **client/**: React 19 + Vite + React Router, styled with the QMAS design system: Tailwind CSS v4, Outfit font,
  lucide icons, react-hot-toast, light/dark mode (`src/index.css`, `src/styles/dark.css`, `src/theme.js`).
  Shared components are in `src/components/ui.jsx`; the app shell (top bar + sidebar) is `src/components/Layout.jsx`.
- **server/**: Express 5 API with PostgreSQL (`pg`), session cookies (JWT, httpOnly), bcrypt passwords, file uploads (multer).

## Setup

1. Create a database (Postgres 14+). With the PostgreSQL 18 install on this machine:

   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres sales_hub
   ```

2. Configure the server:

   ```powershell
   Copy-Item server\.env.example server\.env
   ```

   Edit `server\.env`: set `DATABASE_URL` (your postgres password), a long random `JWT_SECRET`, and the seed passwords.

3. Install, create tables and load the sample data:

   ```powershell
   npm install
   ```

   ```powershell
   npm run db:init
   ```

4. Run in development (API on :4000, React on :5173 with `/api` proxied):

   ```powershell
   npm run dev
   ```

   Open http://localhost:5173 and sign in with the seed accounts from `server\.env`
   (`admin@company.com` is the admin; `rep1@company.com` / `rep2@company.com` are reps).

## Production

```powershell
npm run build
```

```powershell
npm start
```

The server then also serves the built React app from `client/dist` on `PORT`. For a real deployment:

- Set `NODE_ENV=production` (HTTPS-only cookies, stricter headers; set-password links are no longer shown to admins).
- Put HTTPS in front (IIS, nginx, Caddy or a cloud load balancer) and set `TRUST_PROXY` (e.g. `1` for one proxy)
  so real client IPs reach the rate limits and the activity log.
- Cloud PostgreSQL: set `DATABASE_SSL=true` (and `DATABASE_CA_FILE` if the provider gives a CA certificate).
- Schedule `npm run backup` daily and copy the `backups` folder off the server.
- **Docker** (not tested here, Docker was not installed on the build machine): `docker compose up -d` runs the app
  and PostgreSQL together; see the comments at the top of `docker-compose.yml`.

Database changes ship as numbered files in `server/db/migrations`; the server applies new ones automatically
when it starts (or run `npm run db:init`).

### Security in place
Security headers and a strict Content-Security-Policy (helmet); rate limits on sign-in (10 per email / 50 per
network per 15 min), password reset (3 per email per hour) and the API overall; uploaded files are only ever
shown inline if they are pictures, video or audio (everything else downloads, sandboxed); server-side sessions:
changing or resetting a password signs out the user's other devices, deactivation signs them out at once,
admins can sign a user out everywhere; at least one active admin is always kept.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API + React dev servers together |
| `npm run db:init` | Apply new database migrations; load sample data only into an empty database |
| `npm run db:reset` | **Deletes all data**, recreates tables and sample data |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Automated API tests (14). Each run uses its own temporary database, created and dropped automatically |
| `npm run backup` | Database dump + copy of uploaded files into `backups/<date-time>/`, keeps the newest 14 |
| `npm run check-mail -w server` | Check the email settings without sending anything |

## What is real vs. the wireframe

- **Sign-in, roles, sessions**: real accounts in Postgres. Account lockout after N failed attempts (15 min) and
  inactivity timeout, both set on Admin → Settings. Expired sessions show the "Session expired" screen.
- **Email (password reset links and new-user invites)**: sent with nodemailer through an outbox, as in QMAS
  (`server/src/mailer.js`). Mail is queued in the `mail_outbox` table and sent by a background worker that retries
  failures with growing delays (gives up after 8 attempts). Configure it in `server/.env`:
  - `MAIL_TRANSPORT=log` (default): nothing is sent; emails are printed in the server console, and admins see the
    set-password link on screen so they can pass it on.
  - `MAIL_TRANSPORT=smtp` with `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`.
    Office 365: `smtp.office365.com:587`; Gmail: `smtp.gmail.com:587` with an app password;
    AWS SES: `email-smtp.<region>.amazonaws.com:587`.
  - `MAIL_TRANSPORT=graph` (recommended for Outlook / Microsoft 365): sends with OAuth through Microsoft Graph, so
    it is not affected by Microsoft retiring password SMTP. Set `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`,
    and `MAIL_FROM` with a real mailbox address. See "Outlook setup" below.
  - `MAIL_REDIRECT_TO` (testing only) sends every email to one inbox; the subject names the real recipient.

  Check the SMTP login with `npm run check-mail -w server`, then restart the server. Admin → Settings → Email shows
  the current mode, sent/waiting/failed counts and recent errors, and has a **Send test email** button.
  After upgrading an existing database, run `npm run db:init` once to add the `mail_outbox` table.
- **Files**: stored on disk in `server/uploads` (`UPLOAD_DIR`). Every upload of a new version is kept, and reps only ever
  get the current version. The first image uploaded becomes the product image.
- **Dashboard and reports**: real numbers from usage events (product views, downloads, submitted searches, sign-ins),
  filterable by period, region and team, with CSV export.
- **Activity log** (Insights → Activity log): who did what and when, with IP address and browser.
  - Sign-ins, sign-outs with session length, sessions that timed out, failed sign-ins (with the reason), account locks
    and password changes/resets.
  - Content changes field by field (old → new; rows added/removed for specs, pitch, objections, battlecard),
    publish/unpublish, categories, uploads and new versions.
  - Downloads (file, product, type, version), product views and searches; user admin; settings changes.

  Filter by category, person, date range and text (text also searches inside the change details); click a row for
  the full details; Export CSV uses the current filters. A timed-out session is logged when the person next opens
  the app. Behind a reverse proxy, set `TRUST_PROXY` (Express "trust proxy" value) so the real client IP is logged.
- Not carried over: the wireframe's "Screens" menu and "Make the next upload fail" demo switch.

## Data model (server/db/migrations)

`users`, `sessions`, `password_resets`, `categories`, `products` (specs / pitch / objections / battlecard as JSONB),
`product_files` + `file_versions`, `events` (usage), `audit_log`, `mail_outbox`, `settings`, `schema_migrations`.
Activity-log entries and usage events older than the retention setting (Settings, default 365 days) are deleted daily.

## Outlook setup (Microsoft 365, MAIL_TRANSPORT=graph)

Done once by a Microsoft 365 / Entra admin:

1. **Sending mailbox.** Pick the address emails come from, e.g. `saleshub@yourcompany.com`. A shared mailbox
   works and needs no licence.
2. **App registration.** Entra admin center → App registrations → New registration (name: *Western Sales Hub mail*,
   single tenant, no redirect URI). Note the **Application (client) ID** and **Directory (tenant) ID**.
3. **Permission.** API permissions → Add → Microsoft Graph → **Application permissions** → `Mail.Send` →
   **Grant admin consent**.
4. **Secret.** Certificates & secrets → New client secret. Copy the **Value** (shown once). Note its expiry date
   and renew it before then.
5. **Limit the app to the one mailbox (strongly recommended).** `Mail.Send` as an application permission
   can send as *any* mailbox in the tenant. Restrict it in Exchange Online PowerShell, using
   [RBAC for Applications](https://learn.microsoft.com/exchange/permissions-exo/application-rbac) (or the older
   Application Access Policy), so it can only send as the Sales Hub mailbox.

Then, in `server/.env`:

```
MAIL_TRANSPORT=graph
MAIL_FROM=Western Sales Hub <saleshub@yourcompany.com>
MS_TENANT_ID=<directory (tenant) id>
MS_CLIENT_ID=<application (client) id>
MS_CLIENT_SECRET=<secret value>
```

Check with `npm run check-mail -w server`, restart the server, and use Settings → Email → **Send test email**.
If the test fails with 403 / *Access denied*, admin consent is missing or the mailbox is outside the app's allowed
scope. If it fails with 404 / *ResourceNotFound*, the `MAIL_FROM` address is not a mailbox in the tenant.

**Quick alternative (temporary):** `MAIL_TRANSPORT=smtp` with `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`,
the mailbox's address and password. This needs SMTP AUTH enabled for the mailbox, and Microsoft turns password
SMTP off by default from the end of December 2026, so use Graph for anything lasting.
