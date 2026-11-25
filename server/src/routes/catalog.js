// Rep-facing read endpoints: home page data and search.
import { Router } from "express";
import { q } from "../db.js";
import { audit, track } from "../lib.js";
import { loadCatalogue, searchProducts } from "../products.js";

const r = Router();

const summary = (p) => ({ id: p.id, name: p.name, category: p.category, subtitle: p.subtitle, imageUrl: p.imageUrl });

r.get("/home", async (req, res) => {
  const products = await loadCatalogue();
  const { rows: cats } = await q("SELECT id, name FROM categories ORDER BY id");
  const categories = cats.map((c) => {
    const list = products.filter((p) => p.categoryId === c.id);
    return { id: c.id, name: c.name, count: list.length, imageUrl: list.find((p) => p.imageUrl)?.imageUrl || null };
  });

  const { rows: viewed } = await q(
    `SELECT product_id FROM events WHERE user_id = $1 AND kind = 'view' AND product_id IS NOT NULL
      GROUP BY product_id ORDER BY max(created_at) DESC LIMIT 8`,
    [req.user.id],
  );
  const byId = new Map(products.map((p) => [p.id, p]));
  let recent = viewed.map((v) => byId.get(v.product_id)).filter(Boolean).slice(0, 4);
  if (!recent.length) recent = products.slice(0, 4);

  const updates = products
    .flatMap((p) => Object.values(p.files).flat().map((f) => ({ productId: p.id, productName: p.name, fileName: f.name, uploadedAt: f.uploadedAt })))
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .slice(0, 4);

  res.json({ categories, recent: recent.map(summary), updates, hasProducts: products.length > 0 });
});

r.get("/search", async (req, res) => {
  const query = String(req.query.q || "");
  const cat = String(req.query.cat || "");
  const products = await loadCatalogue();
  const results = searchProducts(products, query, cat);
  if (req.query.track === "1" && query.trim()) {
    track(req.user.id, "search", { term: query.trim().toLowerCase().slice(0, 200), resultCount: results.length });
    audit(req, "usage", "Searched", query.trim().slice(0, 200), { results: results.length, ...(cat ? { category: cat } : {}) });
  }
  res.json({
    hasProducts: products.length > 0,
    results: results.map((x) => ({ ...summary(x.product), where: x.where })),
  });
});

export default r;
