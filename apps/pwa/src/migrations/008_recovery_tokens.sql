CREATE TABLE IF NOT EXISTS recovery_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  revoked_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_recovery_tokens_user ON recovery_tokens(user_id);
