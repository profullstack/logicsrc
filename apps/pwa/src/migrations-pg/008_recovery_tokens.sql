create table if not exists recovery_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  used_at bigint,
  revoked_at bigint
);
CREATE INDEX IF NOT EXISTS idx_recovery_tokens_user ON recovery_tokens(user_id);
