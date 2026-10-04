-- Postgres copy of migrations/004_opencreds_sync.sql (INTEGER -> bigint).
-- The personal vault (`logicsrc vault`, OpenCreds), synced to the account;
-- ciphertext and wrapped key material only.

create table if not exists opencreds_vaults (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  meta text NOT NULL,
  meta_revision bigint NOT NULL,
  folders text,
  folders_revision bigint NOT NULL DEFAULT 0,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

create table if not exists opencreds_items (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id text NOT NULL,
  type bigint,
  envelope text,
  revision bigint NOT NULL,
  seq bigint NOT NULL,
  updated_at bigint NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_opencreds_items_seq ON opencreds_items(user_id, seq);
