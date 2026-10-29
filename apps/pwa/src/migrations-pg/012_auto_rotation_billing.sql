-- Postgres copy of migrations/012_auto_rotation_billing.sql (INTEGER -> bigint). Additive only.
-- Paid automatic rotation: a CoinPay checkout buys 30 days of rotation_auto_approve
-- for one team; NULL paid_until = flipped by hand, never expires.
-- No inline comments: the pg shim joins lines.
ALTER TABLE credshare_teams ADD COLUMN IF NOT EXISTS rotation_auto_paid_until bigint;
ALTER TABLE credshare_teams ADD COLUMN IF NOT EXISTS rotation_auto_reminded_for bigint;
CREATE TABLE IF NOT EXISTS rotation_payments (
  checkout_session_id TEXT PRIMARY KEY,
  payment_id          TEXT,
  team_id             TEXT NOT NULL REFERENCES credshare_teams(id) ON DELETE CASCADE,
  user_id             TEXT,
  amount_usd          double precision,
  method              TEXT,
  days                bigint NOT NULL,
  paid_until          bigint,
  created_at          bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rotation_payments_team ON rotation_payments(team_id, created_at);
