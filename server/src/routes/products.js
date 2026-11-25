import { Router } from "express";
import multer from "multer";
import { q, tx } from "../db.js";
import { requireAdmin, isAdmin } from "../auth.js";
import { audit, track, HttpError, parseCsv, diffFields, diffList } from "../lib.js";
import { loadProducts, cleanContent } from "../products.js";
import { removeStored } from "./files.js";

const r = Router();
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// List: reps get published products; admins get everything.
r.get("/", async (req, res) => {
  const products = await loadProducts({ publishedOnly: !isAdmin(req) });
  res.json(
    products.map(({ files, ...p }) => ({
      ...p,
      fileCount: Object.values(files).reduce((a, l) => a + l.length, 0),
    })),
  );
});

r.get("/:id", async (req, res) => {
  const [p] = await loadProducts({ id: Number(req.params.id) || 0 });
  if (!p || (!p.published && !isAdmin(req))) throw new HttpError(404, "Product not available.");
  if (req.query.track === "1") {
    // One view per person per product per 10 s (page reloads, React dev mode loading twice).
    const { rows: recent } = await q(
      "SELECT 1 FROM events WHERE user_id = $1 AND kind = 'view' AND product_id = $2 AND created_at > now() - interval '10 seconds'",
      [req.user.id, p.id],
    );
    if (!recent.length) {
      await track(req.user.id, "view", { productId: p.id });
      audit(req, "usage", "Viewed product", p.name, { category: p.category });
    }
  }
  res.json(p);
});

// Create a product from the editor's first save (nothing is stored until then, so no empty drafts).
r.post("/", requireAdmin, async (req, res) => {
  const c = cleanContent(req.body || {});
  const publish = !!req.body?.publish;
  if (!c.name) throw new HttpError(400, "Enter a product name first (Details tab).");
  if (publish && !c.categoryId) throw new HttpError(400, "Choose a category before publishing (Details tab).");
  const { rows } = await q(
    `INSERT INTO products (name, category_id, subtitle, description, specs, pitch, objections, battlecard, published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [c.name, c.categoryId, c.subtitle, c.description, JSON.stringify(c.specs), JSON.stringify(c.pitch),
      JSON.stringify(c.objections), JSON.stringify(c.battlecard), publish],
  );
  await audit(req, "content", publish ? "Created and published product" : "Created product", c.name, { productId: rows[0].id });
  const [p] = await loadProducts({ id: rows[0].id });
  res.status(201).json(p);
});

// Delete a product with all its files (from the database and from disk). Cannot be undone.
r.delete("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { rows: p } = await q("SELECT name, published FROM products WHERE id = $1", [id]);
  if (!p[0]) throw new HttpError(404, "Product not found.");
  const { rows: stored } = await q(
    "SELECT v.storage_name FROM file_versions v JOIN product_files f ON f.id = v.file_id WHERE f.product_id = $1 AND v.storage_name IS NOT NULL",
    [id],
  );
  const { rows: n } = await q("SELECT count(*)::int AS n FROM product_files WHERE product_id = $1", [id]);
  await q("DELETE FROM products WHERE id = $1", [id]); // files and versions go with it (ON DELETE CASCADE)
  removeStored(stored.map((x) => x.storage_name));
  await audit(req, "content", "Deleted product", p[0].name || `(Untitled #${id})`, { wasPublished: p[0].published, filesDeleted: n[0].n });
  res.json({ ok: true });
});

r.put("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { rows: cur } = await q("SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = $1", [id]);
  if (!cur[0]) throw new HttpError(404, "Product not found.");
  const old = cur[0];
  const c = cleanContent(req.body || {});
  const publish = !!req.body?.publish || cur[0].published;
  if (publish && (!c.name || !c.categoryId)) throw new HttpError(400, "Enter a name and category first (Details tab).");
  await q(
    `UPDATE products SET name=$2, category_id=$3, subtitle=$4, description=$5, specs=$6, pitch=$7, objections=$8,
            battlecard=$9, published=$10, updated_at=now() WHERE id=$1`,
    [id, c.name, c.categoryId, c.subtitle, c.description, JSON.stringify(c.specs), JSON.stringify(c.pitch),
      JSON.stringify(c.objections), JSON.stringify(c.battlecard), publish],
  );
  const changes = await productChanges(old, c, publish);
  const action = publish && !old.published ? "Published product" : "Edited product";
  if (changes.length || action === "Published product") await audit(req, "content", action, c.name || "(Untitled)", { productId: id, changes });
  const [p] = await loadProducts({ id });
  res.json(p);
});

r.post("/:id/publish", requireAdmin, async (req, res) => {
  const { rows } = await q("SELECT name, category_id FROM products WHERE id = $1", [req.params.id]);
  if (!rows[0]) throw new HttpError(404, "Product not found.");
  if (!rows[0].name || !rows[0].category_id) throw new HttpError(400, "Open the product and add a name and category first.");
  await q("UPDATE products SET published = true, updated_at = now() WHERE id = $1", [req.params.id]);
  await audit(req, "content", "Published product", rows[0].name, { productId: Number(req.params.id) });
  res.json({ ok: true });
});

r.post("/:id/unpublish", requireAdmin, async (req, res) => {
  const { rows } = await q("UPDATE products SET published = false WHERE id = $1 RETURNING name", [req.params.id]);
  if (!rows[0]) throw new HttpError(404, "Product not found.");
  await audit(req, "content", "Unpublished product", rows[0].name, { productId: Number(req.params.id) });
  res.json({ ok: true });
});

// CSV import: name, category, subtitle, description, specs ("Label=Value|Label=Value").
r.post("/import", requireAdmin, csvUpload.single("file"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "Choose a CSV file.");
  if (!/\.csv$/i.test(req.file.originalname)) throw new HttpError(400, "Please choose a .csv file.");
  const createCats = req.body.createCategories === "true";
  const publish = req.body.publish === "true";
  const rows = parseCsv(req.file.buffer.toString("utf8").replace(/^﻿/, ""));
  if (!rows.length) throw new HttpError(400, "The file is empty.");

  const H = rows[0].map((x) => x.trim().toLowerCase());
  const keys = ["name", "category", "subtitle", "description", "specs"];
  let start = 0;
  let ix = { name: 0, category: 1, subtitle: 2, description: 3, specs: 4 };
  if (H.includes("name")) {
    start = 1;
    ix = Object.fromEntries(keys.map((k) => [k, H.indexOf(k)]));
  }

  const result = await tx(async (db) => {
    const cats = new Map((await db.query("SELECT id, name FROM categories")).rows.map((c) => [c.name.toLowerCase(), c.id]));
    const names = new Set((await db.query("SELECT lower(name) AS n FROM products")).rows.map((x) => x.n));
    let ok = 0;
    const skipped = [];
    for (const [n, c] of rows.slice(start).entries()) {
      const g = (k) => (ix[k] >= 0 ? (c[ix[k]] || "").trim() : "");
      const name = g("name");
      const cat = g("category");
      const row = n + start + 1;
      if (!name) { skipped.push(`Row ${row}: name is missing`); continue; }
      if (!cat) { skipped.push(`Row ${row} (${name}): category is missing`); continue; }
      if (names.has(name.toLowerCase())) { skipped.push(`Row ${row} (${name}): a product with this name already exists`); continue; }
      let catId = cats.get(cat.toLowerCase());
      if (!catId) {
        if (!createCats) { skipped.push(`Row ${row} (${name}): category “${cat}” does not exist`); continue; }
        catId = (await db.query("INSERT INTO categories (name) VALUES ($1) RETURNING id", [cat])).rows[0].id;
        cats.set(cat.toLowerCase(), catId);
      }
      const specs = g("specs")
        .split("|")
        .map((x) => x.split("="))
        .filter((x) => x[0].trim())
        .map((x) => [x[0].trim(), x.slice(1).join("=").trim()]);
      await db.query(
        "INSERT INTO products (name, category_id, subtitle, description, specs, published) VALUES ($1,$2,$3,$4,$5,$6)",
        [name, catId, g("subtitle") || cat, g("description"), JSON.stringify(specs.length ? specs : [["", ""]]), publish],
      );
      names.add(name.toLowerCase());
      ok++;
    }
    return { imported: ok, skipped };
  });
  await audit(req, "content", "Imported products", `${result.imported} imported, ${result.skipped.length} skipped`, {
    file: req.file.originalname,
    published: publish,
    skipped: result.skipped.slice(0, 20),
  });
  res.json({ ...result, published: publish });
});

export default r;

/** What changed in a product save, field by field, for the activity log. */
async function productChanges(old, c, publish) {
  let newCat = old.category;
  if ((c.categoryId || null) !== (old.category_id || null)) {
    const { rows } = c.categoryId ? await q("SELECT name FROM categories WHERE id = $1", [c.categoryId]) : { rows: [] };
    newCat = rows[0]?.name || "";
  }
  const op = old.pitch || {}, np = c.pitch;
  const ob = old.battlecard || {}, nb = c.battlecard;
  const pairs = (a) => (a || []).filter((r) => r.some((x) => String(x).trim())).map((r) => r.filter((x) => String(x).trim()).join(" · "));
  return [
    ...diffFields([
      ["Name", old.name, c.name],
      ["Category", old.category, newCat],
      ["Subtitle", old.subtitle, c.subtitle],
      ["Description", old.description, c.description],
      ["Status", old.published ? "Published" : "Draft", publish ? "Published" : "Draft"],
      ["Pitch: opener", op.opener, np.opener],
      ["Pitch: questions to ask", op.ask, np.ask],
      ["Battlecard: competitor", ob.competitor, nb.competitor],
    ]),
    diffList("Specifications", pairs(old.specs), pairs(c.specs)),
    diffList("Pitch: selling points", op.points || [], np.points),
    diffList("Objections", pairs(old.objections), pairs(c.objections)),
    diffList("Battlecard: comparison", pairs(ob.rows), pairs(nb.rows)),
    diffList("Battlecard: where it wins", ob.wins || [], nb.wins),
    diffList("Battlecard: watch out for", ob.watch || [], nb.watch),
  ].filter(Boolean);
}
