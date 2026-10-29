-- Postgres copy of migrations/009_keyring_shares.sql (INTEGER -> bigint). Additive only.
-- A revocable share link for the public halves of a person's SSH keys; only
-- sha256(token) is stored.

create table if not exists keyring_shares (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at bigint NOT NULL,
  rotated_at bigint
);
