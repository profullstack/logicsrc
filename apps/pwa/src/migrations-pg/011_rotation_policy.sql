-- Postgres copy of migrations/011_rotation_policy.sql (INTEGER -> bigint). Additive only.
-- 90-day rotation policy: due automatic secrets are queued as one run awaiting
-- owner/admin approval; rotation_auto_approve (paid add-on) skips the click.
ALTER TABLE credshare_teams ADD COLUMN IF NOT EXISTS rotation_max_age_days integer;
ALTER TABLE credshare_teams ADD COLUMN IF NOT EXISTS rotation_auto_approve integer NOT NULL DEFAULT 0;
ALTER TABLE credshare_rotation_runs ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE credshare_rotation_runs ADD COLUMN IF NOT EXISTS approved_at bigint;
