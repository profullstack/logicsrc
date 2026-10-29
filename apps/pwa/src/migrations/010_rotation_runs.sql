-- Key rotation runs queued from the Rotation page (or the API / MCP) and
-- executed by a CLI or agent with `logicsrc teams rotate-keys --from-queue`.
--
-- The server never sees a secret value (E2E rule): a run records WHICH keys to
-- rotate and how (dry run or approved, desktop host, propagate), and later the
-- runner's per-key outcome (statuses, vault and site names, errors), never a
-- value. Additive only.
CREATE TABLE IF NOT EXISTS credshare_rotation_runs (
  id            TEXT PRIMARY KEY,
  team_id       TEXT NOT NULL REFERENCES credshare_teams(id) ON DELETE CASCADE,
  requested_by  TEXT NOT NULL REFERENCES users(id),
  keys          TEXT NOT NULL,              -- JSON array of key names
  project       TEXT,
  env           TEXT,
  approve       INTEGER NOT NULL DEFAULT 0, -- 0 = dry run
  options       TEXT,                       -- JSON: { desktop?, propagate?, allowRoll? }
  status        TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | failed | cancelled
  claimed_by    TEXT,                       -- api key id or user id of the runner
  claimed_at    INTEGER,
  finished_at   INTEGER,
  summary       TEXT,
  results       TEXT,                       -- JSON array of per-key results (never values)
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rotation_runs_team ON credshare_rotation_runs(team_id, status, created_at);
