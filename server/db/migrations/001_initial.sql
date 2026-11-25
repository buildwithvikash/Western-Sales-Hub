-- 001: initial schema (tables, plus later additions written to be safe to re-run on older databases).

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  password_hash   TEXT,
  role            TEXT NOT NULL DEFAULT 'Rep' CHECK (role IN ('Admin', 'Rep')),
  region          TEXT NOT NULL DEFAULT '',
  team            TEXT NOT NULL DEFAULT '',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_key ON categories (lower(name));

-- Structured product content (specs, pitch, objections, battlecard) is stored as JSONB:
--   specs:       [["label","value"], ...]
--   pitch:       {"opener": "", "points": ["",""], "ask": ""}
--   objections:  [["objection","response"], ...]
--   battlecard:  {"competitor": "", "rows": [["feature","western","competitor"]], "wins": [], "watch": []}
CREATE TABLE IF NOT EXISTS products (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL DEFAULT '',
  category_id  INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  subtitle     TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  image_url    TEXT,
  published    BOOLEAN NOT NULL DEFAULT FALSE,
  specs        JSONB NOT NULL DEFAULT '[["",""]]',
  pitch        JSONB NOT NULL DEFAULT '{"opener":"","points":["",""],"ask":""}',
  objections   JSONB NOT NULL DEFAULT '[["",""]]',
  battlecard   JSONB NOT NULL DEFAULT '{"competitor":"","rows":[["","",""]],"wins":[],"watch":[]}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A file belongs to a product and has one or more versions. Reps see the latest version.
CREATE TABLE IF NOT EXISTS product_files (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('brochure','kld','sheet','images','videos','media')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_files_product_idx ON product_files (product_id);

CREATE TABLE IF NOT EXISTS file_versions (
  id            SERIAL PRIMARY KEY,
  file_id       INTEGER NOT NULL REFERENCES product_files(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  storage_name  TEXT,          -- file on disk under UPLOAD_DIR
  external_url  TEXT,          -- or a link to an externally hosted file
  mime_type     TEXT,
  size_bytes    BIGINT,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, version)
);

-- Usage events feed the dashboard and reports.
CREATE TABLE IF NOT EXISTS events (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('login','view','download','search')),
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  file_type     TEXT,
  term          TEXT,
  result_count  INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_kind_time_idx ON events (kind, created_at);

-- Every admin change, sign-in and password reset.
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_email  TEXT NOT NULL,
  action      TEXT NOT NULL,
  item        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Outgoing email. Queued in the same request that creates it, then sent by a background worker
-- that retries failures with growing delays (gives up after 8 attempts).
CREATE TABLE IF NOT EXISTS mail_outbox (
  id               BIGSERIAL PRIMARY KEY,
  to_address       TEXT NOT NULL,
  subject          TEXT NOT NULL,
  body_text        TEXT NOT NULL,
  body_html        TEXT,
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
  attempts         SMALLINT NOT NULL DEFAULT 0,
  last_error       TEXT,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mail_outbox_pending_idx ON mail_outbox (next_attempt_at) WHERE status = 'PENDING';

-- Activity log details (added later; safe to re-run).
--   category: auth (sign-in/out, passwords) | content (products, categories, files) | users | settings
--             | download | usage (product views, searches)
--   details:  JSON, e.g. {"changes":[{"field":"Name","from":"A","to":"B"}]} or {"product":"X","version":2}
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_name  TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS category   TEXT NOT NULL DEFAULT 'content';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS details    JSONB;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip         TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;
CREATE INDEX IF NOT EXISTS audit_log_time_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_category_idx ON audit_log (category, created_at DESC);
-- Categorise rows written before the column existed.
UPDATE audit_log SET category = 'auth'
 WHERE category = 'content' AND action IN ('Signed in','Account locked','Requested password reset','Password reset completed','Changed password');
UPDATE audit_log SET category = 'users'
 WHERE category = 'content' AND action IN ('Added user','Imported users','Reset password','Activated user','Deactivated user');
UPDATE audit_log SET category = 'settings' WHERE category = 'content' AND action IN ('Saved settings','Sent test email');
UPDATE audit_log a SET user_id = u.id, user_name = u.name FROM users u
 WHERE a.user_id IS NULL AND lower(a.user_email) = lower(u.email);
