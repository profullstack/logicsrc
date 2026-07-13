-- LogicSRC team credential sharing (end-to-end encrypted).
--
-- The server is a zero-knowledge relay for secret VALUES: it stores member
-- public keys, per-member wrapped vault keys (sealed to those public keys), and
-- secret ciphertext + nonces. It never receives a plaintext secret or a vault
-- data-encryption key. The commandboard-api service uses the SERVICE ROLE key
-- and enforces membership authorization in application code. RLS here is
-- deny-by-default defense-in-depth for any non-service (anon/authenticated)
-- access path.

create extension if not exists "citext";

-- Members (identified by email) and their identity public keys.
create table if not exists credshare_users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  public_key text,
  created_at timestamptz not null default now()
);

-- Short-lived email login codes (stored hashed).
create table if not exists credshare_login_codes (
  email citext primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Issued API bearer tokens (stored hashed).
create table if not exists credshare_tokens (
  token_hash text primary key,
  user_id uuid not null references credshare_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists credshare_tokens_user_idx on credshare_tokens(user_id);

create table if not exists credshare_teams (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  name text not null,
  created_by uuid not null references credshare_users(id),
  created_at timestamptz not null default now()
);

create table if not exists credshare_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references credshare_teams(id) on delete cascade,
  user_id uuid references credshare_users(id) on delete set null,
  email citext not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'invited' check (status in ('active', 'invited')),
  invited_by uuid references credshare_users(id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id, email)
);
create index if not exists credshare_members_user_idx on credshare_members(user_id) where user_id is not null;
create index if not exists credshare_members_team_idx on credshare_members(team_id);

create table if not exists credshare_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references credshare_teams(id) on delete cascade,
  email citext not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  token_hash text not null unique,
  created_by uuid not null references credshare_users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists credshare_invites_team_idx on credshare_invites(team_id);

create table if not exists credshare_vaults (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references credshare_teams(id) on delete cascade,
  name citext not null,
  created_by uuid not null references credshare_users(id),
  created_at timestamptz not null default now(),
  unique (team_id, name)
);

-- Vault data-encryption key, sealed to each member's public key (one row per member).
create table if not exists credshare_vault_grants (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references credshare_vaults(id) on delete cascade,
  user_id uuid not null references credshare_users(id) on delete cascade,
  wrapped_dek text not null,
  granted_by uuid not null references credshare_users(id),
  created_at timestamptz not null default now(),
  unique (vault_id, user_id)
);

-- Encrypted secrets. `ciphertext`/`nonce` decrypt only with the vault DEK, which
-- the server never sees. `fingerprint` is a salted hash used for redacted diffs.
create table if not exists credshare_secrets (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references credshare_vaults(id) on delete cascade,
  name text not null,
  nonce text not null,
  ciphertext text not null,
  fingerprint text not null,
  version integer not null default 1,
  updated_by uuid not null references credshare_users(id),
  updated_at timestamptz not null default now(),
  unique (vault_id, name)
);

create table if not exists credshare_audit (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references credshare_teams(id) on delete set null,
  vault_id uuid references credshare_vaults(id) on delete set null,
  actor_user_id uuid not null references credshare_users(id),
  action text not null,
  key_name text,
  fingerprint text,
  created_at timestamptz not null default now()
);
create index if not exists credshare_audit_vault_idx on credshare_audit(vault_id, created_at desc);

-- Deny-by-default RLS: only the service role (which bypasses RLS) may touch
-- these tables. No anon/authenticated policies are defined, so every non-service
-- request is denied. Confidentiality of secret values comes from E2E encryption,
-- not from RLS.
alter table credshare_users enable row level security;
alter table credshare_login_codes enable row level security;
alter table credshare_tokens enable row level security;
alter table credshare_teams enable row level security;
alter table credshare_members enable row level security;
alter table credshare_invites enable row level security;
alter table credshare_vaults enable row level security;
alter table credshare_vault_grants enable row level security;
alter table credshare_secrets enable row level security;
alter table credshare_audit enable row level security;
