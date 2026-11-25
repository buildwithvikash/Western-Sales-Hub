// Applies database migrations (db/migrations) and loads the sample data from the wireframe.
//   npm run db:init          apply new migrations; seed only when the database is empty
//   npm run db:reset         DROP all tables first (deletes all data!), then migrate and seed
// The server also applies new migrations when it starts.
import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";
import { SETTING_DEFAULTS } from "../src/lib.js";
import { runMigrations } from "../src/migrate.js";

const reset = process.argv.includes("--reset");

const TABLES = ["schema_migrations", "sessions", "mail_outbox", "events", "audit_log", "file_versions", "product_files", "products", "categories", "password_resets", "users", "settings"];

const PRODUCTS = [
  {
    name: "SRC1800-GL",
    cat: "Visi Cooler",
    sub: "Visi Cooler · Triple Door",
    img: "/assets/src1800.png",
    specs: [
      ["External dimension (mm)", "1800 (W) x 850 (D) x 2201 (H)"],
      ["Gross volume", "1882 Litres"],
      ["Temperature range", "0°C to 10°C"],
      ["No. of shelves", "15"],
    ],
    brochure: ["SRC1800-GL Brochure.pdf", "https://westernequipments.com/wp-content/uploads/2025/03/Visi-Cooler-LR.pdf"],
    bc: {
      rows: [
        ["Gross volume", "1882 Litres", ""],
        ["Doors and shelves", "Triple door, 15 shelves", ""],
        ["Temperature range", "0°C to 10°C", ""],
        ["Dimensions (mm)", "1800 x 850 x 2201", ""],
        ["Energy rating", "", ""],
        ["Warranty", "", ""],
        ["Service network", "", ""],
      ],
      wins: [
        "Large 1882 L capacity in a single triple-door unit, suited to high-footfall beverage outlets",
        "15 shelves give a wide display area for stock",
        "0°C to 10°C range suits chilled beverages",
      ],
    },
  },
  {
    name: "F550GL23 (Scooping)",
    cat: "Deep Freezer",
    sub: "Deep Freezer · Glass Top · Scooping Parlour",
    img: "/assets/f550.png",
    specs: [
      ["External dimension (mm)", "1650 (W) x 695 (D) x 1266 (H)"],
      ["Gross volume", "536 Litres"],
      ["Temperature range", "below –17.0°C"],
      ["No. of baskets", "4"],
      ["Energy Star rating", "3 Star"],
    ],
    brochure: ["F550GL23 Brochure.pdf", "https://westernequipments.com/wp-content/uploads/2026/06/F550GL23-Scooping.pdf"],
    bc: {
      rows: [
        ["Gross volume", "536 Litres", ""],
        ["Baskets", "4", ""],
        ["Temperature range", "below –17.0°C", ""],
        ["Dimensions (mm)", "1650 x 695 x 1266", ""],
        ["Energy Star rating", "3 Star", ""],
        ["Warranty", "", ""],
        ["Service network", "", ""],
      ],
      wins: [
        "Glass top with a scooping design, built for ice cream parlours",
        "Holds frozen products below –17.0°C",
        "4 baskets help organise flavours and stock",
      ],
    },
  },
];

async function main() {
  const db = await pool.connect();
  try {
    if (reset) {
      console.log("Dropping all tables…");
      await db.query(`DROP TABLE IF EXISTS ${TABLES.join(", ")} CASCADE`);
    }
    const applied = await runMigrations(pool);
    console.log(applied.length ? `Database up to date (${applied.length} migration${applied.length === 1 ? "" : "s"} applied).` : "Database already up to date.");

    for (const [k, v] of Object.entries(SETTING_DEFAULTS))
      await db.query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT DO NOTHING", [k, String(v)]);

    const { rows } = await db.query("SELECT count(*)::int AS n FROM users");
    if (rows[0].n > 0) {
      console.log("Database already has users; skipping sample data.");
      return;
    }

    await db.query("BEGIN");
    const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@company.com").toLowerCase();
    const adminPw = process.env.SEED_ADMIN_PASSWORD;
    const repPw = process.env.SEED_REP_PASSWORD;
    if (!adminPw || !repPw) throw new Error("Set SEED_ADMIN_PASSWORD and SEED_REP_PASSWORD in server/.env before seeding.");
    const adminHash = await bcrypt.hash(adminPw, 12);
    const repHash = await bcrypt.hash(repPw, 12);
    const adminId = (
      await db.query(
        "INSERT INTO users (name, email, password_hash, role, region, team) VALUES ($1,$2,$3,'Admin','Region A','Team A') RETURNING id",
        ["Sample Admin", adminEmail, adminHash],
      )
    ).rows[0].id;
    await db.query(
      `INSERT INTO users (name, email, password_hash, role, region, team) VALUES
         ('Sample Rep 1', 'rep1@company.com', $1, 'Rep', 'Region A', 'Team A'),
         ('Sample Rep 2', 'rep2@company.com', $1, 'Rep', 'Region B', 'Team B')`,
      [repHash],
    );

    const cats = {};
    for (const c of ["Visi Cooler", "Deep Freezer", "Vertical Freezer", "Supermarket Range"])
      cats[c] = (await db.query("INSERT INTO categories (name) VALUES ($1) RETURNING id", [c])).rows[0].id;

    for (const p of PRODUCTS) {
      const id = (
        await db.query(
          `INSERT INTO products (name, category_id, subtitle, image_url, published, specs, battlecard)
           VALUES ($1,$2,$3,$4,true,$5,$6) RETURNING id`,
          [p.name, cats[p.cat], p.sub, p.img, JSON.stringify(p.specs), JSON.stringify({ competitor: "", rows: p.bc.rows, wins: p.bc.wins, watch: [] })],
        )
      ).rows[0].id;
      const fid = (await db.query("INSERT INTO product_files (product_id, type) VALUES ($1, 'brochure') RETURNING id", [id])).rows[0].id;
      await db.query(
        "INSERT INTO file_versions (file_id, version, original_name, external_url, mime_type, uploaded_by) VALUES ($1, 1, $2, $3, 'application/pdf', $4)",
        [fid, p.brochure[0], p.brochure[1], adminId],
      );
      await db.query("INSERT INTO audit_log (user_id, user_email, user_name, category, action, item) VALUES ($1, $2, 'Sample Admin', 'content', 'Published product', $3)", [adminId, adminEmail, p.name]);
    }
    await db.query("COMMIT");
    console.log(`Sample data loaded. Sign in as ${adminEmail} (admin) or rep1@company.com / rep2@company.com (reps)`);
    console.log("using the SEED_*_PASSWORD values from server/.env.");
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Database setup failed:", e.message);
  process.exit(1);
});
