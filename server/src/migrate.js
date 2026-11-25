// Versioned database migrations: server/db/migrations/NNN_name.sql, applied in order, each once,
// inside a transaction. Runs on server start and from `npm run db:init`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations");
const LOCK_ID = 727301; // any constant: serialises migrations when several servers start together

export async function runMigrations(pool, log = console.log) {
  const db = await pool.connect();
  try {
    await db.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    const done = new Set((await db.query("SELECT version FROM schema_migrations")).rows.map((r) => r.version));
    const files = fs.readdirSync(DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    const applied = [];
    for (const f of files) {
      const version = f.replace(/\.sql$/, "");
      if (done.has(version)) continue;
      await db.query("BEGIN");
      try {
        await db.query(fs.readFileSync(path.join(DIR, f), "utf8"));
        await db.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw new Error(`Migration ${f} failed: ${e.message}`);
      }
      applied.push(version);
      log(`Applied migration ${version}`);
    }
    return applied;
  } finally {
    await db.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    db.release();
  }
}
