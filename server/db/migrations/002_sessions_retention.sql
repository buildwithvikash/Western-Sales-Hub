-- 002: server-side sessions (sign-out everywhere, accurate timeout times) and activity retention.

-- One row per sign-in. The session cookie carries the id; a session is valid only while ended_at is NULL.
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  end_reason    TEXT CHECK (end_reason IN ('signed_out','timed_out','password_changed','deactivated','revoked')),
  ip            TEXT,
  user_agent    TEXT
);
CREATE INDEX IF NOT EXISTS sessions_open_idx ON sessions (last_seen_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id) WHERE ended_at IS NULL;

-- Activity log entries and usage events older than this are deleted daily (0 = keep forever).
INSERT INTO settings (key, value) VALUES ('activity_retention_days', '365') ON CONFLICT (key) DO NOTHING;
CREATE INDEX IF NOT EXISTS events_time_idx ON events (created_at);
