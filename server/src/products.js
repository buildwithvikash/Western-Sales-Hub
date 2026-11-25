// Shared product loading/serialisation used by several routes.
import { q } from "./db.js";
import { FILE_TYPES } from "./lib.js";

const emptyFiles = () => Object.fromEntries(Object.keys(FILE_TYPES).map((t) => [t, []]));

/** Latest version of every file for the given products, grouped by product id then type. */
export async function loadFiles(productIds) {
  const out = new Map(productIds.map((id) => [id, emptyFiles()]));
  if (!productIds.length) return out;
  const { rows } = await q(
    `SELECT f.id, f.product_id, f.type, v.id AS version_id, v.version, v.original_name, v.external_url,
            v.mime_type, v.size_bytes, v.uploaded_at,
            (SELECT count(*) FROM file_versions x WHERE x.file_id = f.id)::int AS version_count
       FROM product_files f
       JOIN LATERAL (SELECT * FROM file_versions v WHERE v.file_id = f.id ORDER BY v.version DESC LIMIT 1) v ON true
      WHERE f.product_id = ANY($1)
      ORDER BY f.created_at, f.id`,
    [productIds],
  );
  for (const f of rows) {
    out.get(f.product_id)?.[f.type].push({
      id: f.id,
      type: f.type,
      versionId: f.version_id,
      version: f.version,
      versionCount: f.version_count,
      name: f.original_name,
      mimeType: f.mime_type,
      size: f.size_bytes == null ? null : Number(f.size_bytes),
      external: !!f.external_url,
      uploadedAt: f.uploaded_at,
    });
  }
  return out;
}

export const serialize = (p, files) => ({
  id: p.id,
  name: p.name,
  categoryId: p.category_id,
  category: p.category || "",
  subtitle: p.subtitle,
  description: p.description,
  imageUrl: p.image_url,
  published: p.published,
  specs: p.specs,
  pitch: p.pitch,
  objections: p.objections,
  battlecard: p.battlecard,
  updatedAt: p.updated_at,
  ...(files ? { files } : {}),
});

/*
 * The published catalogue (with files) is cached for search and the home page, so a search no longer
 * reads every product and file from the database. Any change through the API clears the cache
 * (see app.js); it also expires after a minute in case several servers share the database.
 */
let catalogue = null;
export const invalidateCatalogue = () => {
  catalogue = null;
};
export async function loadCatalogue() {
  if (catalogue && Date.now() - catalogue.at < 60_000) return catalogue.products;
  const products = await loadProducts({ publishedOnly: true });
  catalogue = { at: Date.now(), products };
  return products;
}

/** Load products (optionally only published, optionally by id) with their files. */
export async function loadProducts({ publishedOnly = false, id = null } = {}) {
  const where = [];
  const params = [];
  if (publishedOnly) where.push("p.published AND p.name <> ''");
  if (id != null) {
    params.push(id);
    where.push(`p.id = $${params.length}`);
  }
  const { rows } = await q(
    `SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.id`,
    params,
  );
  const files = await loadFiles(rows.map((p) => p.id));
  return rows.map((p) => serialize(p, files.get(p.id)));
}

/** Text fields searched for each product, labelled with where the match came from. */
function searchFields(p) {
  const pitch = p.pitch || {};
  const bc = p.battlecard || {};
  return [
    ["name", p.name],
    ["category", `${p.category} ${p.subtitle}`],
    ["specs", (p.specs || []).map((x) => x.join(" ")).join(" ")],
    ["description", p.description],
    ["sales pitch", [pitch.opener, ...(pitch.points || []), pitch.ask, ...(p.objections || []).map((o) => o.join(" "))].join(" ")],
    ["battlecard", [bc.competitor, ...(bc.rows || []).map((r) => r.join(" ")), ...(bc.wins || []), ...(bc.watch || [])].join(" ")],
    ["file name", Object.values(p.files).flat().map((f) => f.name).join(" ")],
  ].map(([k, v]) => [k, String(v || "").toLowerCase()]);
}

/** Every search word must match somewhere; name matches rank highest. */
export function searchProducts(products, query, category) {
  const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const p of products) {
    if (category && p.category !== category) continue;
    const F = searchFields(p);
    const where = new Set();
    let ok = true;
    let nameHits = 0;
    for (const t of terms) {
      const hit = F.filter((x) => x[1].includes(t));
      if (!hit.length) ok = false;
      hit.forEach((h) => where.add(h[0]));
      if (F[0][1].includes(t)) nameHits++;
    }
    if (ok) out.push({ product: p, where: [...where], score: nameHits * 10 + where.size });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Normalise product content coming from the editor. */
export function cleanContent(b) {
  const str = (v) => (v == null ? "" : String(v));
  const pairs = (a, n) => (Array.isArray(a) ? a : []).map((r) => Array.from({ length: n }, (_, i) => str(r?.[i])));
  const lines = (a) => (Array.isArray(a) ? a : []).map(str).filter((x) => x.trim());
  const pitch = b.pitch || {};
  const bc = b.battlecard || {};
  return {
    name: str(b.name).trim(),
    categoryId: b.categoryId ? Number(b.categoryId) : null,
    subtitle: str(b.subtitle).trim(),
    description: str(b.description),
    specs: pairs(b.specs, 2),
    pitch: { opener: str(pitch.opener), points: (Array.isArray(pitch.points) ? pitch.points : []).map(str), ask: str(pitch.ask) },
    objections: pairs(b.objections, 2),
    battlecard: { competitor: str(bc.competitor), rows: pairs(bc.rows, 3), wins: lines(bc.wins), watch: lines(bc.watch) },
  };
}
