-- Converted from SQLite by @profullstack/libsql-pg. Review every TODO before applying.
-- Types: INTEGER -> bigint, REAL -> double precision, BLOB -> bytea, BOOLEAN -> boolean,
-- DATETIME/TIMESTAMP -> timestamptz, TEXT -> text; INTEGER PRIMARY KEY -> identity.

create table if not exists cli_device_codes (
  device_code_hash text PRIMARY KEY,
  user_code text NOT NULL UNIQUE,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  name text,
  status text NOT NULL DEFAULT 'pending',
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  last_polled_at bigint
);

CREATE INDEX IF NOT EXISTS idx_cli_device_user_code ON cli_device_codes(user_code);
