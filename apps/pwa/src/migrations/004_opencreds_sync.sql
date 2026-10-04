-- The personal vault (`logicsrc vault`, OpenCreds), synced to the account.
-- Zero-knowledge like credshare: meta holds only key material wrapped under
-- the master password, folders and items are AES-GCM ciphertext under the
-- vault's user key. The server can count items and read their type code
-- (OpenCreds security.md accepts that), and nothing else.

-- One vault per user. meta_revision / folders_revision are optimistic locks:
-- a write names the revision it was based on and loses if someone moved it.
CREATE TABLE IF NOT EXISTS opencreds_vaults (
  user_id           TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  meta              TEXT NOT NULL,
  meta_revision     INTEGER NOT NULL,
  folders           TEXT,
  folders_revision  INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- One row per item, as the spec asks. envelope NULL is a tombstone (purged),
-- kept so the purge reaches every other machine. seq orders changes per user
-- for incremental pulls.
CREATE TABLE IF NOT EXISTS opencreds_items (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          TEXT NOT NULL,
  type        INTEGER,
  envelope    TEXT,
  revision    INTEGER NOT NULL,
  seq         INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_opencreds_items_seq ON opencreds_items(user_id, seq);
