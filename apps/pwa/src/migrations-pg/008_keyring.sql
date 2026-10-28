-- Postgres copy of migrations/008_keyring.sql (INTEGER -> bigint). Additive only.
-- The keyring (`logicsrc keyring`): wrapped meta + AES-GCM envelopes; public
-- halves in the clear on purpose.

create table if not exists keyring_vaults (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  meta text NOT NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

create table if not exists keyring_entries (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  key_type text NOT NULL,
  filename text NOT NULL,
  public_key text NOT NULL,
  fingerprint text NOT NULL,
  comment text NOT NULL DEFAULT '',
  envelope text,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_keyring_entries_user ON keyring_entries(user_id, updated_at);
