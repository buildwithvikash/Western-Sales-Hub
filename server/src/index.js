import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { requireAuth, requireAdmin } from "./auth.js";
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import fileRoutes from "./routes/files.js";
import catalogRoutes from "./routes/catalog.js";
import categoryRoutes from "./routes/categories.js";
import userRoutes from "./routes/users.js";
import reportRoutes from "./routes/reports.js";
import adminRoutes from "./routes/admin.js";
import { startMailWorker } from "./mailer.js";

const app = express();
app.disable("x-powered-by");
// Real client IP for the activity log when behind a proxy (the Vite dev server, or nginx/IIS in production).
app.set("trust proxy", process.env.TRUST_PROXY || "loopback");
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api", requireAuth); // everything below needs a signed-in user
app.use("/api", catalogRoutes);
app.use("/api/products", productRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/users", requireAdmin, userRoutes);
app.use("/api/reports", requireAdmin, reportRoutes);
app.use("/api/admin", requireAdmin, adminRoutes);
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// In production, serve the built React app from client/dist.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err.name === "MulterError") {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "That file is too large." : "Upload failed: " + err.message;
    return res.status(400).json({ error: msg });
  }
  const ref = crypto.randomBytes(4).toString("hex").toUpperCase();
  console.error(`[error ${ref}]`, err);
  res.status(500).json({ error: "Something went wrong. Please try again.", ref });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Sales Hub API listening on http://localhost:${port}`);
  startMailWorker();
});
