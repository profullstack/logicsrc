-- Converted from SQLite by @profullstack/libsql-pg. Review every TODO before applying.
-- Types: INTEGER -> bigint, REAL -> double precision, BLOB -> bytea, BOOLEAN -> boolean,
-- DATETIME/TIMESTAMP -> timestamptz, TEXT -> text; INTEGER PRIMARY KEY -> identity.

create table if not exists credshare_keys (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  public_key text NOT NULL,
  updated_at bigint NOT NULL
);

create table if not exists credshare_teams (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_by text NOT NULL REFERENCES users(id),
  created_at bigint NOT NULL
);

create table if not exists credshare_members (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES credshare_teams(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'invited',
  invited_by text REFERENCES users(id),
  joined_at bigint,
  created_at bigint NOT NULL,
  UNIQUE(team_id, email)
);

CREATE INDEX IF NOT EXISTS idx_credshare_members_team ON credshare_members(team_id);

CREATE INDEX IF NOT EXISTS idx_credshare_members_user ON credshare_members(user_id);

create table if not exists credshare_invites (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES credshare_teams(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  token_hash text NOT NULL UNIQUE,
  created_by text NOT NULL REFERENCES users(id),
  expires_at bigint NOT NULL,
  accepted_at bigint,
  created_at bigint NOT NULL
);

create table if not exists credshare_vaults (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES credshare_teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by text NOT NULL REFERENCES users(id),
  created_at bigint NOT NULL,
  UNIQUE(team_id, name)
);

create table if not exists credshare_vault_grants (
  vault_id text NOT NULL REFERENCES credshare_vaults(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wrapped_dek text NOT NULL,
  granted_by text NOT NULL REFERENCES users(id),
  created_at bigint NOT NULL,
  PRIMARY KEY (vault_id, user_id)
);

create table if not exists credshare_secrets (
  vault_id text NOT NULL REFERENCES credshare_vaults(id) ON DELETE CASCADE,
  name text NOT NULL,
  nonce text NOT NULL,
  ciphertext text NOT NULL,
  fingerprint text NOT NULL,
  version bigint NOT NULL,
  updated_by text NOT NULL REFERENCES users(id),
  updated_at bigint NOT NULL,
  PRIMARY KEY (vault_id, name)
);

create table if not exists credshare_audit (
  id text PRIMARY KEY,
  team_id text,
  vault_id text,
  actor_user_id text NOT NULL REFERENCES users(id),
  action text NOT NULL,
  key_name text,
  fingerprint text,
  created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credshare_audit_vault ON credshare_audit(vault_id, created_at DESC);
