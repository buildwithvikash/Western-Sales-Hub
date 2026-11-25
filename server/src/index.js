// Server start-up: bring the database up to date, start background jobs, listen.
import { app } from "./app.js";
import { pool } from "./db.js";
import { runMigrations } from "./migrate.js";
import { startMailWorker } from "./mailer.js";
import { startHousekeeping } from "./housekeeping.js";

try {
  await runMigrations(pool);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Sales Hub API listening on http://localhost:${port}`);
  startMailWorker();
  startHousekeeping();
});
