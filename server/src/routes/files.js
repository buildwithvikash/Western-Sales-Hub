import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { q, tx } from "../db.js";
import { requireAdmin, isAdmin } from "../auth.js";
import { audit, track, HttpError, FILE_TYPES } from "../lib.js";

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// Browsers send multipart filenames as latin1; recover UTF-8 names.
const fixName = (n) => Buffer.from(n, "latin1").toString("utf8");

const r = Router();

// All files, latest version each (admin Files page).
r.get("/", requireAdmin, async (req, res) => {
  const { rows } = await q(
    `SELECT f.id, f.type, p.id AS product_id, p.name AS product_name, v.id AS version_id, v.version,
            v.original_name, v.uploaded_at,
            (SELECT count(*) FROM file_versions x WHERE x.file_id = f.id)::int AS version_count
       FROM product_files f
       JOIN products p ON p.id = f.product_id
       JOIN LATERAL (SELECT * FROM file_versions v WHERE v.file_id = f.id ORDER BY v.version DESC LIMIT 1) v ON true
      ORDER BY p.id, f.type, f.id`,
  );
  res.json(
    rows.map((f) => ({
      id: f.id,
      type: f.type,
      productId: f.product_id,
      productName: f.product_name || "(Untitled)",
      versionId: f.version_id,
      version: f.version,
      versionCount: f.version_count,
      name: f.original_name,
      uploadedAt: f.uploaded_at,
    })),
  );
});

// Upload one or more new files of a type to a product.
r.post("/product/:productId", requireAdmin, upload.array("files", 50), async (req, res) => {
  const productId = Number(req.params.productId);
  const type = req.body.type;
  const files = req.files || [];
  try {
    if (!FILE_TYPES[type]) throw new HttpError(400, "Unknown file type.");
    if (!files.length) throw new HttpError(400, "Choose at least one file.");
    const { rows } = await q("SELECT id, name, image_url FROM products WHERE id = $1", [productId]);
    if (!rows[0]) throw new HttpError(404, "Product not found.");
    let imageUrl = rows[0].image_url;
    await tx(async (db) => {
      for (const f of files) {
        const fid = (await db.query("INSERT INTO product_files (product_id, type) VALUES ($1,$2) RETURNING id", [productId, type])).rows[0].id;
        await db.query(
          `INSERT INTO file_versions (file_id, version, original_name, storage_name, mime_type, size_bytes, uploaded_by)
           VALUES ($1, 1, $2, $3, $4, $5, $6)`,
          [fid, fixName(f.originalname), f.filename, f.mimetype, f.size, req.user.id],
        );
        if (type === "images" && !imageUrl && f.mimetype.startsWith("image/")) {
          imageUrl = `/api/files/${fid}/current?inline=1`;
          await db.query("UPDATE products SET image_url = $2 WHERE id = $1", [productId, imageUrl]);
        }
      }
      await db.query("UPDATE products SET updated_at = now() WHERE id = $1", [productId]);
    });
    for (const f of files)
      await audit(req, "content", "Uploaded file", fixName(f.originalname), { product: rows[0].name, type: FILE_TYPES[type], version: 1, size: f.size });
    res.status(201).json({ ok: true, count: files.length });
  } catch (e) {
    files.forEach((f) => fs.rm(f.path, { force: true }, () => {})); // nothing was changed
    throw e;
  }
});

// Upload a new version of an existing file.
r.post("/:fileId/versions", requireAdmin, upload.single("file"), async (req, res) => {
  const f = req.file;
  try {
    if (!f) throw new HttpError(400, "Choose a file.");
    const { rows } = await q(
      `SELECT f.product_id, f.type, p.name AS product,
              (SELECT original_name FROM file_versions v WHERE v.file_id = f.id ORDER BY version DESC LIMIT 1) AS previous
         FROM product_files f JOIN products p ON p.id = f.product_id WHERE f.id = $1`,
      [req.params.fileId],
    );
    if (!rows[0]) throw new HttpError(404, "File not found.");
    const version = await tx(async (db) => {
      const { rows: m } = await db.query("SELECT max(version) AS v FROM file_versions WHERE file_id = $1", [req.params.fileId]);
      const v = (m[0].v || 0) + 1;
      await db.query(
        `INSERT INTO file_versions (file_id, version, original_name, storage_name, mime_type, size_bytes, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.params.fileId, v, fixName(f.originalname), f.filename, f.mimetype, f.size, req.user.id],
      );
      await db.query("UPDATE products SET updated_at = now() WHERE id = $1", [rows[0].product_id]);
      return v;
    });
    await audit(req, "content", "Uploaded new version", fixName(f.originalname), {
      product: rows[0].product,
      type: FILE_TYPES[rows[0].type],
      version,
      replaces: `${rows[0].previous} (v${version - 1})`,
      size: f.size,
    });
    res.status(201).json({ ok: true, version });
  } catch (e) {
    if (f) fs.rm(f.path, { force: true }, () => {});
    throw e;
  }
});

r.get("/:fileId/versions", requireAdmin, async (req, res) => {
  const { rows } = await q(
    `SELECT v.id, v.version, v.original_name, v.uploaded_at, u.email AS uploaded_by
       FROM file_versions v LEFT JOIN users u ON u.id = v.uploaded_by
      WHERE v.file_id = $1 ORDER BY v.version DESC`,
    [req.params.fileId],
  );
  res.json(rows.map((v, i) => ({ id: v.id, version: v.version, name: v.original_name, uploadedAt: v.uploaded_at, uploadedBy: v.uploaded_by, current: i === 0 })));
});

const VERSION_SQL = `SELECT v.*, f.type, f.product_id, p.published, p.name AS product_name,
            (v.version = (SELECT max(version) FROM file_versions x WHERE x.file_id = v.file_id)) AS is_current
       FROM file_versions v JOIN product_files f ON f.id = v.file_id JOIN products p ON p.id = f.product_id`;

// A specific version (or inline with ?inline=1). Reps may only fetch the current version of published products.
r.get("/versions/:vid/download", async (req, res) => {
  const { rows } = await q(`${VERSION_SQL} WHERE v.id = $1`, [req.params.vid]);
  await serve(rows[0], req, res);
});

// Whatever the current version of a file is (used for product images, so they follow new versions).
r.get("/:fileId/current", async (req, res) => {
  const { rows } = await q(`${VERSION_SQL} WHERE v.file_id = $1 ORDER BY v.version DESC LIMIT 1`, [req.params.fileId]);
  await serve(rows[0], req, res);
});

async function serve(v, req, res) {
  if (!v || (!isAdmin(req) && (!v.published || !v.is_current))) throw new HttpError(404, "File not found.");
  const inline = req.query.inline === "1";
  if (!inline) {
    track(req.user.id, "download", { productId: v.product_id, fileType: v.type });
    audit(req, "download", "Downloaded file", v.original_name, {
      product: v.product_name,
      type: FILE_TYPES[v.type],
      version: v.version,
      ...(v.is_current ? {} : { note: "older version" }),
      ...(v.external_url ? { link: v.external_url } : {}),
    });
  }
  if (v.external_url) return res.redirect(v.external_url);
  const file = path.join(UPLOAD_DIR, path.basename(v.storage_name || ""));
  if (!v.storage_name || !fs.existsSync(file)) throw new HttpError(404, "The stored file is missing. Ask your admin to upload it again.");
  if (v.mime_type) res.type(v.mime_type);
  if (inline) {
    res.set("Cache-Control", "private, max-age=3600");
    return res.sendFile(file);
  }
  res.download(file, v.original_name);
}

export default r;
