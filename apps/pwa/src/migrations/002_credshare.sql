-- LogicSRC credential sharing — teams, vaults, and end-to-end-encrypted secrets.
-- Zero-knowledge: only ciphertext, per-member sealed vault keys, and member
-- identity public keys are stored. Members are the app's `users`.

-- A member's X25519 identity public key (one per user; the secret key stays on
-- their device in ~/.logicsrc/identity.json and is never uploaded).
CREATE TABLE IF NOT EXISTS credshare_keys (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  public_key  TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credshare_teams (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credshare_members (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL REFERENCES credshare_teams(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member',   -- owner | admin | member
  status      TEXT NOT NULL DEFAULT 'invited',  -- active | invited
  invited_by  TEXT REFERENCES users(id),
  joined_at   INTEGER,
  created_at  INTEGER NOT NULL,
  UNIQUE(team_id, email)
);
CREATE INDEX IF NOT EXISTS idx_credshare_members_team ON credshare_members(team_id);
CREATE INDEX IF NOT EXISTS idx_credshare_members_user ON credshare_members(user_id);

CREATE TABLE IF NOT EXISTS credshare_invites (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL REFERENCES credshare_teams(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member',
  token_hash  TEXT NOT NULL UNIQUE,
  created_by  TEXT NOT NULL REFERENCES users(id),
  expires_at  INTEGER NOT NULL,
  accepted_at INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credshare_vaults (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL REFERENCES credshare_teams(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  UNIQUE(team_id, name)
);

-- Vault data-encryption key sealed to a member's public key (one row per member).
CREATE TABLE IF NOT EXISTS credshare_vault_grants (
  vault_id    TEXT NOT NULL REFERENCES credshare_vaults(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wrapped_dek TEXT NOT NULL,
  granted_by  TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (vault_id, user_id)
);

-- Encrypted secrets (ciphertext + nonce decrypt only with the vault DEK, which
-- the server never sees). fingerprint is a salted hash for redacted diffs.
CREATE TABLE IF NOT EXISTS credshare_secrets (
  vault_id    TEXT NOT NULL REFERENCES credshare_vaults(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  nonce       TEXT NOT NULL,
  ciphertext  TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  version     INTEGER NOT NULL,
  updated_by  TEXT NOT NULL REFERENCES users(id),
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (vault_id, name)
);

CREATE TABLE IF NOT EXISTS credshare_audit (
  id            TEXT PRIMARY KEY,
  team_id       TEXT,
  vault_id      TEXT,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  action        TEXT NOT NULL,
  key_name      TEXT,
  fingerprint   TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credshare_audit_vault ON credshare_audit(vault_id, created_at DESC);
