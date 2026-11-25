// Back up the database and the uploaded files.
//   npm run backup -w server
// Creates BACKUP_DIR/<date-time>/ with database.dump (pg_dump custom format) and uploads/ (a copy of
// UPLOAD_DIR), then deletes all but the newest BACKUP_KEEP backups (default 14).
// Schedule it daily (Windows Task Scheduler / cron) and copy BACKUP_DIR to another machine or cloud storage.
//
// Restore:  pg_restore --clean --if-exists -d <database> database.dump   and copy uploads/ back to UPLOAD_DIR.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_DIR = path.resolve(serverDir, process.env.BACKUP_DIR || "../backups");
const UPLOAD_DIR = path.resolve(serverDir, process.env.UPLOAD_DIR || "uploads");
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

function findPgDump() {
  if (process.env.PG_DUMP) return process.env.PG_DUMP;
  const onPath = spawnSync(process.platform === "win32" ? "where" : "which", ["pg_dump"], { encoding: "utf8" });
  if (onPath.status === 0) return onPath.stdout.split(/\r?\n/)[0].trim();
  if (process.platform === "win32") {
    const base = "C:\\Program Files\\PostgreSQL";
    const versions = fs.existsSync(base) ? fs.readdirSync(base).filter((v) => /^\d+/.test(v)).sort((a, b) => parseFloat(b) - parseFloat(a)) : [];
    for (const v of versions) {
      const p = path.join(base, v, "bin", "pg_dump.exe");
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error("pg_dump was not found. Install the PostgreSQL client tools or set PG_DUMP to its full path.");
}

function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (server/.env).");
  // Pass the connection as PG* variables: works even when the password contains characters like @.
  const u = new URL(process.env.DATABASE_URL);
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    ...(process.env.DATABASE_SSL && process.env.DATABASE_SSL !== "false" ? { PGSSLMODE: "require" } : {}),
  };

  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const dir = path.join(BACKUP_DIR, stamp);
  fs.mkdirSync(dir, { recursive: true });

  const dumpFile = path.join(dir, "database.dump");
  const r = spawnSync(findPgDump(), ["--format=custom", "--no-owner", "--file", dumpFile], { env, encoding: "utf8" });
  if (r.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`pg_dump failed: ${(r.stderr || r.error?.message || "").trim()}`);
  }

  let files = 0;
  if (fs.existsSync(UPLOAD_DIR)) {
    fs.cpSync(UPLOAD_DIR, path.join(dir, "uploads"), { recursive: true });
    files = fs.readdirSync(path.join(dir, "uploads")).filter((f) => f !== ".gitkeep").length;
  }

  const old = fs.readdirSync(BACKUP_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}-/.test(d)).sort().reverse().slice(KEEP);
  for (const d of old) fs.rmSync(path.join(BACKUP_DIR, d), { recursive: true, force: true });

  const mb = (fs.statSync(dumpFile).size / 1048576).toFixed(2);
  console.log(`Backup written to ${dir}\n  database.dump: ${mb} MB\n  uploads: ${files} file(s)${old.length ? `\n  removed ${old.length} older backup(s)` : ""}`);
}

try {
  main();
} catch (e) {
  console.error(`Backup failed: ${e.message}`);
  process.exitCode = 1;
}
