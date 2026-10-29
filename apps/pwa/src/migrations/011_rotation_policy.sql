-- 90-day rotation policy (Anthony, 2026-10-29).
--
-- Every automatic secret older than the team's max age (NULL = 90 days) is
-- queued as one run that waits for an owner or admin to approve it
-- (status 'awaiting-approval'). rotation_auto_approve is the paid add-on:
-- when 1, due runs are queued already approved and rotate without a click.
-- approved_by / approved_at record who said yes. Additive only.
ALTER TABLE credshare_teams ADD COLUMN rotation_max_age_days INTEGER;
ALTER TABLE credshare_teams ADD COLUMN rotation_auto_approve INTEGER NOT NULL DEFAULT 0;
ALTER TABLE credshare_rotation_runs ADD COLUMN approved_by TEXT;
ALTER TABLE credshare_rotation_runs ADD COLUMN approved_at INTEGER;
