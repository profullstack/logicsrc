-- Device-authorization codes for `logicsrc login` on machines with no browser
-- (SSH sessions, droplets, containers). The CLI polls /cli/device/token with the
-- device_code while the human approves the short user_code in a browser anywhere.
CREATE TABLE IF NOT EXISTS cli_device_codes (
  device_code_hash TEXT PRIMARY KEY,        -- sha256 of the CLI's secret device_code
  user_code        TEXT NOT NULL UNIQUE,    -- short human-typed code (XXXX-XXXX)
  user_id          TEXT REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | denied | used
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,
  last_polled_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cli_device_user_code ON cli_device_codes(user_code)
