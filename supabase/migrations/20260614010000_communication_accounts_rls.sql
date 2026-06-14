-- Enable Row Level Security on communication account tables
-- These tables were created without RLS in 20260609010000_communication_accounts.sql

ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_permission_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_message_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_cache ENABLE ROW LEVEL SECURITY;

-- connected_accounts: users can only access their own accounts
CREATE POLICY "Users can view own connected accounts"
  ON connected_accounts FOR SELECT
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can insert own connected accounts"
  ON connected_accounts FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can update own connected accounts"
  ON connected_accounts FOR UPDATE
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can delete own connected accounts"
  ON connected_accounts FOR DELETE
  USING (auth.uid() = owner_user_id);

-- account_permission_grants: access through connected_accounts ownership
CREATE POLICY "Users can view grants for own accounts"
  ON account_permission_grants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM connected_accounts
      WHERE connected_accounts.id = account_permission_grants.account_id
        AND connected_accounts.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage grants for own accounts"
  ON account_permission_grants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM connected_accounts
      WHERE connected_accounts.id = account_permission_grants.account_id
        AND connected_accounts.owner_user_id = auth.uid()
    )
  );

-- account_audit_events: read-only access through connected_accounts ownership
CREATE POLICY "Users can view audit events for own accounts"
  ON account_audit_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM connected_accounts
      WHERE connected_accounts.id = account_audit_events.account_id
        AND connected_accounts.owner_user_id = auth.uid()
    )
  );

-- email_message_cache: access through connected_accounts ownership
CREATE POLICY "Users can view emails for own accounts"
  ON email_message_cache FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM connected_accounts
      WHERE connected_accounts.id = email_message_cache.account_id
        AND connected_accounts.owner_user_id = auth.uid()
    )
  );

-- social_post_cache: access through connected_accounts ownership
CREATE POLICY "Users can view posts for own accounts"
  ON social_post_cache FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM connected_accounts
      WHERE connected_accounts.id = social_post_cache.account_id
        AND connected_accounts.owner_user_id = auth.uid()
    )
  );
