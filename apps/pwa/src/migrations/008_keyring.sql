-- The keyring (`logicsrc keyring`): SSH keys and other key pairs, synced to the
-- account. Additive only. Zero-knowledge like opencreds: meta is OpenCreds
-- VaultMeta (the user key wrapped under the keyring passphrase), and each
-- entry's private key is an AES-GCM envelope under that user key. The public
-- half (name, type, public key, fingerprint, comment) is stored in the clear
-- on purpose: it is public, and the web page lists it without a passphrase.

CREATE TABLE IF NOT EXISTS keyring_vaults (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  meta        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- envelope NULL + deleted_at set = a tombstone, kept so the removal reaches
-- every other machine. updated_at is the client's clock (ms), used for
-- last-writer-wins.
CREATE TABLE IF NOT EXISTS keyring_entries (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id           TEXT NOT NULL,
  name         TEXT NOT NULL,
  key_type     TEXT NOT NULL,
  filename     TEXT NOT NULL,
  public_key   TEXT NOT NULL,
  fingerprint  TEXT NOT NULL,
  comment      TEXT NOT NULL DEFAULT '',
  envelope     TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_keyring_entries_user ON keyring_entries(user_id, updated_at);
