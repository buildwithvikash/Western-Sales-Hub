import { Router } from "express";
import { q } from "../db.js";
import { requireAdmin } from "../auth.js";
import { audit, HttpError } from "../lib.js";

const r = Router();

r.get("/", async (req, res) => {
  const { rows } = await q(
    `SELECT c.id, c.name, count(p.id)::int AS product_count,
            count(p.id) FILTER (WHERE p.published)::int AS published_count
       FROM categories c LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id ORDER BY c.id`,
  );
  res.json(rows.map((c) => ({ id: c.id, name: c.name, productCount: c.product_count, publishedCount: c.published_count })));
});

const nameOf = (req) => {
  const n = String(req.body?.name || "").trim();
  if (!n) throw new HttpError(400, "Enter a category name.");
  return n;
};
const dupCheck = async (name, exceptId = 0) => {
  const { rows } = await q("SELECT 1 FROM categories WHERE lower(name) = lower($1) AND id <> $2", [name, exceptId]);
  if (rows.length) throw new HttpError(409, "That category already exists.");
};

r.post("/", requireAdmin, async (req, res) => {
  const name = nameOf(req);
  await dupCheck(name);
  const { rows } = await q("INSERT INTO categories (name) VALUES ($1) RETURNING id, name", [name]);
  await audit(req, "content", "Added category", name);
  res.status(201).json(rows[0]);
});

r.put("/:id", requireAdmin, async (req, res) => {
  const name = nameOf(req);
  await dupCheck(name, Number(req.params.id));
  const { rows: old } = await q("SELECT name FROM categories WHERE id = $1", [req.params.id]);
  if (!old[0]) throw new HttpError(404, "Category not found.");
  await q("UPDATE categories SET name = $2 WHERE id = $1", [req.params.id, name]);
  await audit(req, "content", "Renamed category", name, { changes: [{ field: "Name", from: old[0].name, to: name }] });
  res.json({ ok: true });
});

r.delete("/:id", requireAdmin, async (req, res) => {
  const { rows: used } = await q("SELECT count(*)::int AS n FROM products WHERE category_id = $1", [req.params.id]);
  if (used[0].n) throw new HttpError(409, "Move products out of this category first.");
  const { rows } = await q("DELETE FROM categories WHERE id = $1 RETURNING name", [req.params.id]);
  if (!rows[0]) throw new HttpError(404, "Category not found.");
  await audit(req, "content", "Deleted category", rows[0].name);
  res.json({ ok: true });
});

export default r;
