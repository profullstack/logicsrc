-- A revocable, read-only share link for the PUBLIC halves of a person's SSH
-- keys (GET /k/<token>.json and /k/<token>.keys). One per user. Only
-- sha256(token) is stored, like sessions and API keys: the token is shown once,
-- on create or rotate. Revoking deletes the row. Additive only.

CREATE TABLE IF NOT EXISTS keyring_shares (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  rotated_at  INTEGER
);
