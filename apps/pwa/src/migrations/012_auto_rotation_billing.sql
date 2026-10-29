-- Paid automatic rotation (Anthony, 2026-10-29: $29 per team per 30 days).
--
-- A CoinPay checkout buys 30 days of rotation_auto_approve for one team.
-- rotation_auto_paid_until is when the paid days end: NULL means the switch was
-- flipped by hand and never expires. The hourly sweep turns the switch off once
-- that time passes, and emails the team's owners and admins a renewal link 3
-- days before (rotation_auto_reminded_for = the paid_until it reminded about).
-- rotation_payments is the idempotency ledger: one row per checkout session.
-- Additive only.
ALTER TABLE credshare_teams ADD COLUMN rotation_auto_paid_until INTEGER;
ALTER TABLE credshare_teams ADD COLUMN rotation_auto_reminded_for INTEGER;
CREATE TABLE IF NOT EXISTS rotation_payments (
  checkout_session_id TEXT PRIMARY KEY,
  payment_id          TEXT,
  team_id             TEXT NOT NULL REFERENCES credshare_teams(id) ON DELETE CASCADE,
  user_id             TEXT,
  amount_usd          REAL,
  method              TEXT,
  days                INTEGER NOT NULL,
  paid_until          INTEGER,
  created_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rotation_payments_team ON rotation_payments(team_id, created_at);
