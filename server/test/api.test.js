// API tests. Each run creates its own temporary database (named sales_hub_test_<random>) on the
// Postgres server in DATABASE_URL (or TEST_DATABASE_URL), and drops it afterwards.
//   npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import bcrypt from "bcryptjs";

const base = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const dbName = `sales_hub_test_${crypto.randomBytes(4).toString("hex")}`;
const adminUrl = Object.assign(new URL(base), { pathname: "/postgres" }).toString();
const testUrl = Object.assign(new URL(base), { pathname: `/${dbName}` }).toString();
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), "saleshub-test-"));

// Configure the app for testing *before* it is imported (db.js reads DATABASE_URL on import).
Object.assign(process.env, {
  DATABASE_URL: testUrl,
  JWT_SECRET: process.env.JWT_SECRET || "test-secret-0123456789abcdef",
  MAIL_TRANSPORT: "log",
  RATE_LIMIT: "off",
  UPLOAD_DIR: uploads,
  NODE_ENV: "test",
});
delete process.env.MAIL_REDIRECT_TO;

let server, url, pool, q, closeTimedOutSessions, applyRetention;
const PW = { admin: "Admin-pass-123", rep: "Rep-pass-12345" };

before(async () => {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  const db = await import("../src/db.js");
  ({ pool, q } = db);
  const { runMigrations } = await import("../src/migrate.js");
  await runMigrations(pool, () => {});
  ({ closeTimedOutSessions, applyRetention } = await import("../src/housekeeping.js"));

  const a = await bcrypt.hash(PW.admin, 4);
  const r = await bcrypt.hash(PW.rep, 4);
  await q(
    `INSERT INTO users (name, email, password_hash, role, region, team) VALUES
      ('Test Admin','admin@test.local',$1,'Admin','North','A'), ('Test Rep','rep@test.local',$2,'Rep','South','B'),
      ('Second Rep','rep2@test.local',$2,'Rep','South','B')`,
    [a, r],
  );
  await q("INSERT INTO categories (name) VALUES ('Coolers'), ('Freezers')");

  const { app } = await import("../src/app.js");
  await new Promise((ok) => (server = app.listen(0, ok)));
  url = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server?.close();
  await pool?.end();
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  fs.rmSync(uploads, { recursive: true, force: true });
});

/** A signed-in browser: keeps its own session cookie. */
function client() {
  let cookie = "";
  const call = async (method, p, body, headers = {}) => {
    const opts = { method, headers: { ...headers, ...(cookie ? { cookie } : {}) }, redirect: "manual" };
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url + p, opts);
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const type = res.headers.get("content-type") || "";
    const data = type.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  };
  return {
    get: (p, h) => call("GET", p, undefined, h),
    post: (p, b) => call("POST", p, b),
    put: (p, b) => call("PUT", p, b),
    del: (p) => call("DELETE", p),
    login: async (email, password) => call("POST", "/auth/login", { email, password }),
  };
}
const signedIn = async (who) => {
  const c = client();
  const r = await c.login(`${who}@test.local`, PW[who.replace(/\d$/, "")]);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return c;
};
const lastLog = async (action) => (await q("SELECT * FROM audit_log WHERE action = $1 ORDER BY id DESC LIMIT 1", [action])).rows[0];

test("security headers are sent", async () => {
  const r = await fetch(url + "/health");
  assert.match(r.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-powered-by"), null);
});

test("sign-in: wrong password is refused and logged; right password works", async () => {
  const c = client();
  const bad = await c.login("rep@test.local", "nope");
  assert.equal(bad.status, 401);
  assert.equal((await lastLog("Failed sign-in")).item, "Wrong password");
  const unknown = await c.login("ghost@test.local", "nope");
  assert.equal(unknown.status, 401);
  const ok = await c.login("rep@test.local", PW.rep);
  assert.equal(ok.status, 200);
  assert.equal((await c.get("/auth/me")).data.user.email, "rep@test.local");
});

test("reps cannot use admin endpoints", async () => {
  const rep = await signedIn("rep");
  assert.equal((await rep.get("/users")).status, 403);
  assert.equal((await rep.post("/products", { name: "X" })).status, 403);
  assert.equal((await rep.get("/admin/audit")).status, 403);
});

test("a product is only stored on its first save, edits are logged field by field, and it can be deleted", async () => {
  const admin = await signedIn("admin");
  const before = (await q("SELECT count(*)::int n FROM products")).rows[0].n;
  assert.equal((await admin.post("/products", { name: "" })).status, 400, "nameless product refused");
  assert.equal((await q("SELECT count(*)::int n FROM products")).rows[0].n, before, "no empty draft created");

  const created = await admin.post("/products", { name: "Cooler One", categoryId: 1, specs: [["Volume", "500 L"]] });
  assert.equal(created.status, 201);
  const p = created.data;
  const saved = await admin.put(`/products/${p.id}`, { ...p, subtitle: "Glass door", specs: [["Volume", "520 L"], ["Shelves", "4"]] });
  assert.equal(saved.status, 200);
  const log = await lastLog("Edited product");
  const changes = log.details.changes;
  assert.deepEqual(changes.find((c) => c.field === "Subtitle"), { field: "Subtitle", from: "", to: "Glass door" });
  const specs = changes.find((c) => c.field === "Specifications");
  assert.deepEqual(specs.added.sort(), ["Shelves · 4", "Volume · 520 L"]);
  assert.deepEqual(specs.removed, ["Volume · 500 L"]);

  assert.equal((await admin.del(`/products/${p.id}`)).status, 200);
  assert.equal((await admin.get(`/products/${p.id}`)).status, 404);
  assert.ok(await lastLog("Deleted product"));
});

test("files: versions, reps only get the current one, unsafe types are never shown inline, delete removes from disk", async () => {
  const admin = await signedIn("admin");
  const rep = await signedIn("rep");
  const { data: p } = await admin.post("/products", { name: "File Test", categoryId: 1, publish: true });

  const up = new FormData();
  up.append("type", "media");
  up.append("files", new Blob(["<script>alert(1)</script>"], { type: "text/html" }), "page.html");
  assert.equal((await admin.post(`/files/product/${p.id}`, up)).status, 201);
  const file = (await admin.get(`/products/${p.id}`)).data.files.media[0];

  const v2 = new FormData();
  v2.append("file", new Blob(["<b>v2</b>"], { type: "text/html" }), "page-v2.html");
  assert.equal((await admin.post(`/files/${file.id}/versions`, v2)).status, 201);
  const versions = (await admin.get(`/files/${file.id}/versions`)).data;
  const [current, old] = versions;
  assert.equal(current.version, 2);

  const inline = await rep.get(`/files/versions/${current.id}/download?inline=1`);
  assert.equal(inline.status, 200);
  assert.equal(inline.headers.get("content-type"), "application/octet-stream", "HTML is never served as HTML");
  assert.match(inline.headers.get("content-disposition") || "", /attachment/);
  assert.match(inline.headers.get("content-security-policy"), /sandbox/);
  assert.equal((await rep.get(`/files/versions/${old.id}/download`)).status, 404, "reps cannot fetch older versions");
  assert.equal((await lastLog("Downloaded file")).item, "page-v2.html");

  const stored = (await q("SELECT storage_name FROM file_versions WHERE file_id = $1", [file.id])).rows.map((r) => r.storage_name);
  assert.ok(stored.every((n) => fs.existsSync(path.join(uploads, n))));
  assert.equal((await admin.del(`/files/${file.id}`)).status, 200);
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(stored.every((n) => !fs.existsSync(path.join(uploads, n))), "files removed from disk");
});

test("changing the password signs out the user's other devices but keeps this one", async () => {
  const deviceA = await signedIn("rep2");
  const deviceB = await signedIn("rep2");
  const r = await deviceA.post("/auth/change-password", { current: PW.rep, next: "Brand-new-pass-1" });
  assert.equal(r.status, 200);
  assert.equal((await deviceA.get("/auth/me")).status, 200, "this device stays signed in");
  const b = await deviceB.get("/auth/me");
  assert.equal(b.status, 401);
  assert.equal(b.data.code, "SESSION_ENDED");
  assert.match(b.data.error, /password/);
  await deviceA.post("/auth/change-password", { current: "Brand-new-pass-1", next: PW.rep });
});

test("deactivating a user signs them out at once; the last admin cannot be removed", async () => {
  const admin = await signedIn("admin");
  const rep = await signedIn("rep2");
  const id = (await q("SELECT id FROM users WHERE email = 'rep2@test.local'")).rows[0].id;
  assert.equal((await admin.post(`/users/${id}/toggle-active`)).data.active, false);
  assert.equal((await rep.get("/auth/me")).status, 401);
  await admin.post(`/users/${id}/toggle-active`);

  const adminId = (await q("SELECT id FROM users WHERE email = 'admin@test.local'")).rows[0].id;
  const demote = await admin.put(`/users/${adminId}`, { role: "Rep" });
  assert.equal(demote.status, 400);
  assert.match(demote.data.error, /at least one active admin/);
});

test("edit user, unlock, and sign out everywhere", async () => {
  const admin = await signedIn("admin");
  const id = (await q("SELECT id FROM users WHERE email = 'rep@test.local'")).rows[0].id;
  const r = await admin.put(`/users/${id}`, { name: "Renamed Rep", region: "East" });
  assert.equal(r.status, 200);
  assert.equal(r.data.name, "Renamed Rep");
  assert.deepEqual((await lastLog("Edited user")).details.changes.map((c) => c.field).sort(), ["Name", "Region"]);

  await q("UPDATE users SET locked_until = now() + interval '10 minutes' WHERE id = $1", [id]);
  assert.equal((await client().login("rep@test.local", PW.rep)).status, 423);
  assert.equal((await admin.post(`/users/${id}/unlock`)).status, 200);
  const rep = await signedIn("rep");

  const out = await admin.post(`/users/${id}/sign-out`);
  assert.ok(out.data.sessionsEnded >= 1);
  assert.equal((await rep.get("/auth/me")).status, 401);
});

test("sign-out and timeouts are logged with the right times", async () => {
  const rep = await signedIn("rep");
  await rep.post("/auth/logout");
  assert.match((await lastLog("Signed out")).item, /^Session \d+ min$/);

  // A session idle for longer than the timeout: the request is refused and the timeout is logged
  // at the moment the session really expired (last activity + timeout), once.
  const rep2 = await signedIn("rep");
  const sid = (await q("SELECT id FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1")).rows[0].id;
  await q("UPDATE sessions SET last_seen_at = now() - interval '2 hours' WHERE id = $1", [sid]);
  const r = await rep2.get("/auth/me");
  assert.equal(r.status, 401);
  assert.equal(r.data.code, "SESSION_EXPIRED");
  const logs = (await q("SELECT * FROM audit_log WHERE action = 'Session timed out' AND details->>'session' = $1", [sid.slice(0, 12)])).rows;
  assert.equal(logs.length, 1);
  const s = (await q("SELECT * FROM sessions WHERE id = $1", [sid])).rows[0];
  assert.equal(new Date(logs[0].created_at).getTime(), new Date(s.ended_at).getTime());

  // The background job closes sessions nobody comes back to.
  await signedIn("rep");
  await q("UPDATE sessions SET last_seen_at = now() - interval '3 hours' WHERE ended_at IS NULL");
  assert.ok((await closeTimedOutSessions()) >= 1);
  assert.equal((await q("SELECT count(*)::int n FROM sessions WHERE ended_at IS NULL")).rows[0].n, 0);
});

test("search sees changes at once (catalogue cache is cleared on every change)", async () => {
  const admin = await signedIn("admin");
  const rep = await signedIn("rep");
  assert.equal((await rep.get("/search?q=zebracooler")).data.results.length, 0);
  const { data: p } = await admin.post("/products", { name: "ZebraCooler 9", categoryId: 1, publish: true });
  assert.equal((await rep.get("/search?q=zebracooler")).data.results.length, 1);
  await admin.post(`/products/${p.id}/unpublish`);
  assert.equal((await rep.get("/search?q=zebracooler")).data.results.length, 0);
});

test("activity log: date filters follow the viewer's time zone", async () => {
  const admin = await signedIn("admin");
  // 23:30 UTC on 1 Jan 2026 is already 2 Jan in India (UTC+5:30).
  await q("INSERT INTO audit_log (user_email, category, action, item, created_at) VALUES ('tz@test.local','content','TZ check','x','2026-01-01T23:30:00Z')");
  const india = await admin.get("/admin/audit?q=TZ%20check&from=2026-01-02&to=2026-01-02&tz=Asia/Kolkata");
  const utc = await admin.get("/admin/audit?q=TZ%20check&from=2026-01-02&to=2026-01-02&tz=UTC");
  assert.equal(india.data.total, 1);
  assert.equal(utc.data.total, 0);
});

test("retention deletes old activity; empty untitled drafts are cleaned up", async () => {
  await q("INSERT INTO audit_log (user_email, category, action, created_at) VALUES ('old@test.local','usage','Old entry', now() - interval '400 days')");
  await q("INSERT INTO products (name, created_at) VALUES ('', now() - interval '2 days')");
  const r = await applyRetention();
  assert.ok(r.activity >= 1);
  assert.ok(r.emptyDrafts >= 1);
  assert.equal((await q("SELECT count(*)::int n FROM audit_log WHERE action = 'Old entry'")).rows[0].n, 0);
});
