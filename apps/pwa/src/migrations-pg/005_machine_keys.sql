-- Machine API keys: headless credentials for deploy boxes and CI.
--
-- A 'user' key is what `logicsrc login` mints: it acts as the person, with the
-- person's identity key. A 'machine' key is created on purpose, is scoped to
-- one team (and optionally a list of vault names), is read-only unless asked
-- otherwise, may expire, and carries its OWN identity public key, registered by
-- the machine on first use. Vault keys are sealed to that public key in
-- credshare_key_grants, so a machine never holds a person's secret key and a
-- revoked machine key reads nothing.
--
-- read_only defaults to 0 so every existing (person) key keeps writing; the
-- app sets it to 1 for a machine key unless --read-write is asked for.
ALTER TABLE api_keys ADD COLUMN kind TEXT NOT NULL DEFAULT 'user';
ALTER TABLE api_keys ADD COLUMN team_id TEXT;
ALTER TABLE api_keys ADD COLUMN vault_scope TEXT;
ALTER TABLE api_keys ADD COLUMN read_only bigint NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN expires_at bigint;
ALTER TABLE api_keys ADD COLUMN public_key TEXT;
ALTER TABLE credshare_audit ADD COLUMN actor_key_id TEXT;

CREATE TABLE IF NOT EXISTS credshare_key_grants (
  vault_id    TEXT NOT NULL REFERENCES credshare_vaults(id) ON DELETE CASCADE,
  api_key_id  TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  wrapped_dek TEXT NOT NULL,
  granted_by  TEXT NOT NULL REFERENCES users(id),
  created_at  bigint NOT NULL,
  PRIMARY KEY (vault_id, api_key_id)
);
CREATE INDEX IF NOT EXISTS idx_key_grants_key ON credshare_key_grants(api_key_id);
