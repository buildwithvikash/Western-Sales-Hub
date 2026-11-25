import pg from "pg";
import fs from "node:fs";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.");
  process.exit(1);
}

/**
 * DATABASE_SSL for cloud databases (Azure, AWS RDS, Supabase, Neon…):
 *   unset/false  no SSL (a database on this machine or the local network)
 *   true         SSL, and the server's certificate must be valid (recommended)
 *   no-verify    SSL without checking the certificate (only if the provider's certificate is not trusted)
 * DATABASE_CA_FILE: optional path to the provider's CA certificate (.pem) for `true`.
 */
function sslOption() {
  const v = String(process.env.DATABASE_SSL || "").toLowerCase();
  if (!v || v === "false" || v === "0") return undefined;
  if (v === "no-verify") return { rejectUnauthorized: false };
  const ca = process.env.DATABASE_CA_FILE;
  return ca ? { rejectUnauthorized: true, ca: fs.readFileSync(ca, "utf8") } : { rejectUnauthorized: true };
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslOption(),
  max: Number(process.env.DATABASE_POOL_MAX) || 10,
});
pool.on("error", (e) => console.error("[db] idle connection error:", e.message)); // never crash on a dropped connection

export const q = (text, params) => pool.query(text, params);

/** Run fn(client) inside a transaction. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
