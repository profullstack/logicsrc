-- LogicSRC credentials app — auth schema (libSQL / SQLite).
-- Ported from the moshcode PWA auth stack: email/password, passkeys, CoinPay
-- OAuth, server sessions, and CLI API keys.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE,
  password_hash TEXT,                 -- null when the user only uses passkey / coinpay
  coinpay_sub   TEXT UNIQUE,          -- subject from "sign in with CoinPay"
  display_name  TEXT,
  created_at    INTEGER NOT NULL
);

-- WebAuthn / passkey credentials
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id            TEXT PRIMARY KEY,     -- credential id (base64url)
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key    TEXT NOT NULL,        -- base64url COSE public key
  counter       INTEGER NOT NULL DEFAULT 0,
  transports    TEXT,                 -- json array
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_credentials(user_id);

-- server-side sessions (revocable cookie tokens)
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

-- API keys (lsk_…) for the logicsrc CLI to authenticate
CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT,
  token_hash   TEXT NOT NULL,         -- sha256 of the key; prefix stored for display
  prefix       TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_apikeys_user ON api_keys(user_id);

-- Short-lived authorization codes for `logicsrc login` (loopback PKCE flow).
CREATE TABLE IF NOT EXISTS cli_auth_codes (
  code           TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_challenge TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  name           TEXT,
  used           INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL
);
