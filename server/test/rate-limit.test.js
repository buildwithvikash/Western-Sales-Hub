// Rate limits on sign-in and password reset (runs in its own process with limits switched on).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";

const base = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const dbName = `sales_hub_test_${crypto.randomBytes(4).toString("hex")}`;
const adminUrl = Object.assign(new URL(base), { pathname: "/postgres" }).toString();
Object.assign(process.env, {
  DATABASE_URL: Object.assign(new URL(base), { pathname: `/${dbName}` }).toString(),
  JWT_SECRET: process.env.JWT_SECRET || "test-secret-0123456789abcdef",
  MAIL_TRANSPORT: "log",
  NODE_ENV: "test",
});
delete process.env.RATE_LIMIT;

let server, url, pool;
before(async () => {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();
  ({ pool } = await import("../src/db.js"));
  await (await import("../src/migrate.js")).runMigrations(pool, () => {});
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
});

const post = (p, body) => fetch(url + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("sign-in: the 11th attempt for one email within 15 minutes is refused", async () => {
  for (let i = 0; i < 10; i++) assert.equal((await post("/auth/login", { email: "victim@test.local", password: "x" })).status, 401);
  const r = await post("/auth/login", { email: "victim@test.local", password: "x" });
  assert.equal(r.status, 429);
  assert.equal((await r.json()).code, "RATE_LIMITED");
  // A different email from the same place is still allowed (until the per-network limit).
  assert.equal((await post("/auth/login", { email: "other@test.local", password: "x" })).status, 401);
});

test("forgot password: at most 3 reset emails per address per hour", async () => {
  for (let i = 0; i < 3; i++) assert.equal((await post("/auth/forgot", { email: "someone@test.local" })).status, 200);
  assert.equal((await post("/auth/forgot", { email: "someone@test.local" })).status, 429);
});
