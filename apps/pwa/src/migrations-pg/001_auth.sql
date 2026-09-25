-- Converted from SQLite by @profullstack/libsql-pg. Review every TODO before applying.
-- Types: INTEGER -> bigint, REAL -> double precision, BLOB -> bytea, BOOLEAN -> boolean,
-- DATETIME/TIMESTAMP -> timestamptz, TEXT -> text; INTEGER PRIMARY KEY -> identity.

create table if not exists users (
  id text PRIMARY KEY,
  email text UNIQUE,
  password_hash text,
  coinpay_sub text UNIQUE,
  display_name text,
  created_at bigint NOT NULL
);

create table if not exists webauthn_credentials (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text,
  created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_credentials(user_id);

create table if not exists sessions (
  token text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL
);

create table if not exists api_keys (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text,
  token_hash text NOT NULL,
  prefix text NOT NULL,
  created_at bigint NOT NULL,
  last_used_at bigint
);

CREATE INDEX IF NOT EXISTS idx_apikeys_user ON api_keys(user_id);

create table if not exists cli_auth_codes (
  code text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_challenge text NOT NULL,
  redirect_uri text NOT NULL,
  name text,
  used bigint NOT NULL DEFAULT 0,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL
);
