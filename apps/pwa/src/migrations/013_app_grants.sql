-- App grants: a person hands one named secret to an external app (meshhook,
-- smshub, ...), sealed in their browser to that app's per-user inbox key.
-- The server stores ciphertext and metadata only, never a value.
--
-- A request is created from a manifest logicsrc fetched itself from the app's
-- origin over TLS (/.well-known/logicsrc-grant/<nonce>), so the consent page
-- shows a verified origin, not a name the app claimed.

CREATE TABLE IF NOT EXISTS app_grant_requests (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  nonce TEXT NOT NULL,
  app_name TEXT NOT NULL,
  manifest TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  decided_at INTEGER,
  UNIQUE (origin, nonce)
);

CREATE TABLE IF NOT EXISTS app_grants (
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
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_delivered_at INTEGER,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_grants_user ON app_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_app_grants_fingerprint ON app_grants(fingerprint);
CREATE INDEX IF NOT EXISTS idx_app_grants_vault ON app_grants(vault_id);
