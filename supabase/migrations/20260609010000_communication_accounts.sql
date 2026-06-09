create table if not exists connected_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  project_id uuid,
  board_id uuid,
  owner_user_id uuid not null,
  kind text not null check (kind in ('social', 'email')),
  provider text not null,
  provider_account_id text,
  display_name text not null,
  handle text,
  email text,
  avatar_url text,
  homepage_url text,
  status text not null default 'pending' check (status in ('connected', 'expired', 'revoked', 'error', 'disabled', 'pending')),
  scopes text[] not null default '{}',
  capabilities text[] not null default '{}',
  credential_ref text not null,
  metadata jsonb not null default '{}',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists connected_accounts_provider_identity_idx
on connected_accounts(provider, provider_account_id)
where provider_account_id is not null;

create index if not exists connected_accounts_owner_kind_idx
on connected_accounts(owner_user_id, kind);

create table if not exists account_permission_grants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references connected_accounts(id) on delete cascade,
  principal_type text not null check (principal_type in ('user', 'agent', 'workflow', 'plugin')),
  principal_id text not null,
  permissions text[] not null default '{}',
  policy jsonb not null default '[]',
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists account_permission_grants_principal_idx
on account_permission_grants(principal_type, principal_id)
where revoked_at is null;

create table if not exists account_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references connected_accounts(id) on delete set null,
  provider text not null,
  kind text not null check (kind in ('social', 'email')),
  principal_type text not null check (principal_type in ('user', 'agent', 'workflow', 'plugin')),
  principal_id text not null,
  action text not null,
  decision text not null check (decision in ('allow', 'approval_required', 'deny')),
  risk_score numeric not null default 0 check (risk_score >= 0 and risk_score <= 1),
  request_preview jsonb not null default '{}',
  result_preview jsonb not null default '{}',
  correlation_id text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists account_audit_events_account_created_idx
on account_audit_events(account_id, created_at desc);

create index if not exists account_audit_events_principal_created_idx
on account_audit_events(principal_type, principal_id, created_at desc);

create table if not exists email_message_cache (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references connected_accounts(id) on delete cascade,
  provider_message_id text not null,
  thread_id text,
  subject text,
  from_address text,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  snippet text,
  labels text[] not null default '{}',
  has_attachments boolean not null default false,
  received_at timestamptz,
  sent_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, provider_message_id)
);

create index if not exists email_message_cache_account_received_idx
on email_message_cache(account_id, received_at desc);

create table if not exists social_post_cache (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references connected_accounts(id) on delete cascade,
  provider_post_id text,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'published', 'deleted', 'failed')),
  text text,
  media jsonb not null default '[]',
  url text,
  published_at timestamptz,
  created_by_principal_type text check (created_by_principal_type in ('user', 'agent', 'workflow', 'plugin')),
  created_by_principal_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_post_cache_account_created_idx
on social_post_cache(account_id, created_at desc);
