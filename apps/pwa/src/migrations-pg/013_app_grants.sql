-- Postgres copy of migrations/013_app_grants.sql (INTEGER -> bigint). Additive only.
create table if not exists app_grant_requests (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  nonce TEXT NOT NULL,
  app_name TEXT NOT NULL,
  manifest TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  decided_at bigint,
  UNIQUE (origin, nonce)
);

create table if not exists app_grants (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES app_grant_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  app_name TEXT NOT NULL,
  key_name TEXT NOT NULL,
  vault_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  recipient TEXT NOT NULL,
  recipient_fingerprint TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at bigint NOT NULL,
  revoked_at bigint,
  last_delivered_at bigint,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_grants_user ON app_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_app_grants_fingerprint ON app_grants(fingerprint);
CREATE INDEX IF NOT EXISTS idx_app_grants_vault ON app_grants(vault_id);
