-- Hardening after the 2026-10-27 dev2 incident (a stolen lsk_ user token and identity key).
--
-- * credshare_audit gains ip + user_agent, so every read of a vault key or of a
--   vault's ciphertext can be traced to where it came from.
-- * credshare_vaults.key_version counts re-keys. A grant read returns it and a
--   write that names an older one is refused, so a push that fetched the vault
--   key just before a re-key cannot land ciphertext under the retired key.
-- * credshare_key_challenges: replacing a registered identity public key needs
--   proof of the CURRENT secret key (a random answer sealed to it), so a stolen
--   API token alone can no longer swap in an attacker's key ("last login wins").
-- * Session tokens are stored as sha256 hex, like API keys already are. The
--   raw-token rows are hashed in place; CLI auth codes live 5 minutes, so the
--   few in flight are dropped instead.
ALTER TABLE credshare_audit ADD COLUMN ip TEXT;
ALTER TABLE credshare_audit ADD COLUMN user_agent TEXT;
CREATE INDEX IF NOT EXISTS idx_credshare_audit_team ON credshare_audit(team_id, created_at DESC);
ALTER TABLE credshare_vaults ADD COLUMN key_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS credshare_key_challenges (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key  TEXT NOT NULL,
  answer_hash TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_key_challenges_user ON credshare_key_challenges(user_id);

-- SQLite has no sha256(): local dev databases just sign everyone out.
DELETE FROM sessions;
DELETE FROM cli_auth_codes;
