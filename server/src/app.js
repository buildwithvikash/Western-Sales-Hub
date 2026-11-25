// The Express app (no listening, no background jobs), so tests can run it directly.
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
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
import { invalidateCatalogue } from "./products.js";

export const app = express();
app.disable("x-powered-by");
// Real client IP for the activity log and rate limits when behind a proxy (Vite dev server, nginx, IIS).
app.set("trust proxy", process.env.TRUST_PROXY || "loopback");

// Security headers. The CSP allows only this site, plus Google Fonts (the Outfit typeface).
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "img-src": ["'self'", "data:", "blob:"],
        "media-src": ["'self'", "blob:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'none'"],
        "upgrade-insecure-requests": process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    // Downloads of externally hosted brochures are links/redirects, not embedded resources.
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

/* ---------- rate limits (per IP; sign-in and reset also per email) ---------- */
const tooMany = (msg) => (req, res) => res.status(429).json({ error: msg, code: "RATE_LIMITED" });
// ipKeyGenerator groups an IPv6 user's whole /56 network, so changing addresses does not dodge the limit.
const byIpAndEmail = (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email || "").trim().toLowerCase()}`;
const off = process.env.RATE_LIMIT === "off"; // for automated tests only
const limiter = (o) => (off ? (req, res, next) => next() : rateLimit({ standardHeaders: "draft-8", legacyHeaders: false, ...o }));

app.use(
  "/api/auth/login",
  limiter({ windowMs: 15 * 60_000, limit: 10, keyGenerator: byIpAndEmail, handler: tooMany("Too many sign-in attempts. Wait 15 minutes and try again.") }),
  limiter({ windowMs: 15 * 60_000, limit: 50, handler: tooMany("Too many sign-in attempts from this network. Wait 15 minutes and try again.") }),
);
app.use(
  "/api/auth/forgot",
  limiter({ windowMs: 60 * 60_000, limit: 3, keyGenerator: byIpAndEmail, handler: tooMany("A reset link was already sent. Check your email, or try again in an hour.") }),
  limiter({ windowMs: 60 * 60_000, limit: 20, handler: tooMany("Too many reset requests from this network. Try again later.") }),
);
app.use("/api/auth/reset", limiter({ windowMs: 15 * 60_000, limit: 20, handler: tooMany("Too many attempts. Try again in 15 minutes.") }));
app.use("/api", limiter({ windowMs: 60_000, limit: 600, handler: tooMany("Too many requests. Slow down and try again in a minute.") }));

/* ---------- routes ---------- */
// Any change (POST/PUT/DELETE) may alter what reps see: clear the cached catalogue once it is done.
app.use("/api", (req, res, next) => {
  if (req.method !== "GET") res.on("finish", invalidateCatalogue);
  next();
});
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
  app.use(express.static(dist, { index: false }));
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
